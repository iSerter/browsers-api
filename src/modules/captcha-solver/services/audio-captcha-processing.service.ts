import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Page } from 'playwright';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { createHash } from 'crypto';
import {
  AudioCaptchaRequest,
  AudioCaptchaResponse,
  AudioFormat,
  SpeechToTextProvider,
  ISpeechToTextProvider,
  TranscriptionOptions,
  TranscriptionResult,
  AudioProcessingConfig,
  AudioPreprocessingOptions,
} from './interfaces/audio-captcha.interface';
import { CaptchaWidgetInteractionService } from './captcha-widget-interaction.service';
import type {
  GoogleCloudSpeechProvider,
  OpenAIWhisperProvider,
  AzureSpeechProvider,
} from './providers';
import {
  NetworkException,
  InternalException,
  SolverUnavailableException,
} from '../exceptions';

/**
 * Default audio processing configuration
 */
const DEFAULT_CONFIG: Required<AudioProcessingConfig> = {
  providerPriority: [
    SpeechToTextProvider.GOOGLE_CLOUD,
    SpeechToTextProvider.OPENAI_WHISPER,
    SpeechToTextProvider.AZURE_SPEECH,
  ],
  minConfidenceThreshold: 0.7,
  maxRetries: 3,
  cacheTtlHours: 24,
  enableCache: true,
  rateLimitPerMinute: 60,
  tempDirectory: './tmp/audio',
  transcriptionTimeout: 30000,
};

/**
 * In-memory cache entry
 */
interface CacheEntry {
  transcription: string;
  confidence: number;
  provider: SpeechToTextProvider;
  timestamp: number;
  expiresAt: number;
}

/**
 * Rate limiter entry
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Service for processing audio captcha challenges
 * Handles download, format conversion, speech-to-text, caching, and retry logic
 */
@Injectable()
export class AudioCaptchaProcessingService implements OnModuleInit {
  private readonly logger = new Logger(
    AudioCaptchaProcessingService.name,
  );
  private config: Required<AudioProcessingConfig>;
  private cache: Map<string, CacheEntry> = new Map();
  private rateLimiters: Map<SpeechToTextProvider, RateLimitEntry> = new Map();
  private requestQueue: Map<SpeechToTextProvider, Array<() => Promise<void>>> =
    new Map();
  private providers: Map<SpeechToTextProvider, ISpeechToTextProvider> =
    new Map();

