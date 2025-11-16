/**
 * Interfaces for audio captcha processing
 */

/**
 * Audio format types
 */
export enum AudioFormat {
  MP3 = 'mp3',
  WAV = 'wav',
  OGG = 'ogg',
  UNKNOWN = 'unknown',
}

/**
 * Speech-to-text provider types
 */
export enum SpeechToTextProvider {
  GOOGLE_CLOUD = 'google-cloud',
  OPENAI_WHISPER = 'openai-whisper',
  AZURE_SPEECH = 'azure-speech',
}

/**
 * Audio preprocessing options
 */
export interface AudioPreprocessingOptions {
  /**
   * Enable noise reduction
   * @default true
   */
  noiseReduction?: boolean;

  /**
   * Enable volume normalization
   * @default true
   */
  volumeNormalization?: boolean;

  /**
   * Enable silence trimming
   * @default true
   */
  silenceTrimming?: boolean;

  /**
   * Target sample rate (Hz)
   * @default 16000
   */
  targetSampleRate?: number;

  /**
   * Target format
   * @default AudioFormat.WAV
   */
  targetFormat?: AudioFormat;
}

/**
 * Audio captcha request DTO
 */
export interface AudioCaptchaRequest {
  /**
   * Audio URL or blob URL
   */
  audioUrl: string;

  /**
   * Audio format (auto-detected if not provided)
   */
  format?: AudioFormat;

  /**
   * Source captcha provider (reCAPTCHA, hCAPTCHA, etc.)
   */
  sourceProvider?: string;

  /**
   * Task/job ID for tracking
   */
  taskId?: string;

  /**
   * Preprocessing options
   */
  preprocessing?: AudioPreprocessingOptions;
}

/**
 * Audio captcha response DTO
 */
export interface AudioCaptchaResponse {
  /**
   * Transcribed text
   */
  transcription: string;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Provider used for transcription
   */
  provider: SpeechToTextProvider;

  /**
   * Whether result was from cache
   */
  cached: boolean;

  /**
   * Processing duration (ms)
   */
  duration: number;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Speech-to-text provider interface
 */
export interface ISpeechToTextProvider {
  /**
   * Provider name
   */
  getName(): SpeechToTextProvider;

  /**
   * Check if provider is available (has valid API key)
   */
  isAvailable(): Promise<boolean>;

  /**
   * Transcribe audio buffer to text
   */
  transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}

/**
 * Transcription options
 */
export interface TranscriptionOptions {
  /**
   * Language code (e.g., 'en-US')
   * @default 'en-US'
   */
  languageCode?: string;

  /**
   * Sample rate (Hz)
   * @default 16000
   */
  sampleRate?: number;

  /**
   * Audio format
   */
  format?: AudioFormat;

  /**
   * Enable punctuation
   * @default true
   */
  enablePunctuation?: boolean;
}

/**
 * Transcription result
 */
export interface TranscriptionResult {
  /**
   * Transcribed text
   */
  text: string;

  /**
   * Confidence score (0-1)
   */
  confidence: number;

  /**
   * Provider used
   */
  provider: SpeechToTextProvider;

  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Audio processing configuration
 */
export interface AudioProcessingConfig {
  /**
   * Preferred speech-to-text provider order
   * @default [SpeechToTextProvider.GOOGLE_CLOUD, SpeechToTextProvider.OPENAI_WHISPER, SpeechToTextProvider.AZURE_SPEECH]
   */
  providerPriority?: SpeechToTextProvider[];

  /**
   * Minimum confidence threshold for retry
   * @default 0.7
   */
  minConfidenceThreshold?: number;

  /**
   * Maximum retry attempts
   * @default 3
   */
  maxRetries?: number;

  /**
   * Cache TTL in hours
   * @default 24
   */
  cacheTtlHours?: number;

  /**
   * Enable caching
   * @default true
   */
  enableCache?: boolean;

  /**
   * Rate limit per minute per provider
   * @default 60
   */
  rateLimitPerMinute?: number;

  /**
   * Temporary directory for audio files
   * @default './tmp/audio'
   */
  tempDirectory?: string;

  /**
   * Timeout for transcription (ms)
   * @default 30000
   */
  transcriptionTimeout?: number;
}

