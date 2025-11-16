import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AudioCaptchaProcessingService } from './audio-captcha-processing.service';
import { CaptchaWidgetInteractionService } from './captcha-widget-interaction.service';
import {
  AudioCaptchaRequest,
  AudioFormat,
  SpeechToTextProvider,
} from './interfaces/audio-captcha.interface';
import {
  GoogleCloudSpeechProvider,
  OpenAIWhisperProvider,
  AzureSpeechProvider,
} from './providers';

describe('AudioCaptchaProcessingService', () => {
  let service: AudioCaptchaProcessingService;
  let configService: ConfigService;
  let widgetInteraction: CaptchaWidgetInteractionService;
  let mockPage: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudioCaptchaProcessingService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                AUDIO_CAPTCHA_MIN_CONFIDENCE: 0.7,
                AUDIO_CAPTCHA_MAX_RETRIES: 3,
                AUDIO_CAPTCHA_CACHE_TTL_HOURS: 24,
                AUDIO_CAPTCHA_ENABLE_CACHE: true,
                AUDIO_CAPTCHA_RATE_LIMIT: 60,
                AUDIO_CAPTCHA_TEMP_DIR: './tmp/audio-test',
                AUDIO_CAPTCHA_TIMEOUT: 30000,
                OPENAI_API_KEY: 'test-openai-key',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CaptchaWidgetInteractionService,
          useValue: {
            locateElement: jest.fn(),
            detectAudioChallenge: jest.fn(),
          },
        },
        {
          provide: GoogleCloudSpeechProvider,
          useValue: {
            getName: jest.fn().mockReturnValue(SpeechToTextProvider.GOOGLE_CLOUD),
            isAvailable: jest.fn().mockResolvedValue(false),
            transcribe: jest.fn(),
          },
        },
        {
          provide: OpenAIWhisperProvider,
          useValue: {
            getName: jest.fn().mockReturnValue(SpeechToTextProvider.OPENAI_WHISPER),
            isAvailable: jest.fn().mockResolvedValue(true),
            transcribe: jest.fn().mockResolvedValue({
              text: 'test transcription',
              confidence: 0.9,
              provider: SpeechToTextProvider.OPENAI_WHISPER,
            }),
          },
        },
        {
          provide: AzureSpeechProvider,
          useValue: {
            getName: jest.fn().mockReturnValue(SpeechToTextProvider.AZURE_SPEECH),
            isAvailable: jest.fn().mockResolvedValue(false),
            transcribe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AudioCaptchaProcessingService>(
      AudioCaptchaProcessingService,
    );
    configService = module.get<ConfigService>(ConfigService);
    widgetInteraction = module.get<CaptchaWidgetInteractionService>(
      CaptchaWidgetInteractionService,
    );

    mockPage = {
      evaluate: jest.fn(),
      frames: jest.fn().mockReturnValue([]),
    };
  });

  describe('onModuleInit', () => {
    it('should initialize service', async () => {
      await service.onModuleInit();
      expect(service).toBeDefined();
    });
  });

  describe('detectAudioChallenge', () => {
    it('should detect audio challenge button', async () => {
      const mockLocator = { click: jest.fn() };
      jest.spyOn(widgetInteraction, 'locateElement').mockResolvedValue(mockLocator as any);

      const result = await service.detectAudioChallenge(mockPage);

      expect(result.found).toBe(true);
      expect(result.element).toBe(mockLocator);
    });

    it('should return not found when no audio button exists', async () => {
      jest.spyOn(widgetInteraction, 'locateElement').mockResolvedValue(null);

      const result = await service.detectAudioChallenge(mockPage);

      expect(result.found).toBe(false);
    });
  });

  describe('downloadAudio', () => {
    it('should download audio from blob URL', async () => {
      const blobData = new Uint8Array([1, 2, 3, 4]);
      mockPage.evaluate.mockResolvedValue(Array.from(blobData));

      const result = await service.downloadAudio(mockPage, 'blob:http://example.com/123');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.format).toBeDefined();
    });

    it('should download audio from regular URL', async () => {
      // Mock fetch globally
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
      });

      const result = await service.downloadAudio(mockPage, 'https://example.com/audio.mp3');

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.format).toBe(AudioFormat.MP3);
    });

    it('should detect WAV format', async () => {
      // WAV file starts with RIFF
      const wavBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: jest.fn().mockResolvedValue(wavBuffer.buffer),
      });

      const result = await service.downloadAudio(mockPage, 'https://example.com/audio');

      expect(result.format).toBe(AudioFormat.WAV);
    });

    it('should handle download errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(
        service.downloadAudio(mockPage, 'https://example.com/notfound.mp3'),
      ).rejects.toThrow();
    });
  });

  describe('processAudioCaptcha', () => {
    it('should process audio captcha request', async () => {
      // Mock download
      const audioBuffer = Buffer.from('test audio data');
      jest.spyOn(service as any, 'downloadAudioFromUrl').mockResolvedValue({
        buffer: audioBuffer,
        format: AudioFormat.WAV,
      });

      // Mock transcription
      const openaiProvider = service['openaiProvider'] as any;
      openaiProvider.transcribe.mockResolvedValue({
        text: 'transcribed text',
        confidence: 0.9,
        provider: SpeechToTextProvider.OPENAI_WHISPER,
      });

      const request: AudioCaptchaRequest = {
        audioUrl: 'https://example.com/audio.wav',
        format: AudioFormat.WAV,
      };

      const result = await service.processAudioCaptcha(request);

      expect(result.transcription).toBe('transcribed text');
      expect(result.confidence).toBe(0.9);
      expect(result.provider).toBe(SpeechToTextProvider.OPENAI_WHISPER);
      expect(result.cached).toBe(false);
    });

    it('should return cached result when available', async () => {
      const audioBuffer = Buffer.from('test audio');
      const cacheKey = service['generateCacheKey'](audioBuffer);

      // Pre-populate cache
      service['cache'].set(cacheKey, {
        transcription: 'cached text',
        confidence: 0.8,
        provider: SpeechToTextProvider.OPENAI_WHISPER,
        timestamp: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      jest.spyOn(service as any, 'downloadAudioFromUrl').mockResolvedValue({
        buffer: audioBuffer,
        format: AudioFormat.WAV,
      });

      const request: AudioCaptchaRequest = {
        audioUrl: 'https://example.com/audio.wav',
      };

      const result = await service.processAudioCaptcha(request);

      expect(result.transcription).toBe('cached text');
      expect(result.cached).toBe(true);
    });

    it('should retry with different provider on low confidence', async () => {
      const audioBuffer = Buffer.from('test audio');
      jest.spyOn(service as any, 'downloadAudioFromUrl').mockResolvedValue({
        buffer: audioBuffer,
        format: AudioFormat.WAV,
      });

      const openaiProvider = service['openaiProvider'] as any;
      openaiProvider.transcribe
        .mockResolvedValueOnce({
          text: 'low confidence',
          confidence: 0.5, // Below threshold
          provider: SpeechToTextProvider.OPENAI_WHISPER,
        })
        .mockResolvedValueOnce({
          text: 'high confidence',
          confidence: 0.9,
          provider: SpeechToTextProvider.OPENAI_WHISPER,
        });

      const request: AudioCaptchaRequest = {
        audioUrl: 'https://example.com/audio.wav',
      };

      const result = await service.processAudioCaptcha(request);

      // Should retry and get higher confidence
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('should handle processing errors', async () => {
      jest.spyOn(service as any, 'downloadAudioFromUrl').mockRejectedValue(
        new Error('Download failed'),
      );

      const request: AudioCaptchaRequest = {
        audioUrl: 'https://example.com/audio.wav',
      };

      await expect(service.processAudioCaptcha(request)).rejects.toThrow();
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limits', async () => {
      const provider = SpeechToTextProvider.OPENAI_WHISPER;
      const checkRateLimit = service['checkRateLimit'].bind(service);

      // First 60 requests should pass
      for (let i = 0; i < 60; i++) {
        const allowed = await checkRateLimit(provider);
        expect(allowed).toBe(true);
      }

      // 61st request should be rate limited
      const allowed = await checkRateLimit(provider);
      expect(allowed).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should generate consistent cache keys', () => {
      const buffer1 = Buffer.from('test audio');
      const buffer2 = Buffer.from('test audio');
      const buffer3 = Buffer.from('different audio');

      const key1 = service['generateCacheKey'](buffer1);
      const key2 = service['generateCacheKey'](buffer2);
      const key3 = service['generateCacheKey'](buffer3);

      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });

    it('should expire cache entries', async () => {
      const buffer = Buffer.from('test');
      const key = service['generateCacheKey'](buffer);

      service['cache'].set(key, {
        transcription: 'test',
        confidence: 0.8,
        provider: SpeechToTextProvider.OPENAI_WHISPER,
        timestamp: Date.now() - 100000,
        expiresAt: Date.now() - 1000, // Already expired
      });

      // Trigger cleanup
      const cleanup = service['startCacheCleanup'].bind(service);
      cleanup();

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(service['cache'].has(key)).toBe(false);
    });
  });

  describe('provider registration', () => {
    it('should register available providers', async () => {
      await service.onModuleInit();

      const availableProviders = service.getAvailableProviders();
      expect(availableProviders.length).toBeGreaterThan(0);
    });
  });
});

