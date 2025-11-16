import { Injectable, Logger } from '@nestjs/common';
import {
  ISpeechToTextProvider,
  SpeechToTextProvider,
  TranscriptionOptions,
  TranscriptionResult,
} from '../interfaces/audio-captcha.interface';

/**
 * Base class for speech-to-text providers
 */
@Injectable()
export abstract class BaseSpeechProvider implements ISpeechToTextProvider {
  protected readonly logger: Logger;

  constructor(protected readonly providerName: SpeechToTextProvider) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * Get provider name
   */
  abstract getName(): SpeechToTextProvider;

  /**
   * Check if provider is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Transcribe audio buffer
   */
  abstract transcribe(
    audioBuffer: Buffer,
    options?: TranscriptionOptions,
  ): Promise<TranscriptionResult>;
}

