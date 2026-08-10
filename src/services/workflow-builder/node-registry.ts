/**
 * @module workflow-builder/node-registry
 * @description Comprehensive registry of every node type available in the
 * Visual Workflow Builder.
 *
 * The registry is implemented as a singleton {@link NodeRegistry} class
 * that stores {@link NodeDefinition} records organised by
 * {@link NodeCategory}. Consumers query the registry at render-time
 * to build the palette, validate connections, and configure nodes.
 *
 * **Adding a new node type:**
 * 1. Add the definition to the corresponding `TRIGGER_NODES`,
 *    `AI_NODES`, etc. array below.
 * 2. The `NodeRegistry` constructor picks it up automatically.
 * 3. No other files need to change – the palette and validator
 *    are driven entirely by registry data.
 */

import type { NodeCategory } from '@/types/generated/database';
import type { NodeDefinition } from './types';

// ─── Shared Option Arrays ───────────────────────────────────────────────────────────────────

/** Shared select options derived from the `ConditionOperator` DB enum. */
const CONDITION_OPERATOR_OPTIONS: { label: string; value: string }[] = [
  { label: 'Equals', value: 'equals' },
  { label: 'Not Equals', value: 'not_equals' },
  { label: 'Contains', value: 'contains' },
  { label: 'Not Contains', value: 'not_contains' },
  { label: 'Greater Than', value: 'greater_than' },
  { label: 'Less Than', value: 'less_than' },
  { label: 'Greater Than or Equal', value: 'greater_than_or_equal' },
  { label: 'Less Than or Equal', value: 'less_than_or_equal' },
  { label: 'Is Empty', value: 'is_empty' },
  { label: 'Is Not Empty', value: 'is_not_empty' },
  { label: 'Exists', value: 'exists' },
  { label: 'Not Exists', value: 'not_exists' },
  { label: 'Starts With', value: 'starts_with' },
  { label: 'Ends With', value: 'ends_with' },
  { label: 'Is Boolean', value: 'is_boolean' },
  { label: 'Is True', value: 'is_true' },
  { label: 'Is False', value: 'is_false' },
];

/** Common timezone options for schedule triggers. */
const TIMEZONE_OPTIONS: { label: string; value: string }[] = [
  { label: 'UTC', value: 'UTC' },
  { label: 'US/Eastern', value: 'US/Eastern' },
  { label: 'US/Central', value: 'US/Central' },
  { label: 'US/Pacific', value: 'US/Pacific' },
  { label: 'Europe/London', value: 'Europe/London' },
  { label: 'Europe/Paris', value: 'Europe/Paris' },
  { label: 'Europe/Berlin', value: 'Europe/Berlin' },
  { label: 'Asia/Tokyo', value: 'Asia/Tokyo' },
  { label: 'Asia/Shanghai', value: 'Asia/Shanghai' },
  { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
  { label: 'Australia/Sydney', value: 'Australia/Sydney' },
  { label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' },
  { label: 'Africa/Lagos', value: 'Africa/Lagos' },
];

/** Language options for translation / OCR nodes. */
const LANGUAGE_OPTIONS: { label: string; value: string }[] = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Chinese (Simplified)', value: 'zh-CN' },
  { label: 'Chinese (Traditional)', value: 'zh-TW' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Russian', value: 'ru' },
];

// ─── Trigger Nodes ──────────────────────────────────────────────────────────────────────

const TRIGGER_NODES: NodeDefinition[] = [
  {
    type: 'manual_trigger',
    category: 'trigger',
    label: 'Manual Trigger',
    description:
      'Starts the workflow when a user clicks the run button or invokes it via API.',
    icon: 'MousePointerClick',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'schedule_trigger',
    category: 'trigger',
    label: 'Schedule Trigger',
    description:
      'Starts the workflow on a recurring schedule defined by a cron expression.',
    icon: 'Clock',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'cron_expression',
        label: 'Cron Expression',
        type: 'cron',
        placeholder: '0 * * * *',
        required: true,
        description: 'Standard 5-field cron expression (minute hour day month weekday).',
        group: 'Schedule',
      },
      {
        key: 'timezone',
        label: 'Timezone',
        type: 'select',
        required: true,
        defaultValue: 'UTC',
        options: TIMEZONE_OPTIONS,
        description: 'Timezone used to interpret the cron schedule.',
        group: 'Schedule',
      },
    ],
    defaultConfig: { cron_expression: '0 * * * *', timezone: 'UTC' },
  },
  {
    type: 'webhook_trigger',
    category: 'trigger',
    label: 'Webhook Trigger',
    description:
      'Starts the workflow when an HTTP request hits the generated webhook endpoint.',
    icon: 'Globe',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'webhook_path',
        label: 'Webhook Path',
        type: 'text',
        placeholder: '/my-webhook',
        required: true,
        description: 'Unique URL path suffix. The full URL is generated automatically.',
      },
      {
        key: 'method',
        label: 'HTTP Method',
        type: 'select',
        required: true,
        defaultValue: 'POST',
        options: [
          { label: 'GET', value: 'GET' },
          { label: 'POST', value: 'POST' },
          { label: 'PUT', value: 'PUT' },
          { label: 'DELETE', value: 'DELETE' },
        ],
      },
    ],
    defaultConfig: { webhook_path: '', method: 'POST' },
  },
  {
    type: 'api_trigger',
    category: 'trigger',
    label: 'API Trigger',
    description:
      'Starts the workflow when called via the internal or external API.',
    icon: 'Plug',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'user_trigger',
    category: 'trigger',
    label: 'User Event Trigger',
    description:
      'Starts the workflow when a specific user-related event occurs.',
    icon: 'User',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'event_type',
        label: 'Event Type',
        type: 'select',
        required: true,
        defaultValue: 'user_login',
        options: [
          { label: 'User Login', value: 'user_login' },
          { label: 'User Signup', value: 'user_signup' },
          { label: 'Profile Update', value: 'profile_update' },
        ],
      },
    ],
    defaultConfig: { event_type: 'user_login' },
  },
  {
    type: 'workspace_trigger',
    category: 'trigger',
    label: 'Workspace Event Trigger',
    description:
      'Starts the workflow when a workspace-level event fires.',
    icon: 'Users',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'event_type',
        label: 'Event Type',
        type: 'select',
        required: true,
        defaultValue: 'member_joined',
        options: [
          { label: 'Member Joined', value: 'member_joined' },
          { label: 'Member Left', value: 'member_left' },
          { label: 'Settings Updated', value: 'settings_updated' },
          { label: 'Role Changed', value: 'role_changed' },
        ],
      },
    ],
    defaultConfig: { event_type: 'member_joined' },
  },
  {
    type: 'ai_event_trigger',
    category: 'trigger',
    label: 'AI Event Trigger',
    description:
      'Starts the workflow when an AI-related event occurs.',
    icon: 'Sparkles',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'business_event_trigger',
    category: 'trigger',
    label: 'Business Event Trigger',
    description:
      'Starts the workflow when a business event fires (new lead, invoice paid, etc.).',
    icon: 'Briefcase',
    color: 'emerald',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
];

// ─── AI Nodes ───────────────────────────────────────────────────────────────────────────

