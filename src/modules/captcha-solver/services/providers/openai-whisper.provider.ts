import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  SpeechToTextProvider,
  TranscriptionOptions,
  TranscriptionResult,
} from '../interfaces/audio-captcha.interface';
import { BaseSpeechProvider } from './base-speech-provider';

/**
 * OpenAI Whisper API provider
 */
@Injectable()
export class OpenAIWhisperProvider extends BaseSpeechProvider {
  private apiKey: string | undefined;
  private readonly apiUrl = 'https://api.openai.com/v1/audio/transcriptions';

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super(SpeechToTextProvider.OPENAI_WHISPER);
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  getName(): SpeechToTextProvider {
    return SpeechToTextProvider.OPENAI_WHISPER;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      // Create form data using axios's built-in FormData support
      // Note: form-data package may be needed, but axios can handle multipart/form-data
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', options?.languageCode?.split('-')[0] || 'en');
      formData.append('response_format', 'verbose_json');

      const response = await firstValueFrom(
        this.httpService.post(this.apiUrl, formData, {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: 30000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }),
      );

      const transcription = response.data.text || '';
      const confidence = response.data.segments?.[0]?.avg_logprob
        ? Math.exp(response.data.segments[0].avg_logprob)
        : 0.8; // Default confidence if not provided

      return {
        text: transcription,
        confidence: Math.max(0, Math.min(1, confidence)),
        provider: SpeechToTextProvider.OPENAI_WHISPER,
        metadata: {
          segments: response.data.segments,
          language: response.data.language,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`OpenAI Whisper transcription failed: ${errorMessage}`);
      throw new Error(`OpenAI Whisper transcription failed: ${errorMessage}`);
    }
  }
}

