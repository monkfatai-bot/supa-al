/**
 * Supa AI — Abstract voice provider interface + shared base class (Phase 8).
 *
 * Every concrete voice provider (OpenAI, ElevenLabs, Google, Azure,
 * Deepgram, AssemblyAI, Cartesia, PlayHT) implements the methods it
 * supports. The {@link VoiceProvider} interface declares all five
 * operations (synthesize, transcribe, translate, dub, clone) plus
 * {@link listModels}; concrete providers throw {@link AIProviderError} for
 * the methods they don't support so the caller gets a consistent error
 * shape.
 *
 * Server-only.
 *
 * @module @/lib/ai/voice-base
 */
import "server-only";

import { AIProviderError, toAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import type {
  CloneRequest,
  CloneResult,
  DubRequest,
  DubResult,
  SynthesizeRequest,
  SynthesizeResult,
  TranscribeRequest,
  TranscribeResult,
  TranslateRequest,
  TranslateResult,
  VoiceModelInfo,
  VoiceProviderCapabilities,
  VoiceProviderId,
} from "./voice-types";

/** The contract every concrete voice provider satisfies. */
export interface VoiceProvider {
  readonly id: VoiceProviderId;
  /** Static capability flags (true for each supported operation). */
  readonly capabilities: VoiceProviderCapabilities;
  /** Text-to-speech. */
  synthesize(req: SynthesizeRequest): Promise<SynthesizeResult>;
  /** Speech-to-text. */
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
  /** Translate the audio's spoken language into a target language (text). */
  translate(req: TranslateRequest): Promise<TranslateResult>;
  /** Dub the audio into a target language (audio out). */
  dub(req: DubRequest): Promise<DubResult>;
  /** Clone a voice from a sample audio clip. */
  clone(req: CloneRequest): Promise<CloneResult>;
  /** Static catalog of models offered by this provider. */
  listModels(): Promise<VoiceModelInfo[]>;
}

/**
 * Shared helpers for concrete voice providers. Subclasses implement the
 * methods they support; the others throw {@link AIProviderError} with an
 * actionable "not supported" message.
 */
export abstract class BaseVoiceProvider implements VoiceProvider {
  abstract readonly id: VoiceProviderId;
  abstract readonly capabilities: VoiceProviderCapabilities;

  async synthesize(_req: SynthesizeRequest): Promise<SynthesizeResult> {
    throw this.unsupported("synthesize");
  }

  async transcribe(_req: TranscribeRequest): Promise<TranscribeResult> {
    throw this.unsupported("transcribe");
  }

  async translate(_req: TranslateRequest): Promise<TranslateResult> {
    throw this.unsupported("translate");
  }

  async dub(_req: DubRequest): Promise<DubResult> {
    throw this.unsupported("dub");
  }

  async clone(_req: CloneRequest): Promise<CloneResult> {
    throw this.unsupported("clone");
  }

  abstract listModels(): Promise<VoiceModelInfo[]>;

  // -------------------------------------------------------------------
  // Helpers shared by subclasses
  // -------------------------------------------------------------------

  /**
   * Normalize any thrown value into an {@link AIProviderError}. Subclasses
   * call this from their try/catch blocks so the caller never sees a raw
   * SDK error.
   */
  protected normalizeError(
    err: unknown,
    context?: Record<string, unknown>,
  ): AIProviderError {
    const appErr = toAppError(err);
    if (appErr instanceof AIProviderError) {
      return appErr;
    }
    const sdkErr = err as {
      status?: number;
      message?: string;
      error?: { message?: string };
    };
    const message = sdkErr?.error?.message ?? sdkErr?.message ?? appErr.message;
    const status = sdkErr?.status;
    return new AIProviderError(
      `${this.id} voice provider error: ${message}`,
      {
        provider: this.id,
        status,
        ...context,
        cause: String(err),
      },
    );
  }

  /** Build an "operation not supported by this provider" error. */
  protected unsupported(op: string): AIProviderError {
    logger.debug("voice provider operation unsupported", {
      provider: this.id,
      op,
    });
    return new AIProviderError(
      `${this.id} does not support the "${op}" operation.`,
      { provider: this.id, op },
    );
  }
}