const AI_NODES: NodeDefinition[] = [
  {
    type: 'ai_chat',
    category: 'ai',
    label: 'AI Chat',
    description: 'Send a prompt to a chat-completion model and receive a text response.',
    icon: 'MessageSquare',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'system_prompt',
        label: 'System Prompt',
        type: 'textarea',
        placeholder: 'You are a helpful assistant…',
        description: 'Instructions that set the behaviour and persona of the model.',
        group: 'Prompt',
      },
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Enter your prompt…',
        required: true,
        group: 'Prompt',
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        description: 'AI provider that hosts the model.',
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        description: 'Specific model to use for generation.',
        group: 'Model',
      },
      {
        key: 'temperature',
        label: 'Temperature',
        type: 'number',
        defaultValue: 0.7,
        description: 'Controls randomness (0 = deterministic, 2 = very creative).',
        group: 'Parameters',
      },
      {
        key: 'max_tokens',
        label: 'Max Tokens',
        type: 'number',
        defaultValue: 2048,
        description: 'Maximum number of tokens in the generated response.',
        group: 'Parameters',
      },
    ],
    defaultConfig: {
      prompt: '',
      system_prompt: '',
      provider: '',
      model: '',
      temperature: 0.7,
      max_tokens: 2048,
    },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'ai_image',
    category: 'ai',
    label: 'AI Image',
    description: 'Generate an image from a text prompt using a diffusion or image model.',
    icon: 'ImageIcon',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Describe the image you want to generate…',
        required: true,
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'width',
        label: 'Width (px)',
        type: 'number',
        defaultValue: 1024,
        description: 'Output image width in pixels.',
        group: 'Dimensions',
      },
      {
        key: 'height',
        label: 'Height (px)',
        type: 'number',
        defaultValue: 1024,
        description: 'Output image height in pixels.',
        group: 'Dimensions',
      },
      {
        key: 'style',
        label: 'Style',
        type: 'select',
        options: [
          { label: 'Natural', value: 'natural' },
          { label: 'Vivid', value: 'vivid' },
          { label: 'Anime', value: 'anime' },
          { label: 'Photorealistic', value: 'photorealistic' },
          { label: 'Digital Art', value: 'digital_art' },
        ],
        description: 'Visual style applied to the generated image.',
      },
    ],
    defaultConfig: {
      prompt: '',
      provider: '',
      model: '',
      width: 1024,
      height: 1024,
      style: 'natural',
    },
    estimatedCredits: 5,
    estimatedDurationMs: 15000,
  },
  {
    type: 'ai_video',
    category: 'ai',
    label: 'AI Video',
    description: 'Generate a short video clip from a text prompt.',
    icon: 'Video',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Describe the video you want to generate…',
        required: true,
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'duration',
        label: 'Duration (seconds)',
        type: 'number',
        defaultValue: 5,
        description: 'Desired video length in seconds.',
      },
    ],
    defaultConfig: { prompt: '', provider: '', model: '', duration: 5 },
    estimatedCredits: 20,
    estimatedDurationMs: 60000,
  },
  {
    type: 'ai_voice',
    category: 'ai',
    label: 'AI Voice',
    description: 'Convert text to speech using a neural TTS model.',
    icon: 'Mic',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        placeholder: 'Enter the text to synthesise…',
        required: true,
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'voice_id',
        label: 'Voice ID',
        type: 'text',
        placeholder: 'alloy',
        description: 'Identifier of the voice profile to use.',
      },
    ],
    defaultConfig: { text: '', provider: '', model: '', voice_id: '' },
    estimatedCredits: 2,
    estimatedDurationMs: 3000,
  },
  {
    type: 'ai_translation',
    category: 'ai',
    label: 'AI Translation',
    description: 'Translate text from one language to another using an LLM.',
    icon: 'Languages',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text',
        label: 'Text to Translate',
        type: 'textarea',
        placeholder: 'Enter text to translate…',
        required: true,
      },
      {
        key: 'source_language',
        label: 'Source Language',
        type: 'select',
        required: true,
        defaultValue: 'en',
        options: LANGUAGE_OPTIONS,
      },
      {
        key: 'target_language',
        label: 'Target Language',
        type: 'select',
        required: true,
        defaultValue: 'es',
        options: LANGUAGE_OPTIONS,
      },
    ],
    defaultConfig: { text: '', source_language: 'en', target_language: 'es' },
    estimatedCredits: 1,
    estimatedDurationMs: 1500,
  },
  {
    type: 'ai_summary',
    category: 'ai',
    label: 'AI Summary',
    description: 'Summarise long-form content into a concise or detailed summary.',
    icon: 'FileText',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'content',
        label: 'Content',
        type: 'textarea',
        placeholder: 'Paste or reference the content to summarise…',
        required: true,
      },
      {
        key: 'max_length',
        label: 'Max Length',
        type: 'number',
        defaultValue: 500,
        description: 'Approximate maximum word count for the summary.',
      },
      {
        key: 'style',
        label: 'Summary Style',
        type: 'select',
        defaultValue: 'concise',
        options: [
          { label: 'Concise', value: 'concise' },
          { label: 'Detailed', value: 'detailed' },
          { label: 'Bullet Points', value: 'bullet-points' },
        ],
      },
    ],
    defaultConfig: { content: '', max_length: 500, style: 'concise' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'ai_classification',
    category: 'ai',
    label: 'AI Classification',
    description: 'Classify content into one of the provided categories using an LLM.',
    icon: 'Tag',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'content',
        label: 'Content to Classify',
        type: 'textarea',
        placeholder: 'Enter the content…',
        required: true,
      },
      {
        key: 'categories',
        label: 'Categories',
        type: 'json',
        defaultValue: '[]',
        required: true,
        description: 'JSON array of category strings, e.g. ["spam", "important"].',
      },
    ],
    defaultConfig: { content: '', categories: '[]' },
    estimatedCredits: 1,
    estimatedDurationMs: 1500,
  },
  {
    type: 'ai_embedding',
    category: 'ai',
    label: 'AI Embedding',
    description: 'Generate a vector embedding for the given text, useful for similarity search.',
    icon: 'Database',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        placeholder: 'Enter text to embed…',
        required: true,
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        description: 'Embedding model to use (e.g. text-embedding-3-small).',
      },
    ],
    defaultConfig: { text: '', model: '' },
    estimatedCredits: 1,
    estimatedDurationMs: 500,
  },
  {
    type: 'ai_ocr',
    category: 'ai',
    label: 'AI OCR',
    description: 'Extract text from an image using optical character recognition.',
    icon: 'ScanText',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'image_url',
        label: 'Image URL',
        type: 'text',
        placeholder: 'https://example.com/image.png',
        required: true,
        description: 'URL of the image to perform OCR on.',
      },
      {
        key: 'languages',
        label: 'Language',
        type: 'select',
        defaultValue: 'en',
        options: LANGUAGE_OPTIONS,
        description: 'Primary language expected in the image.',
      },
    ],
    defaultConfig: { image_url: '', languages: 'en' },
    estimatedCredits: 2,
    estimatedDurationMs: 3000,
  },
  {
    type: 'generate_image',
    category: 'ai',
    label: 'Generate Image',
    description: 'Generate an image from a text prompt using an AI image generation model.',
    icon: 'ImagePlus',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'A futuristic cityscape at sunset…',
        required: true,
        description: 'Text description of the image to generate.',
        group: 'Prompt',
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        description: 'AI provider that hosts the model.',
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        description: 'Specific image generation model to use.',
        group: 'Model',
      },
      {
        key: 'width',
        label: 'Width',
        type: 'number',
        defaultValue: 1024,
        description: 'Image width in pixels.',
        group: 'Parameters',
      },
      {
        key: 'height',
        label: 'Height',
        type: 'number',
        defaultValue: 1024,
        description: 'Image height in pixels.',
        group: 'Parameters',
      },
    ],
    defaultConfig: { prompt: '', width: 1024, height: 1024 },
    estimatedCredits: 5,
    estimatedDurationMs: 10000,
  },
  {
    type: 'generate_video',
    category: 'ai',
    label: 'Generate Video',
    description: 'Generate a short video clip from a text prompt using an AI video generation model.',
    icon: 'Video',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'A drone flying over a mountain range…',
        required: true,
        description: 'Text description of the video to generate.',
        group: 'Prompt',
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'duration_seconds',
        label: 'Duration (seconds)',
        type: 'number',
        defaultValue: 5,
        description: 'Length of the generated video in seconds.',
        group: 'Parameters',
      },
    ],
    defaultConfig: { prompt: '', duration_seconds: 5 },
    estimatedCredits: 10,
    estimatedDurationMs: 60000,
  },
  {
    type: 'generate_voice',
    category: 'ai',
    label: 'Generate Voice',
    description: 'Convert text to natural-sounding speech using an AI voice synthesis model.',
    icon: 'Mic',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text',
        label: 'Text',
        type: 'textarea',
        placeholder: 'Hello, welcome to our service…',
        required: true,
        description: 'Text content to convert to speech.',
        group: 'Voice',
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'provider-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'voice_id',
        label: 'Voice ID',
        type: 'text',
        placeholder: 'alloy',
        description: 'Identifier of the voice to use for generation.',
        group: 'Voice',
      },
    ],
    defaultConfig: { text: '', voice_id: 'alloy' },
    estimatedCredits: 3,
    estimatedDurationMs: 5000,
  },
  {
    type: 'summarize_text',
    category: 'ai',
    label: 'Summarize Text',
    description: 'Produce a concise summary of a long text using an AI language model.',
    icon: 'FileText',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text_input',
        label: 'Text to Summarize',
        type: 'textarea',
        placeholder: 'Paste the long text here…',
        required: true,
        description: 'The text content to summarize.',
        group: 'Input',
      },
      {
        key: 'max_length',
        label: 'Max Summary Length',
        type: 'number',
        defaultValue: 200,
        description: 'Maximum number of words/characters for the summary.',
        group: 'Parameters',
      },
      {
        key: 'style',
        label: 'Summary Style',
        type: 'select',
        defaultValue: 'concise',
        options: [
          { label: 'Concise', value: 'concise' },
          { label: 'Detailed', value: 'detailed' },
          { label: 'Bullet Points', value: 'bullets' },
          { label: 'ELI5', value: 'eli5' },
        ],
        group: 'Parameters',
      },
    ],
    defaultConfig: { text_input: '', max_length: 200, style: 'concise' },
    estimatedCredits: 2,
    estimatedDurationMs: 4000,
  },
  {
    type: 'classify_text',
    category: 'ai',
    label: 'Classify Text',
    description: 'Classify text into predefined categories using an AI model.',
    icon: 'Tags',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text_input',
        label: 'Text to Classify',
        type: 'textarea',
        placeholder: 'Enter the text to classify…',
        required: true,
        description: 'The text content to classify.',
        group: 'Input',
      },
      {
        key: 'categories',
        label: 'Categories',
        type: 'json',
        defaultValue: '[]',
        required: true,
        description: 'Array of category labels, e.g. ["spam", "not spam"].',
        group: 'Classification',
      },
      {
        key: 'multi_label',
        label: 'Multi-Label',
        type: 'select',
        defaultValue: 'false',
        options: [
          { label: 'Single Label', value: 'false' },
          { label: 'Multi-Label', value: 'true' },
        ],
        group: 'Classification',
      },
    ],
    defaultConfig: { text_input: '', categories: '[]', multi_label: 'false' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'extract_data',
    category: 'ai',
    label: 'Extract Data',
    description: 'Extract structured data from unstructured text using an AI model.',
    icon: 'FileSearch',
    color: 'violet',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'text_input',
        label: 'Source Text',
        type: 'textarea',
        placeholder: 'Paste unstructured text here…',
        required: true,
        description: 'The unstructured text to extract data from.',
        group: 'Input',
      },
      {
        key: 'extraction_schema',
        label: 'Extraction Schema',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON schema describing the fields to extract.',
        group: 'Extraction',
      },
    ],
    defaultConfig: { text_input: '', extraction_schema: '{}' },
    estimatedCredits: 2,
    estimatedDurationMs: 3000,
  },
];

