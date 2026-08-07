/**
 * Supa AI — Voice orchestration service (Phase 8).
 *
 * The single entry point for AI voice operations. Orchestrates:
 *
 *   - Resolving the voice provider (lazy-init + cached via
 *     {@link voiceManager}).
 *   - Persisting a `voice_generations` row (status='pending') before the
 *     call so we have an audit trail even on failure.
 *   - Calling the provider's TTS / STT / translate / dub / clone method.
 *   - Uploading the result audio (TTS / dub) to Supabase Storage
 *     `ai-assets` bucket and recording the public/signed URL.
 *   - Recording the transcript (STT / translate) into `voice_transcripts`.
 *   - Updating the generation row's `status` + `result_url` + `duration`
 *     on success, or `status='failed'` + `error` on failure.
 *   - For long-running ops (translate, dub, clone), creating a `voice_jobs`
 *     row, scheduling the background processor via {@link
 *     scheduleBackgroundJob}, and returning the job id immediately so the
 *     caller can poll for status.
 *   - Incrementing the daily `voice_usage` rollup.
 *
 * Constructed with the **admin** Supabase client so writes succeed before
 * the `workspaces` table ships in Phase 9A.
 *
 * @module @/lib/voice/voice-service
 */
import "server-only";

import {
  AIProviderError,
  ConfigurationError,
  NotFoundError,
  PaymentError,
  toAppError,
  ValidationError,
} from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AdminSupabaseClient } from "@/lib/supabase/admin";
import { voiceManager } from "@/lib/ai/voice-manager";
import type {
  VoiceProviderId,
} from "@/lib/ai/voice-types";