  constructor(
    private readonly configService: ConfigService,
    private readonly widgetInteraction: CaptchaWidgetInteractionService,
  ) {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Initialize the service
   */
  async onModuleInit() {
    // Load configuration from environment
    this.loadConfiguration();

    // Initialize providers
    await this.initializeProviders();

    // Ensure temp directory exists
    await this.ensureTempDirectory();

    // Start cache cleanup interval
    this.startCacheCleanup();

    this.logger.log('Audio captcha processing service initialized');
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfiguration(): void {
    const providerPriority = this.configService.get<string>(
      'AUDIO_CAPTCHA_PROVIDER_PRIORITY',
    );
    if (providerPriority) {
      this.config.providerPriority = providerPriority
        .split(',')
        .map((p) => p.trim() as SpeechToTextProvider);
    }

    this.config.minConfidenceThreshold =
      this.configService.get<number>(
        'AUDIO_CAPTCHA_MIN_CONFIDENCE',
        DEFAULT_CONFIG.minConfidenceThreshold,
      ) ?? DEFAULT_CONFIG.minConfidenceThreshold;

    this.config.maxRetries =
      this.configService.get<number>(
        'AUDIO_CAPTCHA_MAX_RETRIES',
        DEFAULT_CONFIG.maxRetries,
      ) ?? DEFAULT_CONFIG.maxRetries;

    this.config.cacheTtlHours =
      this.configService.get<number>(
        'AUDIO_CAPTCHA_CACHE_TTL_HOURS',
        DEFAULT_CONFIG.cacheTtlHours,
      ) ?? DEFAULT_CONFIG.cacheTtlHours;

    this.config.enableCache =
      this.configService.get<boolean>(
        'AUDIO_CAPTCHA_ENABLE_CACHE',
        DEFAULT_CONFIG.enableCache,
      ) ?? DEFAULT_CONFIG.enableCache;

    this.config.rateLimitPerMinute =
      this.configService.get<number>(
        'AUDIO_CAPTCHA_RATE_LIMIT',
        DEFAULT_CONFIG.rateLimitPerMinute,
      ) ?? DEFAULT_CONFIG.rateLimitPerMinute;

    this.config.tempDirectory =
      this.configService.get<string>(
        'AUDIO_CAPTCHA_TEMP_DIR',
        DEFAULT_CONFIG.tempDirectory,
      ) ?? DEFAULT_CONFIG.tempDirectory;
    
    // Ensure all required properties are set
    this.config.minConfidenceThreshold = this.config.minConfidenceThreshold ?? DEFAULT_CONFIG.minConfidenceThreshold;
    this.config.maxRetries = this.config.maxRetries ?? DEFAULT_CONFIG.maxRetries;
    this.config.cacheTtlHours = this.config.cacheTtlHours ?? DEFAULT_CONFIG.cacheTtlHours;
    this.config.rateLimitPerMinute = this.config.rateLimitPerMinute ?? DEFAULT_CONFIG.rateLimitPerMinute;
    this.config.tempDirectory = this.config.tempDirectory ?? DEFAULT_CONFIG.tempDirectory;

    this.config.transcriptionTimeout =
      this.configService.get<number>(
        'AUDIO_CAPTCHA_TIMEOUT',
        DEFAULT_CONFIG.transcriptionTimeout,
      ) ?? DEFAULT_CONFIG.transcriptionTimeout;
  }

  /**
   * Initialize speech-to-text providers via lazy loading.
   * Providers are dynamically imported only when their API keys are configured,
   * reducing startup time and memory usage when providers aren't needed.
   */
  private async initializeProviders(): Promise<void> {
    const providerConfigs: Array<{
      name: string;
      envKey: string;
      importPath: string;
      exportName: string;
      providerEnum: SpeechToTextProvider;
    }> = [
      {
        name: 'Google Cloud Speech',
        envKey: 'GOOGLE_SPEECH_API_KEY',
        importPath: './providers',
        exportName: 'GoogleCloudSpeechProvider',
        providerEnum: SpeechToTextProvider.GOOGLE_CLOUD,
      },
      {
        name: 'OpenAI Whisper',
        envKey: 'OPENAI_API_KEY',
        importPath: './providers',
        exportName: 'OpenAIWhisperProvider',
        providerEnum: SpeechToTextProvider.OPENAI_WHISPER,
      },
      {
        name: 'Azure Speech',
        envKey: 'AZURE_SPEECH_KEY',
        importPath: './providers',
        exportName: 'AzureSpeechProvider',
        providerEnum: SpeechToTextProvider.AZURE_SPEECH,
      },
    ];

    for (const config of providerConfigs) {
      const apiKey = this.configService.get<string>(config.envKey);
      if (!apiKey) {
        this.logger.debug(`${config.name} provider skipped (no API key configured)`);
        continue;
      }

      try {
        const module = await import(config.importPath);
        const ProviderClass = module[config.exportName];
        const provider: ISpeechToTextProvider = new ProviderClass(this.configService);
        const isAvailable = await provider.isAvailable();
        if (isAvailable) {
          this.registerProvider(provider);
          this.logger.debug(`${config.name} provider registered (lazy loaded)`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to lazy-load ${config.name} provider: ${errorMessage}`);
      }
    }

    if (this.providers.size === 0) {
      this.logger.warn('No speech-to-text providers available');
    } else {
      this.logger.log(
        `Initialized ${this.providers.size} speech-to-text provider(s)`,
      );
    }
  }

  /**
   * Validate that a file path stays within the configured temp directory.
   * Prevents path traversal attacks.
   */
  private validateFilePath(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedTempDir = path.resolve(this.config.tempDirectory);
    if (!resolvedPath.startsWith(resolvedTempDir + path.sep) && resolvedPath !== resolvedTempDir) {
      throw new InternalException(
        'Path traversal detected: file path escapes temp directory',
        undefined,
        { filePath, tempDirectory: this.config.tempDirectory },
      );
    }
  }

  /**
   * Write a file securely with restricted permissions (owner-only read/write)
   */
  private async secureWriteFile(filePath: string, data: Buffer): Promise<void> {
    this.validateFilePath(filePath);
    await fs.writeFile(filePath, data);
    await fs.chmod(filePath, 0o600);
  }

  /**
   * Ensure temporary directory exists
   */
  private async ensureTempDirectory(): Promise<void> {
    if (!this.config.tempDirectory) {
      this.logger.warn('Temp directory not configured, using default');
      this.config.tempDirectory = DEFAULT_CONFIG.tempDirectory;
    }
    try {
      await fs.mkdir(this.config.tempDirectory, { recursive: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Failed to create temp directory: ${errorMessage}`,
      );
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
        }
      }
    }, 3600000); // Clean up every hour
  }

  /**
   * Detect audio challenge button in captcha widget
   */
  async detectAudioChallenge(
    page: Page,
  ): Promise<{ found: boolean; element?: any }> {
    try {
      // Look for audio challenge button using multiple strategies
      const selectors = [
        { ariaLabel: 'audio challenge' },
        { ariaLabel: 'Get an audio challenge' },
        { text: 'Audio' },
        { css: '[aria-label*="audio" i]' },
        { css: '[aria-label*="sound" i]' },
        { css: 'button[title*="audio" i]' },
        { css: 'a[title*="audio" i]' },
        // Look for headphone/speaker icons
        { css: 'svg[aria-label*="audio" i]' },
        { css: 'svg[aria-label*="sound" i]' },
        { css: '.audio-button' },
        { css: '.sound-button' },
      ];

      for (const selector of selectors) {
        const result = await this.widgetInteraction.locateElement(page, selector);
        if (result) {
          this.logger.debug(`Audio challenge button found using selector: ${JSON.stringify(selector)}`);
          return { found: true, element: result };
        }
      }

      return { found: false };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Error detecting audio challenge: ${errorMessage}`);
      return { found: false };
    }
  }

  /**
   * Download audio file from URL or blob
   */
  async downloadAudio(
    page: Page,
    audioUrl: string,
  ): Promise<{ buffer: Buffer; format: AudioFormat; filePath?: string }> {
    const startTime = Date.now();
    let filePath: string | undefined;

    try {
      let audioBuffer: Buffer;

      // Check if it's a blob URL
      if (audioUrl.startsWith('blob:')) {
        // Extract blob data using page.evaluate
        const blobData = await page.evaluate(async (url) => {
          const response = await fetch(url);
          const blob = await response.blob();
          const arrayBuffer = await blob.arrayBuffer();
          return Array.from(new Uint8Array(arrayBuffer));
        }, audioUrl);

        audioBuffer = Buffer.from(blobData);
      } else {
        // Download from URL
        const response = await fetch(audioUrl);
        if (!response.ok) {
          throw new NetworkException(
            `Failed to download audio: ${response.statusText}`,
            undefined,
            {
              url: audioUrl,
              statusCode: response.status,
              statusText: response.statusText,
            },
          );
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      }

      // Detect format from buffer or URL
      const format = this.detectAudioFormat(audioUrl, audioBuffer);

      // Save to temp file if needed for processing
      if (this.needsFileProcessing(format)) {
        filePath = path.join(
          this.config.tempDirectory,
          `${crypto.randomUUID()}.${format}`,
        );
        await this.secureWriteFile(filePath, audioBuffer);
      }

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Downloaded audio (${format}, ${audioBuffer.length} bytes) in ${duration}ms`,
      );

      return { buffer: audioBuffer, format, filePath };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to download audio: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Detect audio format from URL or buffer
   */
  private detectAudioFormat(url: string, buffer: Buffer): AudioFormat {
    // Check URL extension
    const urlLower = url.toLowerCase();
    if (urlLower.includes('.mp3') || urlLower.endsWith('mp3')) {
      return AudioFormat.MP3;
    }
    if (urlLower.includes('.wav') || urlLower.endsWith('wav')) {
      return AudioFormat.WAV;
    }
    if (urlLower.includes('.ogg') || urlLower.endsWith('ogg')) {
      return AudioFormat.OGG;
    }

    // Check buffer magic bytes
    if (buffer.length >= 3) {
      // MP3: ID3 tag or frame sync
      if (
        buffer[0] === 0x49 &&
        buffer[1] === 0x44 &&
        buffer[2] === 0x33
      ) {
        return AudioFormat.MP3;
      }
      if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
        return AudioFormat.MP3;
      }

      // WAV: RIFF header
      if (
        buffer[0] === 0x52 &&
        buffer[1] === 0x49 &&
        buffer[2] === 0x46 &&
        buffer[3] === 0x46
      ) {
        return AudioFormat.WAV;
      }

      // OGG: OggS header
      if (
        buffer[0] === 0x4f &&
        buffer[1] === 0x67 &&
        buffer[2] === 0x67 &&
        buffer[3] === 0x53
      ) {
        return AudioFormat.OGG;
      }
    }

    return AudioFormat.UNKNOWN;
  }

  /**
   * Check if format needs file-based processing
   */
  private needsFileProcessing(format: AudioFormat): boolean {
    return format !== AudioFormat.WAV;
  }

  /**
   * Process audio captcha request
   */
  async processAudioCaptcha(
    request: AudioCaptchaRequest,
    page?: Page,
  ): Promise<AudioCaptchaResponse> {
    const startTime = Date.now();
    let tempFilePath: string | undefined;

    try {
      // Step 1: Download audio
      let audioBuffer: Buffer;
      let format: AudioFormat;

      if (page && !request.audioUrl) {
        // Extract audio URL from page
        const audioUrl = await this.extractAudioUrl(page);
        if (!audioUrl) {
          throw new InternalException(
            'Could not extract audio URL from page',
            undefined,
            { method: 'processAudioCaptcha' },
          );
        }
        request.audioUrl = audioUrl;
      }

      const downloadResult = page
        ? await this.downloadAudio(page, request.audioUrl)
        : await this.downloadAudioFromUrl(request.audioUrl);

      audioBuffer = downloadResult.buffer;
      format = downloadResult.format || request.format || AudioFormat.UNKNOWN;
      tempFilePath = downloadResult.filePath;

      // Step 2: Check cache
      if (this.config.enableCache) {
        const cacheKey = this.generateCacheKey(audioBuffer);
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
          this.logger.debug('Returning cached transcription');
          return {
            transcription: cached.transcription,
            confidence: cached.confidence,
            provider: cached.provider,
            cached: true,
            duration: Date.now() - startTime,
          };
        }
      }

      // Step 3: Preprocess audio if needed
      const preprocessedBuffer = await this.preprocessAudio(
        audioBuffer,
        format,
        request.preprocessing,
        tempFilePath,
      );

      // Step 4: Transcribe with retry logic
      const transcriptionResult = await this.transcribeWithRetry(
        preprocessedBuffer,
        {
          format: AudioFormat.WAV, // After preprocessing, should be WAV
          sampleRate: request.preprocessing?.targetSampleRate || 16000,
        },
      );

      // Step 5: Cache result
      if (this.config.enableCache && transcriptionResult.confidence >= this.config.minConfidenceThreshold) {
        const cacheKey = this.generateCacheKey(audioBuffer);
        this.cache.set(cacheKey, {
          transcription: transcriptionResult.text,
          confidence: transcriptionResult.confidence,
          provider: transcriptionResult.provider,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.config.cacheTtlHours * 3600000,
        });
      }

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Audio captcha processed in ${duration}ms (confidence: ${transcriptionResult.confidence})`,
      );

      return {
        transcription: transcriptionResult.text,
        confidence: transcriptionResult.confidence,
        provider: transcriptionResult.provider,
        cached: false,
        duration,
        metadata: transcriptionResult.metadata,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process audio captcha: ${errorMessage}`);
      throw error;
    } finally {
      // Guaranteed temp file cleanup
      if (tempFilePath) {
        await this.cleanupTempFile(tempFilePath).catch(() => {});
      }
    }
  }

  /**
   * Extract audio URL from page
   */
  private async extractAudioUrl(page: Page): Promise<string | null> {
    try {
      // Try to find audio element or download link
      const audioUrl = await page.evaluate(() => {
        // Look for audio element
        const audioElement = document.querySelector('audio');
        if (audioElement?.src) {
          return audioElement.src;
        }

        // Look for audio download link
        const downloadLink = document.querySelector('a[href*="audio"], a[download*="audio"]');
        if (downloadLink) {
          return (downloadLink as HTMLAnchorElement).href;
        }

        // Look for blob URL in audio context
        const audioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (audioContext) {
          // Try to find audio source in page
          const sources = document.querySelectorAll('source[type*="audio"]');
          for (const source of Array.from(sources)) {
            const src = (source as HTMLSourceElement).src;
            if (src) return src;
          }
        }

        return null;
      });

      return audioUrl;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to extract audio URL: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Download audio from URL (without page context)
   */
  private async downloadAudioFromUrl(
    audioUrl: string,
  ): Promise<{ buffer: Buffer; format: AudioFormat; filePath?: string }> {
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const format = this.detectAudioFormat(audioUrl, buffer);

    let filePath: string | undefined;
    if (this.needsFileProcessing(format)) {
      filePath = path.join(
        this.config.tempDirectory,
        `${crypto.randomUUID()}.${format}`,
      );
      await this.secureWriteFile(filePath, buffer);
    }

    return { buffer, format, filePath };
  }

  /**
   * Preprocess audio (format conversion, noise reduction, etc.)
   */
  private async preprocessAudio(
    buffer: Buffer,
    format: AudioFormat,
    options?: AudioPreprocessingOptions,
    filePath?: string,
  ): Promise<Buffer> {
    // If already WAV and no preprocessing needed, return as-is
    if (format === AudioFormat.WAV && !options) {
      return buffer;
    }

    // Note: Actual ffmpeg processing will be implemented when ffmpeg is added
    // For now, return buffer as-is
    this.logger.debug(
      `Audio preprocessing would be applied here (format: ${format})`,
    );

    // TODO: Implement ffmpeg-based preprocessing when dependency is added
    // - Format conversion to WAV
    // - Sample rate conversion to 16kHz
    // - Noise reduction
    // - Volume normalization
    // - Silence trimming

    return buffer;
  }

  /**
   * Transcribe audio with retry logic
   */
  private async transcribeWithRetry(
    audioBuffer: Buffer,
    options: TranscriptionOptions,
    attempt: number = 1,
  ): Promise<TranscriptionResult> {
    const providers = this.config.providerPriority || DEFAULT_CONFIG.providerPriority;

    for (const providerType of providers) {
      const provider = this.providers.get(providerType);
      if (!provider) {
        this.logger.debug(`Provider ${providerType} not available, skipping`);
        continue;
      }

      // Check rate limit
      if (!(await this.checkRateLimit(providerType))) {
        this.logger.debug(`Rate limit reached for ${providerType}, trying next provider`);
        continue;
      }

      try {
        // Queue request if needed
        const result = await this.queueRequest(providerType, async () => {
          return await provider.transcribe(audioBuffer, options);
        });

        // Check confidence
        if (result.confidence >= this.config.minConfidenceThreshold) {
          return result;
        }

        // Low confidence - retry with different preprocessing or next provider
        if (attempt < this.config.maxRetries) {
          this.logger.debug(
            `Low confidence (${result.confidence}), retrying with different preprocessing (attempt ${attempt + 1})`,
          );
          // Try with enhanced preprocessing
          const enhancedBuffer = await this.preprocessAudio(
            audioBuffer,
            AudioFormat.UNKNOWN,
            {
              noiseReduction: true,
              volumeNormalization: true,
              silenceTrimming: true,
            },
          );
          return await this.transcribeWithRetry(enhancedBuffer, options, attempt + 1);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          `Transcription failed with ${providerType}: ${errorMessage}`,
        );
        // Try next provider
        continue;
      }
    }

    throw new SolverUnavailableException(
      `All transcription providers failed after ${attempt} attempts`,
      'speech-to-text',
      'all_providers_failed',
      {
        attemptedProviders: this.config.providerPriority,
        attempt,
      },
    );
  }

  /**
   * Check rate limit for provider
   */
  private async checkRateLimit(
    provider: SpeechToTextProvider,
  ): Promise<boolean> {
    const now = Date.now();
    const entry = this.rateLimiters.get(provider);

    if (!entry || now > entry.resetAt) {
      // Reset or create new entry
      this.rateLimiters.set(provider, {
        count: 1,
        resetAt: now + 60000, // 1 minute
      });
      return true;
    }

    if (entry.count >= this.config.rateLimitPerMinute) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Queue request for provider
   */
  private async queueRequest<T>(
    provider: SpeechToTextProvider,
    requestFn: () => Promise<T>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queue = this.requestQueue.get(provider) || [];
      queue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.requestQueue.set(provider, queue);

      // Process queue
      this.processQueue(provider);
    });
  }

  /**
   * Process request queue for provider
   */
  private async processQueue(provider: SpeechToTextProvider): Promise<void> {
    const queue = this.requestQueue.get(provider);
    if (!queue || queue.length === 0) {
      return;
    }

    // Process one request at a time
    const request = queue.shift();
    if (request) {
      try {
        await request();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Queued request failed: ${errorMessage}`);
      }
    }

    // Process next if available
    if (queue.length > 0) {
      setImmediate(() => this.processQueue(provider));
    }
  }

  /**
   * Generate cache key from audio buffer
   */
  private generateCacheKey(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Cleanup temporary file
   */
  private async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.debug(`Failed to cleanup temp file: ${errorMessage}`);
    }
  }

  /**
   * Register a speech-to-text provider
   */
  registerProvider(provider: ISpeechToTextProvider): void {
    this.providers.set(provider.getName(), provider);
    this.logger.debug(`Registered provider: ${provider.getName()}`);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): SpeechToTextProvider[] {
    return Array.from(this.providers.keys());
  }
}