// ─── Logic Nodes ──────────────────────────────────────────────────────────────────────

const LOGIC_NODES: NodeDefinition[] = [
  {
    type: 'if',
    category: 'logic',
    label: 'If/Condition',
    description: 'Evaluate a condition and route execution to the true or false branch.',
    icon: 'GitBranch',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'true', label: 'True', type: 'source' },
      { id: 'false', label: 'False', type: 'source' },
    ],
    fields: [
      {
        key: 'field_path',
        label: 'Field Path',
        type: 'text',
        placeholder: 'data.status',
        required: true,
        description: 'Dot-notated path to the value to evaluate (e.g. data.status).',
      },
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        required: true,
        defaultValue: 'equals',
        options: CONDITION_OPERATOR_OPTIONS,
      },
      {
        key: 'value',
        label: 'Value',
        type: 'text',
        placeholder: 'Value to compare against',
        description: 'The right-hand operand for the comparison.',
      },
    ],
    defaultConfig: { field_path: '', operator: 'equals', value: '' },
  },
  {
    type: 'else',
    category: 'logic',
    label: 'Else',
    description: 'Pass-through node for the else branch of a conditional.',
    icon: 'GitBranch',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'switch',
    category: 'logic',
    label: 'Switch',
    description: 'Route execution to one of multiple branches based on a value.',
    icon: 'Split',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'case_0', label: 'Case 0', type: 'source' },
      { id: 'case_1', label: 'Case 1', type: 'source' },
      { id: 'case_2', label: 'Case 2', type: 'source' },
      { id: 'default', label: 'Default', type: 'source' },
    ],
    fields: [
      {
        key: 'field_path',
        label: 'Field Path',
        type: 'text',
        placeholder: 'data.type',
        required: true,
        description: 'Dot-notated path to the value to switch on.',
      },
      {
        key: 'cases',
        label: 'Cases',
        type: 'json',
        defaultValue: '[{"label":"Case 0","value":""},{"label":"Case 1","value":""},{"label":"Case 2","value":""}]',
        required: true,
        description: 'JSON array of {label, value} objects defining each case.',
      },
    ],
    defaultConfig: {
      field_path: '',
      cases: '[{"label":"Case 0","value":""},{"label":"Case 1","value":""},{"label":"Case 2","value":""}]',
    },
  },
  {
    type: 'loop',
    category: 'logic',
    label: 'Loop',
    description: 'Iterate over a list of items, executing downstream nodes for each item.',
    icon: 'Repeat',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'each', label: 'Each', type: 'source' },
      { id: 'done', label: 'Done', type: 'source' },
    ],
    fields: [
      {
        key: 'items',
        label: 'Items',
        type: 'variable-picker',
        required: true,
        description: 'Variable or expression that resolves to an array.',
      },
      {
        key: 'max_iterations',
        label: 'Max Iterations',
        type: 'number',
        defaultValue: 100,
        description: 'Safety limit on the number of iterations.',
      },
    ],
    defaultConfig: { items: '', max_iterations: 100 },
  },
  {
    type: 'wait',
    category: 'logic',
    label: 'Wait',
    description: 'Pause execution for a specified duration before continuing.',
    icon: 'Timer',
    color: 'amber',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'duration_ms',
        label: 'Duration (ms)',
        type: 'number',
        defaultValue: 1000,
        required: true,
        description: 'Number of milliseconds to wait.',
      },
    ],
    defaultConfig: { duration_ms: 1000 },
  },
  {
    type: 'delay',
    category: 'logic',
    label: 'Delay',
    description: 'Delay the workflow by a fixed amount of time.',
    icon: 'Clock',
    color: 'amber',
    inputs: [],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'duration_ms',
        label: 'Duration (ms)',
        type: 'number',
        defaultValue: 1000,
        required: true,
        description: 'Number of milliseconds to delay.',
      },
    ],
    defaultConfig: { duration_ms: 1000 },
  },
  {
    type: 'merge',
    category: 'logic',
    label: 'Merge',
    description: 'Wait for two input branches to complete, then combine their outputs.',
    icon: 'GitMerge',
    color: 'amber',
    inputs: [
      { id: 'input_a', label: 'Input A', type: 'target' },
      { id: 'input_b', label: 'Input B', type: 'target' },
    ],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'split',
    category: 'logic',
    label: 'Split',
    description: 'Fan out a single input into two parallel branches.',
    icon: 'GitFork',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'output_a', label: 'Output A', type: 'source' },
      { id: 'output_b', label: 'Output B', type: 'source' },
    ],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'parallel',
    category: 'logic',
    label: 'Parallel',
    description: 'Execute up to three branches in parallel from a single input.',
    icon: 'LayoutGrid',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'output_1', label: 'Output 1', type: 'source' },
      { id: 'output_2', label: 'Output 2', type: 'source' },
      { id: 'output_3', label: 'Output 3', type: 'source' },
    ],
    fields: [],
    defaultConfig: {},
  },
  {
    type: 'stop_workflow',
    category: 'logic',
    label: 'Stop Workflow',
    description: 'Halt workflow execution immediately, optionally returning an error.',
    icon: 'OctagonX',
    color: 'red',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [],
    fields: [
      {
        key: 'error_message',
        label: 'Error Message',
        type: 'text',
        placeholder: 'Workflow stopped: reason...',
        description: 'Optional error message to include in the run record.',
      },
      {
        key: 'output',
        label: 'Output Data',
        type: 'json',
        defaultValue: '{}',
        description: 'Optional JSON data to return when the workflow stops.',
      },
    ],
    defaultConfig: { error_message: '', output: '{}' },
  },
  {
    type: 'error_handler',
    category: 'logic',
    label: 'Error Handler',
    description: 'Catch errors from upstream nodes and route them to a fallback branch for graceful recovery.',
    icon: 'ShieldAlert',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'success', label: 'Success', type: 'source' },
      { id: 'error', label: 'Error', type: 'source' },
    ],
    fields: [
      {
        key: 'error_types',
        label: 'Error Types to Catch',
        type: 'select',
        defaultValue: 'all',
        options: [
          { label: 'All Errors', value: 'all' },
          { label: 'Network Errors', value: 'network' },
          { label: 'Validation Errors', value: 'validation' },
          { label: 'Timeout Errors', value: 'timeout' },
        ],
        description: 'Type of errors this handler should catch.',
      },
      {
        key: 'fallback_message',
        label: 'Fallback Message',
        type: 'text',
        placeholder: 'Using default value',
        description: 'Message to log when an error is caught.',
      },
    ],
    defaultConfig: { error_types: 'all', fallback_message: '' },
  },
  {
    type: 'retry_node',
    category: 'logic',
    label: 'Retry',
    description: 'Retry a failed operation up to a maximum number of attempts with optional backoff.',
    icon: 'RotateCcw',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'max_retries',
        label: 'Max Retries',
        type: 'number',
        defaultValue: 3,
        required: true,
        description: 'Maximum number of retry attempts before giving up.',
      },
      {
        key: 'backoff_ms',
        label: 'Backoff (ms)',
        type: 'number',
        defaultValue: 1000,
        description: 'Base delay between retries in milliseconds. Uses exponential backoff.',
      },
      {
        key: 'retry_on',
        label: 'Retry On',
        type: 'select',
        defaultValue: 'any_error',
        options: [
          { label: 'Any Error', value: 'any_error' },
          { label: 'Timeout Only', value: 'timeout' },
          { label: 'Network Error Only', value: 'network' },
        ],
        description: 'Condition under which a retry is triggered.',
      },
    ],
    defaultConfig: { max_retries: 3, backoff_ms: 1000, retry_on: 'any_error' },
  },
  {
    type: 'timeout_node',
    category: 'logic',
    label: 'Timeout',
    description: 'Set a maximum execution time for downstream nodes, cancelling if exceeded.',
    icon: 'Timer',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'output', label: 'Output', type: 'source' },
      { id: 'timed_out', label: 'Timed Out', type: 'source' },
    ],
    fields: [
      {
        key: 'timeout_ms',
        label: 'Timeout (ms)',
        type: 'number',
        defaultValue: 30000,
        required: true,
        description: 'Maximum time in milliseconds before the operation is cancelled.',
      },
      {
        key: 'on_timeout',
        label: 'On Timeout',
        type: 'select',
        defaultValue: 'fail',
        options: [
          { label: 'Fail', value: 'fail' },
          { label: 'Return Default', value: 'default' },
          { label: 'Skip', value: 'skip' },
        ],
        description: 'What to do when the timeout is reached.',
      },
      {
        key: 'default_value',
        label: 'Default Value',
        type: 'json',
        defaultValue: 'null',
        description: 'Value to return when on_timeout is set to "default".',
      },
    ],
    defaultConfig: { timeout_ms: 30000, on_timeout: 'fail', default_value: 'null' },
  },
  {
    type: 'for_each_item',
    category: 'logic',
    label: 'For Each Item',
    description: 'Process each item in a collection individually, accumulating results.',
    icon: 'ListOrdered',
    color: 'amber',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'each', label: 'Each', type: 'source' },
      { id: 'done', label: 'Done', type: 'source' },
    ],
    fields: [
      {
        key: 'items_path',
        label: 'Items Path',
        type: 'text',
        placeholder: 'data.items',
        required: true,
        description: 'Path to the array to iterate over.',
      },
      {
        key: 'batch_size',
        label: 'Batch Size',
        type: 'number',
        defaultValue: 1,
        description: 'Number of items to process per batch.',
      },
    ],
    defaultConfig: { items_path: '', batch_size: 1 },
  },
];