import { createAudioUploadService, type AudioUploadService } from "./audio-upload";
import { createVoiceAudioStorage, type VoiceAudioStorage } from "./audio-storage";
import { createHistoryService, type HistoryService } from "./history";
import { createTranscriptService, type TranscriptService } from "./transcript";
import { createProfileService, type ProfileService } from "./profile";
import {
  createJobQueueService,
  scheduleBackgroundJob,
  type JobQueueService,
} from "./job-queue";
import { createUsageService, type UsageService } from "./usage";
import type {
  AudioUpload,
  CloneInput,
  DubInput,
  SynthesizeInput,
  TranscribeInput,
  TranslateInput,
  VoiceGeneration,
  VoiceJob,
  VoiceProfile,
  VoiceTranscript,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Estimated credits consumed per TTS / STT / translate / dub / clone call.
 *  Phase 8 ships a flat per-call cost; Phase 9+ can swap in a model-aware
 *  cost table (mirroring the chat `modelManager.computeCostCents`). */
const CREDITS_BY_TYPE = {
  tts: 1,
  stt: 2,
  translate: 3,
  dub: 5,
  clone: 10,
} as const;

/** Maximum input text length (mirrors the Zod schema). */
const MAX_TTS_TEXT = 12_000;

// ---------------------------------------------------------------------------
// Service class
// ---------------------------------------------------------------------------

export class VoiceService {
  constructor(
    private readonly supabase: AdminSupabaseClient,
    private readonly audioStorage: VoiceAudioStorage,
    private readonly audioUploads: AudioUploadService,
    private readonly history: HistoryService,
    private readonly transcripts: TranscriptService,
    private readonly profiles: ProfileService,
    private readonly jobs: JobQueueService,
    private readonly usage: UsageService,
  ) {}

  // -----------------------------------------------------------------------
  // TTS — synthesize
  // -----------------------------------------------------------------------

  /**
   * Synthesize speech from text. Persists a generation row, calls the
   * provider's `synthesize()`, uploads the resulting audio bytes to the
   * `ai-assets` bucket, generates a short-lived signed URL, and updates
   * the generation row with the result.
   */
  async synthesize(input: SynthesizeInput): Promise<{
    generation: VoiceGeneration;
    audioUrl: string;
  }> {
    if (!input.text.trim()) {
      throw new ValidationError("Text must not be empty.");
    }
    if (input.text.length > MAX_TTS_TEXT) {
      throw new ValidationError(
        `Text exceeds the ${MAX_TTS_TEXT} character limit.`,
      );
    }

    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.defaultModel(provider);

    // Persist the generation row first so we have an audit trail.
    const generation = await this.history.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      model,
      type: "tts",
      text: input.text,
      voice_id: input.voiceId,
      language: input.language ?? null,
      status: "processing",
      credits_consumed: CREDITS_BY_TYPE.tts,
      metadata: (input.settings ?? null) as never,
    });

    try {
      const result = await voiceManager
        .getProvider(provider)
        .synthesize({
          text: input.text,
          model,
          voiceId: input.voiceId,
          language: input.language,
          format: (input.format as never) ?? undefined,
          settings: (input.settings as never) ?? undefined,
        });

      // Upload the audio bytes to Supabase Storage.
      const filename = `tts-${generation.id}.${result.format}`;
      const upload = await this.audioStorage.uploadGenerated(
        input.userId,
        result.audio,
        result.mimeType,
        filename,
      );
      const audioUrl = await this.audioStorage.getSignedUrl(upload.path, 3600);

      // Update the generation row with the result.
      const updated = await this.history.update(
        input.workspaceId,
        generation.id,
        {
          status: "completed",
          result_url: audioUrl,
          result_storage_path: upload.path,
          duration: result.durationMs ?? null,
          metadata: {
            ...(input.settings ?? {}),
            format: result.format,
            sampleRate: result.sampleRate,
            mimeType: result.mimeType,
          } as never,
        },
      );

      // Increment usage (best-effort — never blocks the response).
      void this.usage.increment(
        input.workspaceId,
        input.userId,
        "tts",
        CREDITS_BY_TYPE.tts,
      );

      return { generation: updated, audioUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.history.update(input.workspaceId, generation.id, {
        status: "failed",
        error: message,
      }).catch(() => undefined);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // STT — transcribe
  // -----------------------------------------------------------------------

  /**
   * Transcribe an uploaded audio file. Returns the transcript text +
   * the persisted generation + transcript rows.
   */
  async transcribe(input: TranscribeInput): Promise<{
    generation: VoiceGeneration;
    transcript: VoiceTranscript;
  }> {
    const audioUpload = await this.audioUploads.require(
      input.workspaceId,
      input.audioUploadId,
    );
    if (audioUpload.user_id !== input.userId) {
      throw new ValidationError(
        "Audio upload does not belong to the requesting user.",
      );
    }

    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.defaultModel(provider);
    if (!this.capabilitySupported(provider, "stt")) {
      throw new ValidationError(
        `Provider "${input.provider}" does not support speech-to-text.`,
      );
    }

    const generation = await this.history.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      model,
      type: "stt",
      source_audio_url: audioUpload.file_path,
      language: input.language ?? null,
      status: "processing",
      credits_consumed: CREDITS_BY_TYPE.stt,
      metadata: {
        speakerLabels: input.speakerLabels ?? false,
        wordTimestamps: input.wordTimestamps ?? false,
      } as never,
    });

    try {
      const audioBytes = await this.audioUploads.downloadBytes(audioUpload);
      const result = await voiceManager.getProvider(provider).transcribe({
        audio: audioBytes,
        mimeType: audioUpload.mime_type,
        model,
        language: input.language,
        speakerLabels: input.speakerLabels,
        wordTimestamps: input.wordTimestamps,
      });

      const transcript = await this.transcripts.create({
        workspace_id: input.workspaceId,
        generation_id: generation.id,
        text: result.text,
        language: result.language ?? input.language ?? null,
        confidence: result.confidence ?? null,
        segments: (result.segments ?? null) as never,
      });

      const updated = await this.history.update(
        input.workspaceId,
        generation.id,
        {
          status: "completed",
          text: result.text,
          duration: result.segments?.[result.segments.length - 1]?.end
            ? Math.round(result.segments[result.segments.length - 1].end * 1000)
            : null,
        },
      );

      void this.usage.increment(
        input.workspaceId,
        input.userId,
        "stt",
        CREDITS_BY_TYPE.stt,
      );

      return { generation: updated, transcript };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.history.update(input.workspaceId, generation.id, {
        status: "failed",
        error: message,
      }).catch(() => undefined);
      throw err;
    }
  }

  // -----------------------------------------------------------------------
  // Translate (async — runs in the background)
  // -----------------------------------------------------------------------

  /**
   * Translate the spoken language of an uploaded audio file into the
   * target language. Creates a generation + job row, schedules a
   * background processor, and returns immediately so the client can
   * poll `/api/voice/jobs/:id` for status.
   */
  async translate(input: TranslateInput): Promise<{
    generation: VoiceGeneration;
    job: VoiceJob;
  }> {
    const audioUpload = await this.audioUploads.require(
      input.workspaceId,
      input.audioUploadId,
    );
    if (audioUpload.user_id !== input.userId) {
      throw new ValidationError(
        "Audio upload does not belong to the requesting user.",
      );
    }
    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.defaultModel(provider);
    if (!this.capabilitySupported(provider, "translate")) {
      throw new ValidationError(
        `Provider "${input.provider}" does not support audio translation.`,
      );
    }

    const generation = await this.history.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      model,
      type: "translate",
      source_audio_url: audioUpload.file_path,
      language: input.targetLanguage,
      status: "pending",
      credits_consumed: CREDITS_BY_TYPE.translate,
      metadata: {
        sourceLanguage: input.sourceLanguage ?? null,
        targetLanguage: input.targetLanguage,
      } as never,
    });

    const job = await this.jobs.create({
      workspace_id: input.workspaceId,
      generation_id: generation.id,
      provider: input.provider,
      status: "pending",
    });

    scheduleBackgroundJob(input.workspaceId, job.id, this.jobs, async () => {
      await this.history.update(input.workspaceId, generation.id, {
        status: "processing",
      });
      const audioBytes = await this.audioUploads.downloadBytes(audioUpload);
      const result = await voiceManager.getProvider(provider).translate({
        audio: audioBytes,
        mimeType: audioUpload.mime_type,
        model,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
      });
      const transcript = await this.transcripts.create({
        workspace_id: input.workspaceId,
        generation_id: generation.id,
        text: result.text,
        language: result.targetLanguage,
        confidence: result.confidence ?? null,
        segments: null,
      });
      await this.history.update(input.workspaceId, generation.id, {
        status: "completed",
        text: result.text,
        metadata: {
          sourceLanguage: result.detectedSourceLanguage ?? input.sourceLanguage ?? null,
          targetLanguage: result.targetLanguage,
          transcriptId: transcript.id,
        } as never,
      });
      void this.usage.increment(
        input.workspaceId,
        input.userId,
        "translate",
        CREDITS_BY_TYPE.translate,
      );
      return null; // No result_url — translation produces text, not audio.
    });

    return { generation, job };
  }

  // -----------------------------------------------------------------------
  // Dub (async)
  // -----------------------------------------------------------------------

  async dub(input: DubInput): Promise<{ generation: VoiceGeneration; job: VoiceJob }> {
    const audioUpload = await this.audioUploads.require(
      input.workspaceId,
      input.audioUploadId,
    );
    if (audioUpload.user_id !== input.userId) {
      throw new ValidationError(
        "Audio upload does not belong to the requesting user.",
      );
    }
    const provider = this.resolveProvider(input.provider);
    const model = input.model ?? this.defaultModel(provider);
    if (!this.capabilitySupported(provider, "dub")) {
      throw new ValidationError(
        `Provider "${input.provider}" does not support dubbing.`,
      );
    }

    const generation = await this.history.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      model,
      type: "dub",
      source_audio_url: audioUpload.file_path,
      language: input.targetLanguage,
      voice_id: input.voiceId ?? null,
      status: "pending",
      credits_consumed: CREDITS_BY_TYPE.dub,
      metadata: {
        sourceLanguage: input.sourceLanguage ?? null,
        targetLanguage: input.targetLanguage,
      } as never,
    });

    const job = await this.jobs.create({
      workspace_id: input.workspaceId,
      generation_id: generation.id,
      provider: input.provider,
      status: "pending",
    });

    scheduleBackgroundJob(input.workspaceId, job.id, this.jobs, async () => {
      await this.history.update(input.workspaceId, generation.id, {
        status: "processing",
      });
      const audioBytes = await this.audioUploads.downloadBytes(audioUpload);
      const result = await voiceManager.getProvider(provider).dub({
        audio: audioBytes,
        mimeType: audioUpload.mime_type,
        model,
        sourceLanguage: input.sourceLanguage,
        targetLanguage: input.targetLanguage,
        voiceId: input.voiceId,
      });
      await this.history.update(input.workspaceId, generation.id, {
        status: "completed",
        result_url: result.url,
        duration: result.durationMs ?? null,
        metadata: {
          externalJobId: result.externalJobId ?? null,
        } as never,
      });
      void this.usage.increment(
        input.workspaceId,
        input.userId,
        "dub",
        CREDITS_BY_TYPE.dub,
      );
      return result.url;
    });

    return { generation, job };
  }

  // -----------------------------------------------------------------------
  // Clone (async)
  // -----------------------------------------------------------------------

  /**
   * Clone a voice from an uploaded sample. Creates a generation + job,
   * schedules the clone in the background, and persists a `voice_profiles`
   * row with `is_cloned=true` once the clone call succeeds.
   */
  async clone(input: CloneInput): Promise<{
    generation: VoiceGeneration;
    job: VoiceJob;
  }> {
    const audioUpload = await this.audioUploads.require(
      input.workspaceId,
      input.audioUploadId,
    );
    if (audioUpload.user_id !== input.userId) {
      throw new ValidationError(
        "Audio upload does not belong to the requesting user.",
      );
    }
    const provider = this.resolveProvider(input.provider);
    const model = this.defaultModel(provider);
    if (!this.capabilitySupported(provider, "clone")) {
      throw new ValidationError(
        `Provider "${input.provider}" does not support voice cloning.`,
      );
    }

    const generation = await this.history.create({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      provider: input.provider,
      model,
      type: "clone",
      source_audio_url: audioUpload.file_path,
      status: "pending",
      credits_consumed: CREDITS_BY_TYPE.clone,
      metadata: { name: input.name } as never,
    });

    const job = await this.jobs.create({
      workspace_id: input.workspaceId,
      generation_id: generation.id,
      provider: input.provider,
      status: "pending",
    });

    scheduleBackgroundJob(input.workspaceId, job.id, this.jobs, async () => {
      await this.history.update(input.workspaceId, generation.id, {
        status: "processing",
      });
      const audioBytes = await this.audioUploads.downloadBytes(audioUpload);
      const result = await voiceManager.getProvider(provider).clone({
        audio: audioBytes,
        mimeType: audioUpload.mime_type,
        name: input.name,
        description: input.description,
      });
      // Persist the cloned voice as a voice_profile so the caller can
      // reuse it in future TTS calls.
      const profile = await this.profiles.create({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        name: input.name,
        provider: input.provider,
        voice_id: result.voiceId,
        language: null,
        settings: null,
        is_cloned: true,
        sample_audio_url: audioUpload.file_path,
        metadata: {
          externalJobId: result.externalJobId ?? null,
          ready: result.ready,
        } as never,
      });
      await this.history.update(input.workspaceId, generation.id, {
        status: "completed",
        voice_id: result.voiceId,
        result_url: profile.sample_audio_url,
        metadata: {
          voiceId: result.voiceId,
          ready: result.ready,
          externalJobId: result.externalJobId ?? null,
          profileId: profile.id,
        } as never,
      });
      void this.usage.increment(
        input.workspaceId,
        input.userId,
        "clone",
        CREDITS_BY_TYPE.clone,
      );
      return profile.sample_audio_url;
    });

    return { generation, job };
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /** Resolve + validate a provider id; throw ConfigurationError when unset. */
  private resolveProvider(providerId: string): VoiceProviderId {
    if (!voiceManager.isConfigured(providerId)) {
      throw new ConfigurationError(
        `Voice provider "${providerId}" is not configured. Set the corresponding API key.`,
        { provider: providerId },
      );
    }
    return providerId as VoiceProviderId;
  }

  /**
   * Default model id for a provider. Pulled from the provider's static
   * catalog (`listModels()[0]`).
   */
  private defaultModel(providerId: VoiceProviderId): string {
    // Synchronous fallback: we don't await listModels() here because the
    // provider instances carry a deterministic default. Use a small
    // switch so a missing catalog never breaks a request.
    switch (providerId) {
      case "openai": return "tts-1";
      case "elevenlabs": return "eleven-multilingual-v2";
      case "google": return "gemini-2.0-flash-tts";
      case "azure": return "azure-tts";
      case "deepgram": return "nova-2";
      case "assemblyai": return "best";
      case "cartesia": return "sonic-2";
      case "playht": return "play-3";
      default:
        throw new NotFoundError("Voice provider", providerId);
    }
  }

  /** Whether a provider supports a given capability (TTS / STT / etc.). */
  private capabilitySupported(
    providerId: VoiceProviderId,
    capability: "tts" | "stt" | "translate" | "dub" | "clone",
  ): boolean {
    const provider = voiceManager.getProvider(providerId);
    return provider.capabilities[capability];
  }
}

/** Build the canonical {@link VoiceService} (server-only). */
export async function createVoiceService(): Promise<VoiceService> {
  const supabase = createSupabaseAdminClient();
  const audioStorage = await createVoiceAudioStorage();
  const audioUploads = await createAudioUploadService();
  const history = createHistoryService();
  const transcripts = createTranscriptService();
  const profiles = createProfileService();
  const jobs = createJobQueueService();
  const usage = createUsageService();
  return new VoiceService(
    supabase,
    audioStorage,
    audioUploads,
    history,
    transcripts,
    profiles,
    jobs,
    usage,
  );
}

/** Re-exported so callers can detect payment / provider errors. */
export { PaymentError, AIProviderError, toAppError, logger };