// ─── Data Nodes ──────────────────────────────────────────────────────────────────────

const DATA_NODES: NodeDefinition[] = [
  {
    type: 'variables',
    category: 'data',
    label: 'Set Variable',
    description: 'Set or update a workflow variable that can be referenced later.',
    icon: 'Variable',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'variable_name',
        label: 'Variable Name',
        type: 'text',
        placeholder: 'my_variable',
        required: true,
        description: 'Name used to reference this variable in downstream nodes.',
      },
      {
        key: 'variable_value',
        label: 'Variable Value',
        type: 'variable-picker',
        required: true,
        description: 'Value or upstream reference to assign to the variable.',
      },
      {
        key: 'scope',
        label: 'Scope',
        type: 'select',
        defaultValue: 'local',
        options: [
          { label: 'Global', value: 'global' },
          { label: 'Local', value: 'local' },
        ],
        description: 'Global variables persist across runs; local ones are reset each run.',
      },
    ],
    defaultConfig: { variable_name: '', variable_value: '', scope: 'local' },
  },
  {
    type: 'json_parser',
    category: 'data',
    label: 'JSON Parser',
    description: 'Parse a JSON string and extract a value using a dot-notated path.',
    icon: 'Braces',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'json_path',
        label: 'JSON Path',
        type: 'text',
        placeholder: 'data.users[0].name',
        required: true,
        description: 'Dot-notated or bracket path into the JSON payload.',
      },
    ],
    defaultConfig: { json_path: '' },
  },
  {
    type: 'data_mapper',
    category: 'data',
    label: 'Data Mapper',
    description: 'Transform data by mapping source keys to target keys.',
    icon: 'ArrowRightLeft',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'mapping',
        label: 'Mapping',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object mapping source keys to target keys, e.g. {"source_field": "target_field"}.',
      },
    ],
    defaultConfig: { mapping: '{}' },
  },
  {
    type: 'formatter',
    category: 'data',
    label: 'Formatter',
    description: 'Apply a text or data formatting transformation.',
    icon: 'AlignLeft',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'format',
        label: 'Format',
        type: 'select',
        required: true,
        defaultValue: 'uppercase',
        options: [
          { label: 'Uppercase', value: 'uppercase' },
          { label: 'Lowercase', value: 'lowercase' },
          { label: 'Trim', value: 'trim' },
          { label: 'Capitalize', value: 'capitalize' },
          { label: 'Snake Case', value: 'snake_case' },
          { label: 'camelCase', value: 'camelCase' },
          { label: 'Number', value: 'number' },
          { label: 'Date', value: 'date' },
        ],
      },
    ],
    defaultConfig: { format: 'uppercase' },
  },
  {
    type: 'calculator',
    category: 'data',
    label: 'Calculator',
    description: 'Perform a mathematical operation between two numeric values.',
    icon: 'Calculator',
    color: 'sky',
    inputs: [
      { id: 'input_a', label: 'Input A', type: 'target' },
      { id: 'input_b', label: 'Input B', type: 'target' },
    ],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'operation',
        label: 'Operation',
        type: 'select',
        required: true,
        defaultValue: 'add',
        options: [
          { label: 'Add (+)', value: 'add' },
          { label: 'Subtract (−)', value: 'subtract' },
          { label: 'Multiply (×)', value: 'multiply' },
          { label: 'Divide (÷)', value: 'divide' },
          { label: 'Modulo (%)', value: 'modulo' },
          { label: 'Power (^)', value: 'power' },
        ],
      },
    ],
    defaultConfig: { operation: 'add' },
  },
  {
    type: 'transform',
    category: 'data',
    label: 'Transform',
    description: 'Apply a custom JavaScript expression to transform the input data.',
    icon: 'RefreshCw',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'transform_expression',
        label: 'Expression',
        type: 'code',
        placeholder: 'return input.map(x => x.name)',
        required: true,
        description: 'JavaScript expression. The input is available as `input`. Must return a value.',
      },
    ],
    defaultConfig: { transform_expression: '' },
  },
  {
    type: 'filter',
    category: 'data',
    label: 'Filter',
    description: 'Filter an array by evaluating a condition on each element.',
    icon: 'Filter',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'field_path',
        label: 'Field Path',
        type: 'text',
        placeholder: 'status',
        required: true,
        description: 'Dot-notated path to the field to evaluate within each array element.',
      },
      {
        key: 'operator',
        label: 'Operator',
        type: 'select',
        required: true,
        defaultValue: 'equals',
        options: CONDITION_OPERATOR_OPTIONS,
      },
      {
        key: 'value',
        label: 'Value',
        type: 'text',
        placeholder: 'active',
        description: 'The value to compare each element\'s field against.',
      },
    ],
    defaultConfig: { field_path: '', operator: 'equals', value: '' },
  },
  {
    type: 'data_sort',
    category: 'data',
    label: 'Data Sort',
    description: 'Sort an array of objects by a specified field in ascending or descending order.',
    icon: 'ArrowUpDown',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'sort_field',
        label: 'Sort Field',
        type: 'text',
        placeholder: 'created_at',
        required: true,
        description: 'Field path within each object to sort by.',
      },
      {
        key: 'sort_order',
        label: 'Sort Order',
        type: 'select',
        required: true,
        defaultValue: 'asc',
        options: [
          { label: 'Ascending', value: 'asc' },
          { label: 'Descending', value: 'desc' },
        ],
      },
    ],
    defaultConfig: { sort_field: '', sort_order: 'asc' },
  },
  {
    type: 'data_merge',
    category: 'data',
    label: 'Data Merge',
    description: 'Merge two data streams into a single combined output using a merge strategy.',
    icon: 'GitMerge',
    color: 'sky',
    inputs: [
      { id: 'input_a', label: 'Input A', type: 'target' },
      { id: 'input_b', label: 'Input B', type: 'target' },
    ],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'strategy',
        label: 'Merge Strategy',
        type: 'select',
        required: true,
        defaultValue: 'append',
        options: [
          { label: 'Append Arrays', value: 'append' },
          { label: 'Merge Objects', value: 'merge_objects' },
          { label: 'Zip', value: 'zip' },
          { label: 'Concatenate Strings', value: 'concat' },
        ],
      },
    ],
    defaultConfig: { strategy: 'append' },
  },
  {
    type: 'data_split',
    category: 'data',
    label: 'Data Split',
    description: 'Split a dataset into multiple chunks or by a delimiter.',
    icon: 'Scissors',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'output', label: 'Output', type: 'source' },
      { id: 'remainder', label: 'Remainder', type: 'source' },
    ],
    fields: [
      {
        key: 'mode',
        label: 'Split Mode',
        type: 'select',
        required: true,
        defaultValue: 'chunk',
        options: [
          { label: 'Fixed Chunks', value: 'chunk' },
          { label: 'By Delimiter', value: 'delimiter' },
          { label: 'By Condition', value: 'condition' },
        ],
      },
      {
        key: 'chunk_size',
        label: 'Chunk Size',
        type: 'number',
        defaultValue: 10,
        description: 'Number of items per chunk when using Fixed Chunks mode.',
      },
      {
        key: 'delimiter',
        label: 'Delimiter',
        type: 'text',
        placeholder: ',\n',
        description: 'Delimiter string when using By Delimiter mode.',
      },
    ],
    defaultConfig: { mode: 'chunk', chunk_size: 10, delimiter: '' },
  },
  {
    type: 'data_transform',
    category: 'data',
    label: 'Data Transform',
    description: 'Apply a series of field-level transformations such as rename, convert, or compute.',
    icon: 'Repeat',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'transformations',
        label: 'Transformations',
        type: 'json',
        defaultValue: '[]',
        required: true,
        description: 'Array of transformation rules, e.g. [{"from": "old_name", "to": "new_name", "type": "rename"}].',
      },
    ],
    defaultConfig: { transformations: '[]' },
  },
  {
    type: 'data_validate',
    category: 'data',
    label: 'Data Validate',
    description: 'Validate data against a JSON schema or a set of rules, routing invalid items to an error output.',
    icon: 'ShieldCheck',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [
      { id: 'valid', label: 'Valid', type: 'source' },
      { id: 'invalid', label: 'Invalid', type: 'source' },
    ],
    fields: [
      {
        key: 'schema',
        label: 'Validation Schema',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON schema or validation rules to check against each item.',
      },
      {
        key: 'mode',
        label: 'Validation Mode',
        type: 'select',
        required: true,
        defaultValue: 'schema',
        options: [
          { label: 'JSON Schema', value: 'schema' },
          { label: 'Required Fields', value: 'required_fields' },
          { label: 'Type Check', value: 'type_check' },
        ],
      },
    ],
    defaultConfig: { schema: '{}', mode: 'schema' },
  },
  {
    type: 'data_format',
    category: 'data',
    label: 'Data Format',
    description: 'Convert data between formats such as JSON, CSV, XML, or YAML.',
    icon: 'FileText',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'input_format',
        label: 'Input Format',
        type: 'select',
        required: true,
        defaultValue: 'json',
        options: [
          { label: 'JSON', value: 'json' },
          { label: 'CSV', value: 'csv' },
          { label: 'XML', value: 'xml' },
          { label: 'YAML', value: 'yaml' },
        ],
      },
      {
        key: 'output_format',
        label: 'Output Format',
        type: 'select',
        required: true,
        defaultValue: 'csv',
        options: [
          { label: 'JSON', value: 'json' },
          { label: 'CSV', value: 'csv' },
          { label: 'XML', value: 'xml' },
          { label: 'YAML', value: 'yaml' },
        ],
      },
    ],
    defaultConfig: { input_format: 'json', output_format: 'csv' },
  },
  {
    type: 'data_aggregate',
    category: 'data',
    label: 'Data Aggregate',
    description: 'Aggregate data by computing sums, averages, counts, or custom aggregations over grouped data.',
    icon: 'Sigma',
    color: 'sky',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'group_by',
        label: 'Group By Field',
        type: 'text',
        placeholder: 'category',
        description: 'Field to group records by before aggregation.',
      },
      {
        key: 'aggregation',
        label: 'Aggregation',
        type: 'select',
        required: true,
        defaultValue: 'count',
        options: [
          { label: 'Count', value: 'count' },
          { label: 'Sum', value: 'sum' },
          { label: 'Average', value: 'avg' },
          { label: 'Min', value: 'min' },
          { label: 'Max', value: 'max' },
        ],
      },
      {
        key: 'field',
        label: 'Aggregate Field',
        type: 'text',
        placeholder: 'amount',
        description: 'Numeric field to aggregate (required for sum, avg, min, max).',
      },
    ],
    defaultConfig: { group_by: '', aggregation: 'count', field: '' },
  },
];

// ─── Communication Nodes ────────────────────────────────────────────────────────────────────────────

const COMMUNICATION_NODES: NodeDefinition[] = [
  {
    type: 'notification',
    category: 'communication',
    label: 'Send Notification',
    description: 'Send an in-app notification to one or more users.',
    icon: 'Bell',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        placeholder: 'Notification title',
        required: true,
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Notification body...',
        required: true,
      },
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        defaultValue: 'system',
        options: [
          { label: 'System', value: 'system' },
          { label: 'Workspace', value: 'workspace' },
          { label: 'Mention', value: 'mention' },
          { label: 'AI Task Complete', value: 'ai_task_complete' },
        ],
      },
    ],
    defaultConfig: { title: '', message: '', type: 'system' },
  },
  {
    type: 'whatsapp',
    category: 'communication',
    label: 'WhatsApp',
    description: 'Send a message via WhatsApp Business API.',
    icon: 'MessageCircle',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'to',
        label: 'To',
        type: 'text',
        placeholder: '+1234567890',
        required: true,
        description: 'Recipient phone number in international format.',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Your message…',
        required: true,
      },
    ],
    defaultConfig: { to: '', message: '' },
  },
  {
    type: 'telegram',
    category: 'communication',
    label: 'Telegram',
    description: 'Send a message via Telegram Bot API.',
    icon: 'Send',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'chat_id',
        label: 'Chat ID',
        type: 'text',
        placeholder: '-100123456789',
        required: true,
        description: 'Telegram chat or channel ID.',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Your message…',
        required: true,
      },
    ],
    defaultConfig: { chat_id: '', message: '' },
  },
  {
    type: 'slack',
    category: 'communication',
    label: 'Slack',
    description: 'Send a message to a Slack channel.',
    icon: 'Hash',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'channel',
        label: 'Channel',
        type: 'text',
        placeholder: '#general',
        required: true,
        description: 'Slack channel name or ID.',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Your message…',
        required: true,
      },
    ],
    defaultConfig: { channel: '', message: '' },
  },
  {
    type: 'discord',
    category: 'communication',
    label: 'Discord',
    description: 'Send a message to a Discord channel via webhook.',
    icon: 'AtSign',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'webhook_url',
        label: 'Webhook URL',
        type: 'text',
        placeholder: 'https://discord.com/api/webhooks/...',
        required: true,
        description: 'Discord webhook URL for the target channel.',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Your message…',
        required: true,
      },
    ],
    defaultConfig: { webhook_url: '', message: '' },
  },
  {
    type: 'sms',
    category: 'communication',
    label: 'SMS',
    description: 'Send an SMS message via a supported provider.',
    icon: 'Smartphone',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'to',
        label: 'To',
        type: 'text',
        placeholder: '+1234567890',
        required: true,
        description: 'Recipient phone number in international format.',
      },
      {
        key: 'message',
        label: 'Message',
        type: 'textarea',
        placeholder: 'Your SMS message…',
        required: true,
        description: 'SMS body. Standard rate limit of 160 characters applies per segment.',
      },
    ],
    defaultConfig: { to: '', message: '' },
  },
  {
    type: 'send_in_app_notification',
    category: 'communication',
    label: 'Send In-App Notification',
    description: 'Send a real-time in-app notification to a specific user within the platform.',
    icon: 'BellRing',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'user_id',
        label: 'User ID',
        type: 'text',
        placeholder: 'User UUID or email',
        required: true,
        description: 'ID of the user to send the notification to.',
      },
      {
        key: 'title',
        label: 'Title',
        type: 'text',
        placeholder: 'New update',
        required: true,
      },
      {
        key: 'body',
        label: 'Body',
        type: 'textarea',
        placeholder: 'You have a new notification…',
        required: true,
      },
      {
        key: 'link',
        label: 'Action Link',
        type: 'text',
        placeholder: '/dashboard/tasks/123',
        description: 'Optional deep link to navigate when the notification is clicked.',
      },
    ],
    defaultConfig: { user_id: '', title: '', body: '', link: '' },
  },
  {
    type: 'update_record',
    category: 'communication',
    label: 'Update Record',
    description: 'Update an existing record in a specified table by its ID.',
    icon: 'Pencil',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'table',
        label: 'Table Name',
        type: 'text',
        placeholder: 'contacts',
        required: true,
        description: 'Database table to update.',
      },
      {
        key: 'record_id',
        label: 'Record ID',
        type: 'text',
        placeholder: 'Record UUID',
        required: true,
        description: 'ID of the record to update.',
      },
      {
        key: 'updates',
        label: 'Update Fields',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with fields to update.',
      },
    ],
    defaultConfig: { table: '', record_id: '', updates: '{}' },
  },
  {
    type: 'create_record',
    category: 'communication',
    label: 'Create Record',
    description: 'Create a new record in a specified database table.',
    icon: 'PlusCircle',
    color: 'rose',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'table',
        label: 'Table Name',
        type: 'text',
        placeholder: 'contacts',
        required: true,
        description: 'Database table to insert into.',
      },
      {
        key: 'data',
        label: 'Record Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with the fields and values for the new record.',
      },
    ],
    defaultConfig: { table: '', data: '{}' },
  },
];

// ─── Business Nodes ──────────────────────────────────────────────────────────────────────

const BUSINESS_NODES: NodeDefinition[] = [
  {
    type: 'crm',
    category: 'business',
    label: 'CRM Action',
    description: 'Perform an action in the CRM module (leads, contacts, companies).',
    icon: 'Contact',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_lead',
        options: [
          { label: 'Create Lead', value: 'create_lead' },
          { label: 'Update Lead', value: 'update_lead' },
          { label: 'Get Customer', value: 'get_customer' },
          { label: 'Create Contact', value: 'create_contact' },
        ],
      },
      {
        key: 'data',
        label: 'Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON payload for the CRM action.',
      },
    ],
    defaultConfig: { action: 'create_lead', data: '{}' },
  },
  {
    type: 'lead',
    category: 'business',
    label: 'Lead Action',
    description: 'Create, update, retrieve, or delete a sales lead.',
    icon: 'UserPlus',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Get', value: 'get' },
          { label: 'Delete', value: 'delete' },
        ],
      },
      {
        key: 'lead_data',
        label: 'Lead Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with lead fields.',
      },
    ],
    defaultConfig: { action: 'create', lead_data: '{}' },
  },
  {
    type: 'customer',
    category: 'business',
    label: 'Customer Action',
    description: 'Create, update, or retrieve a customer record.',
    icon: 'Users',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Get', value: 'get' },
        ],
      },
      {
        key: 'customer_data',
        label: 'Customer Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with customer fields.',
      },
    ],
    defaultConfig: { action: 'create', customer_data: '{}' },
  },
  {
    type: 'invoice',
    category: 'business',
    label: 'Invoice Action',
    description: 'Create, update, send, or retrieve an invoice.',
    icon: 'Receipt',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Send', value: 'send' },
          { label: 'Get', value: 'get' },
        ],
      },
      {
        key: 'invoice_data',
        label: 'Invoice Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with invoice fields.',
      },
    ],
    defaultConfig: { action: 'create', invoice_data: '{}' },
  },
  {
    type: 'proposal',
    category: 'business',
    label: 'Proposal Action',
    description: 'Create, update, send, or retrieve a business proposal.',
    icon: 'FileText',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Send', value: 'send' },
          { label: 'Get', value: 'get' },
        ],
      },
      {
        key: 'proposal_data',
        label: 'Proposal Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with proposal fields.',
      },
    ],
    defaultConfig: { action: 'create', proposal_data: '{}' },
  },
  {
    type: 'contract',
    category: 'business',
    label: 'Contract Action',
    description: 'Create, update, send for signature, or retrieve a contract.',
    icon: 'FileCheck',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Send', value: 'send' },
          { label: 'Sign', value: 'sign' },
          { label: 'Get', value: 'get' },
        ],
      },
      {
        key: 'contract_data',
        label: 'Contract Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with contract fields.',
      },
    ],
    defaultConfig: { action: 'create', contract_data: '{}' },
  },
  {
    type: 'payment',
    category: 'business',
    label: 'Payment Action',
    description: 'Create a charge, issue a refund, or check payment status.',
    icon: 'CreditCard',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_charge',
        options: [
          { label: 'Create Charge', value: 'create_charge' },
          { label: 'Refund', value: 'refund' },
          { label: 'Get Status', value: 'get_status' },
        ],
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        description: 'Amount in the smallest currency unit (e.g. cents for USD).',
      },
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        defaultValue: 'stripe',
        options: [
          { label: 'Stripe', value: 'stripe' },
          { label: 'Paystack', value: 'paystack' },
          { label: 'Flutterwave', value: 'flutterwave' },
        ],
      },
    ],
    defaultConfig: { action: 'create_charge', amount: 0, provider: 'stripe' },
  },
  {
    type: 'inventory',
    category: 'business',
    label: 'Inventory Action',
    description: 'Add or remove stock, or retrieve product information.',
    icon: 'Package',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'add_stock',
        options: [
          { label: 'Add Stock', value: 'add_stock' },
          { label: 'Remove Stock', value: 'remove_stock' },
          { label: 'Get Product', value: 'get_product' },
        ],
      },
      {
        key: 'product_id',
        label: 'Product ID',
        type: 'text',
        required: true,
        description: 'ID of the product to act on.',
      },
      {
        key: 'quantity',
        label: 'Quantity',
        type: 'number',
        defaultValue: 1,
        description: 'Number of units to add or remove.',
      },
    ],
    defaultConfig: { action: 'add_stock', product_id: '', quantity: 1 },
  },
  {
    type: 'expense',
    category: 'business',
    label: 'Expense Action',
    description: 'Create, update, approve, or reject an expense record.',
    icon: 'DollarSign',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Approve', value: 'approve' },
          { label: 'Reject', value: 'reject' },
        ],
      },
      {
        key: 'expense_data',
        label: 'Expense Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with expense fields.',
      },
    ],
    defaultConfig: { action: 'create', expense_data: '{}' },
  },
  {
    type: 'task',
    category: 'business',
    label: 'Task Action',
    description: 'Create, update, complete, or assign a task.',
    icon: 'CheckSquare',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Complete', value: 'complete' },
          { label: 'Assign', value: 'assign' },
        ],
      },
      {
        key: 'task_data',
        label: 'Task Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with task fields.',
      },
    ],
    defaultConfig: { action: 'create', task_data: '{}' },
  },
  {
    type: 'calendar',
    category: 'business',
    label: 'Calendar Action',
    description: 'Create, update, or delete a calendar event.',
    icon: 'Calendar',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_event',
        options: [
          { label: 'Create Event', value: 'create_event' },
          { label: 'Update Event', value: 'update_event' },
          { label: 'Delete Event', value: 'delete_event' },
        ],
      },
      {
        key: 'event_data',
        label: 'Event Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON object with event fields (title, start, end, etc.).',
      },
    ],
    defaultConfig: { action: 'create_event', event_data: '{}' },
  },
  {
    type: 'create_invoice',
    category: 'business',
    label: 'Create Invoice',
    description: 'Create a new invoice for a customer with line items, taxes, and payment terms.',
    icon: 'FilePlus',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'customer_id',
        label: 'Customer ID',
        type: 'text',
        placeholder: 'Customer UUID',
        required: true,
        description: 'ID of the customer to bill.',
      },
      {
        key: 'line_items',
        label: 'Line Items',
        type: 'json',
        defaultValue: '[]',
        required: true,
        description: 'Array of line items with description, amount, and quantity.',
      },
      {
        key: 'due_date',
        label: 'Due Date',
        type: 'text',
        placeholder: '2025-02-01',
        description: 'Payment due date in ISO format.',
      },
      {
        key: 'notes',
        label: 'Notes',
        type: 'textarea',
        placeholder: 'Thank you for your business.',
        description: 'Optional notes displayed on the invoice.',
      },
    ],
    defaultConfig: { customer_id: '', line_items: '[]', due_date: '', notes: '' },
  },
  {
    type: 'update_lead',
    category: 'business',
    label: 'Update Lead',
    description: 'Update an existing lead in the CRM with new information or stage changes.',
    icon: 'UserCheck',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'lead_id',
        label: 'Lead ID',
        type: 'text',
        placeholder: 'Lead UUID',
        required: true,
        description: 'ID of the lead to update.',
      },
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        options: [
          { label: 'New', value: 'new' },
          { label: 'Contacted', value: 'contacted' },
          { label: 'Qualified', value: 'qualified' },
          { label: 'Proposal', value: 'proposal' },
          { label: 'Negotiation', value: 'negotiation' },
          { label: 'Won', value: 'won' },
          { label: 'Lost', value: 'lost' },
        ],
        description: 'New stage for the lead.',
      },
      {
        key: 'updates',
        label: 'Additional Fields',
        type: 'json',
        defaultValue: '{}',
        description: 'JSON object with additional fields to update.',
      },
    ],
    defaultConfig: { lead_id: '', stage: '', updates: '{}' },
  },
  {
    type: 'create_task',
    category: 'business',
    label: 'Create Task',
    description: 'Create a new task and optionally assign it to a team member with a due date.',
    icon: 'ListTodo',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'title',
        label: 'Task Title',
        type: 'text',
        placeholder: 'Follow up with client',
        required: true,
        description: 'Title of the task.',
      },
      {
        key: 'assignee_id',
        label: 'Assignee ID',
        type: 'text',
        placeholder: 'User UUID',
        description: 'ID of the user to assign the task to.',
      },
      {
        key: 'due_date',
        label: 'Due Date',
        type: 'text',
        placeholder: '2025-02-01',
        description: 'Task due date in ISO format.',
      },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        defaultValue: 'medium',
        options: [
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
          { label: 'Urgent', value: 'urgent' },
        ],
      },
    ],
    defaultConfig: { title: '', assignee_id: '', due_date: '', priority: 'medium' },
  },
  {
    type: 'get_report_data',
    category: 'business',
    label: 'Get Report Data',
    description: 'Fetch pre-computed report data for dashboards and analytics.',
    icon: 'BarChart3',
    color: 'orange',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'report_type',
        label: 'Report Type',
        type: 'select',
        required: true,
        defaultValue: 'sales_summary',
        options: [
          { label: 'Sales Summary', value: 'sales_summary' },
          { label: 'Revenue Breakdown', value: 'revenue_breakdown' },
          { label: 'User Activity', value: 'user_activity' },
          { label: 'Pipeline Report', value: 'pipeline_report' },
          { label: 'Custom Query', value: 'custom' },
        ],
      },
      {
        key: 'date_from',
        label: 'Date From',
        type: 'text',
        placeholder: '2025-01-01',
        description: 'Start date for the report period in ISO format.',
      },
      {
        key: 'date_to',
        label: 'Date To',
        type: 'text',
        placeholder: '2025-01-31',
        description: 'End date for the report period in ISO format.',
      },
      {
        key: 'filters',
        label: 'Filters',
        type: 'json',
        defaultValue: '{}',
        description: 'Additional filter criteria as a JSON object.',
      },
    ],
    defaultConfig: { report_type: 'sales_summary', date_from: '', date_to: '', filters: '{}' },
  },
];

// ─── Integration Nodes ─────────────────────────────────────────────────────────────────────────────

const INTEGRATION_NODES: NodeDefinition[] = [
  {
    type: 'openai',
    category: 'integration',
    label: 'OpenAI',
    description: 'Call the OpenAI API directly with a prompt and model.',
    icon: 'Brain',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'model-select',
        required: true,
        group: 'Model',
      },
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Enter your prompt…',
        required: true,
      },
      {
        key: 'api_key',
        label: 'API Key (optional)',
        type: 'text',
        placeholder: 'sk-...',
        description: 'Override the workspace-level OpenAI API key. Leave empty to use the default.',
        group: 'Authentication',
      },
    ],
    defaultConfig: { model: '', prompt: '', api_key: '' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'anthropic',
    category: 'integration',
    label: 'Anthropic',
    description: 'Call the Anthropic Claude API with a prompt.',
    icon: 'Bot',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'claude-sonnet-4-20250514',
        required: true,
        group: 'Model',
      },
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Enter your prompt…',
        required: true,
      },
    ],
    defaultConfig: { model: 'claude-sonnet-4-20250514', prompt: '' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'gemini',
    category: 'integration',
    label: 'Gemini',
    description: 'Call the Google Gemini API with a prompt.',
    icon: 'Sparkles',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'gemini-2.0-flash',
        required: true,
        group: 'Model',
      },
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Enter your prompt…',
        required: true,
      },
    ],
    defaultConfig: { model: 'gemini-2.0-flash', prompt: '' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'deepseek',
    category: 'integration',
    label: 'DeepSeek',
    description: 'Call the DeepSeek API with a prompt.',
    icon: 'Cpu',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'model',
        label: 'Model',
        type: 'text',
        placeholder: 'deepseek-chat',
        required: true,
        group: 'Model',
      },
      {
        key: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        placeholder: 'Enter your prompt…',
        required: true,
      },
    ],
    defaultConfig: { model: 'deepseek-chat', prompt: '' },
    estimatedCredits: 1,
    estimatedDurationMs: 2000,
  },
  {
    type: 'github',
    category: 'integration',
    label: 'GitHub',
    description: 'Perform actions against the GitHub API (issues, PRs, repos, files).',
    icon: 'Github',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_issue',
        options: [
          { label: 'Create Issue', value: 'create_issue' },
          { label: 'Create PR', value: 'create_pr' },
          { label: 'List Repos', value: 'list_repos' },
          { label: 'Get File', value: 'get_file' },
        ],
      },
      {
        key: 'owner',
        label: 'Owner',
        type: 'text',
        placeholder: 'octocat',
        required: true,
        description: 'Repository owner (user or organisation).',
      },
      {
        key: 'repo',
        label: 'Repo',
        type: 'text',
        placeholder: 'my-repo',
        required: true,
        description: 'Repository name.',
      },
    ],
    defaultConfig: { action: 'create_issue', owner: '', repo: '' },
  },
  {
    type: 'google_drive',
    category: 'integration',
    label: 'Google Drive',
    description: 'Upload, download, list, or search files in Google Drive.',
    icon: 'HardDrive',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'upload',
        options: [
          { label: 'Upload', value: 'upload' },
          { label: 'Download', value: 'download' },
          { label: 'List', value: 'list' },
          { label: 'Search', value: 'search' },
        ],
      },
      {
        key: 'file_path',
        label: 'File Path',
        type: 'text',
        placeholder: '/documents/report.pdf',
        description: 'Path or query string for the file operation.',
      },
    ],
    defaultConfig: { action: 'upload', file_path: '' },
  },
  {
    type: 'stripe',
    category: 'integration',
    label: 'Stripe',
    description: 'Perform actions against the Stripe API (charges, customers, invoices).',
    icon: 'CreditCard',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_charge',
        options: [
          { label: 'Create Charge', value: 'create_charge' },
          { label: 'Create Customer', value: 'create_customer' },
          { label: 'Create Invoice', value: 'create_invoice' },
          { label: 'List Charges', value: 'list_charges' },
        ],
      },
      {
        key: 'amount',
        label: 'Amount',
        type: 'number',
        description: 'Amount in the smallest currency unit (e.g. cents).',
      },
    ],
    defaultConfig: { action: 'create_charge', amount: 0 },
  },
  {
    type: 'shopify',
    category: 'integration',
    label: 'Shopify',
    description: 'Manage products, orders, and other Shopify resources.',
    icon: 'ShoppingBag',
    color: 'slate',
    inputs: [{ id: 'input', label: 'Input', type: 'target' }],
    outputs: [{ id: 'output', label: 'Output', type: 'source' }],
    fields: [
      {
        key: 'action',
        label: 'Action',
        type: 'select',
        required: true,
        defaultValue: 'create_product',
        options: [
          { label: 'Create Product', value: 'create_product' },
          { label: 'Update Product', value: 'update_product' },
          { label: 'Get Order', value: 'get_order' },
          { label: 'List Products', value: 'list_products' },
        ],
      },
      {
        key: 'data',
        label: 'Data',
        type: 'json',
        defaultValue: '{}',
        required: true,
        description: 'JSON payload for the Shopify API call.',
      },
    ],
    defaultConfig: { action: 'create_product', data: '{}' },
  },
];

// ─── Category Metadata ────────────────────────────────────────────────────────────────────────────

/**
 * Display metadata for a node category, used by the left-panel palette
 * to render category headers and empty-state icons.
 */
export interface CategoryMetadata {
  /** Machine-readable key matching the `NodeCategory` union. */
  name: NodeCategory;
  /** Human-readable label shown in the palette header. */
  label: string;
  /** Lucide icon name rendered beside the category label. */
  icon: string;
  /** Tailwind colour token used for the category badge. */
  color: string;
}

/** Ordered category metadata array. The order controls palette rendering. */
const CATEGORY_META: CategoryMetadata[] = [
  { name: 'trigger', label: 'Triggers', icon: 'Zap', color: 'emerald' },
  { name: 'ai', label: 'AI', icon: 'Sparkles', color: 'violet' },
  { name: 'logic', label: 'Logic', icon: 'GitBranch', color: 'amber' },
  { name: 'data', label: 'Data', icon: 'Database', color: 'sky' },
  { name: 'communication', label: 'Communication', icon: 'Bell', color: 'rose' },
  { name: 'business', label: 'Business', icon: 'Briefcase', color: 'orange' },
  { name: 'integration', label: 'Integration', icon: 'Plug', color: 'slate' },
];

// ─── Node Registry Class ──────────────────────────────────────────────────────────────────────

/**
 * Central registry that owns every {@link NodeDefinition} in the system.
 *
 * The class is intentionally stateless after construction – all data is
 * set up in the constructor and then exposed via read-only accessors.
 * This makes it safe to share across React components and server code.
 *
 * @example
 * ```ts
 * import { nodeRegistry } from '@/services/workflow-builder';
 *
 * const allNodes = nodeRegistry.getAll();
 * const aiNodes  = nodeRegistry.getByCategory('ai');
 * const chat     = nodeRegistry.getByType('ai_chat');
 * ```
 */
class NodeRegistry {
  /** Internal lookup table keyed by `NodeDefinition.type`. */
  private readonly byType: Map<string, NodeDefinition>;

  /** Internal grouping table keyed by `NodeCategory`. */
  private readonly byCategory: Map<NodeCategory, NodeDefinition[]>;

  constructor() {
    const all: NodeDefinition[] = [
      ...TRIGGER_NODES,
      ...AI_NODES,
      ...LOGIC_NODES,
      ...DATA_NODES,
      ...COMMUNICATION_NODES,
      ...BUSINESS_NODES,
      ...INTEGRATION_NODES,
    ];

    this.byType = new Map(all.map((def) => [def.type, def]));
    this.byCategory = new Map<NodeCategory, NodeDefinition[]>();

    for (const def of all) {
      const list = this.byCategory.get(def.category) ?? [];
      list.push(def);
      this.byCategory.set(def.category, list);
    }
  }

  /**
 * Return a shallow copy of **all** registered node definitions.
 *
 * The returned array is ordered by category (triggers first, then
 * AI, logic, data, communication, business, integration) to match
 * the palette layout.
   */
  getAll(): NodeDefinition[] {
    return [...this.byType.values()];
  }

  /**
 * Return all node definitions that belong to `category`.
 *
 * Returns an empty array if the category is valid but has no
 * registered nodes, or `undefined` if the category string is
 * not a recognised {@link NodeCategory} value.
 *
 * @param category - The category to filter by.
   */
  getByCategory(category: NodeCategory): NodeDefinition[] | undefined {
    return this.byCategory.get(category);
  }

  /**
 * Look up a single node definition by its machine-readable `type` string.
 *
 * @param type - The node type identifier (e.g. `'ai_chat'`).
 * @returns The matching definition, or `undefined` if not found.
   */
  getByType(type: string): NodeDefinition | undefined {
    return this.byType.get(type);
  }

  /**
 * Return the ordered list of category metadata (name, label, icon, colour).
 *
 * Used by the palette component to render category section headers.
   */
  getCategories(): CategoryMetadata[] {
    return [...CATEGORY_META];
  }

  /**
 * Fuzzy-search node definitions by `query` string.
 *
 * The search is case-insensitive and matches against the node's
 * `type`, `label`, and `description` fields.
 *
 * @param query - Free-text search query.
 * @returns All definitions whose label, type, or description contains
   *          the query string.
   */
  search(query: string): NodeDefinition[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getAll();

    return this.getAll().filter(
      (def) =>
        def.type.toLowerCase().includes(q) ||
        def.label.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q),
    );
  }
}

/**
 * Singleton instance of the {@link NodeRegistry}.
 *
 * Import this wherever you need to look up node definitions.
 *
 * @example
 * ```ts
 * import { nodeRegistry } from '@/services/workflow-builder';
 * ```
 */
export const nodeRegistry = new NodeRegistry();
