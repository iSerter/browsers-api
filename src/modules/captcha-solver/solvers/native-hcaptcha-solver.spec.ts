import { Test, TestingModule } from '@nestjs/testing';
import { Page, Frame } from 'playwright';
import { NativeHcaptchaSolver } from './native-hcaptcha-solver';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { AudioCaptchaProcessingService } from '../services/audio-captcha-processing.service';
import {
  HcaptchaChallengeType,
  HcaptchaDifficulty,
} from './interfaces/hcaptcha-solver.interface';
import { CaptchaWidgetType } from '../services/interfaces/widget-interaction.interface';

describe('NativeHcaptchaSolver', () => {
  let solver: NativeHcaptchaSolver;
  let mockPage: jest.Mocked<Page>;
  let mockWidgetInteraction: jest.Mocked<CaptchaWidgetInteractionService>;
  let mockAudioProcessing: jest.Mocked<AudioCaptchaProcessingService>;
  let mockPerformanceTracker: jest.Mocked<SolverPerformanceTracker>;
  let mockFrame: jest.Mocked<Frame>;
  let mockAnchorFrame: jest.Mocked<Frame>;
  let mockChallengeFrame: jest.Mocked<Frame>;

  beforeEach(async () => {
    // Create mock page
    mockPage = {
      evaluate: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      frames: jest.fn(),
    } as any;

    // Create mock frames
    mockFrame = {
      url: jest.fn(),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    mockAnchorFrame = {
      url: jest.fn().mockReturnValue('https://hcaptcha.com/1/api.js'),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    mockChallengeFrame = {
      url: jest.fn().mockReturnValue('https://hcaptcha.com/1/challenges'),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    // Create mock widget interaction service
    mockWidgetInteraction = {
      detectWidget: jest.fn(),
    } as any;

    // Create mock audio processing service
    mockAudioProcessing = {
      processAudioCaptcha: jest.fn(),
    } as any;

    // Create mock performance tracker
    mockPerformanceTracker = {
      recordAttempt: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: CaptchaWidgetInteractionService,
          useValue: mockWidgetInteraction,
        },
        {
          provide: AudioCaptchaProcessingService,
          useValue: mockAudioProcessing,
        },
        {
          provide: SolverPerformanceTracker,
          useValue: mockPerformanceTracker,
        },
      ],
    }).compile();

    solver = new NativeHcaptchaSolver(
      mockPage,
      mockWidgetInteraction,
      mockAudioProcessing,
      mockPerformanceTracker,
    );
  });

  describe('getName', () => {
    it('should return correct solver name', () => {
      expect(solver.getName()).toBe('hcaptcha-native');
    });
  });

  describe('isAvailable', () => {
    it('should always return true for native solvers', async () => {
      const result = await solver.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('detectHcaptchaWidget', () => {
    it('should detect hCAPTCHA widget', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.HCAPTCHA,
        iframe: mockFrame,
        confidence: 0.9,
        iframeSrc: 'https://hcaptcha.com/1/api.js',
      });

      mockPage.evaluate.mockResolvedValue({
        siteKey: 'test-sitekey',
        callback: 'testCallback',
        containerSelector: '.h-captcha',
        isVisible: true,
        theme: 'light',
        size: 'normal',
      });

      mockPage.frames.mockReturnValue([mockAnchorFrame, mockChallengeFrame]);

      const result = await (solver as any).detectHcaptchaWidget({
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.anchorIframe).toBeDefined();
      expect(result.confidence).toBe(0.9);
      expect(result.siteKey).toBe('test-sitekey');
      expect(result.callback).toBe('testCallback');
    });

    it('should return low confidence when widget not detected', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.HCAPTCHA,
        iframe: null,
        confidence: 0.2,
      });

      const result = await (solver as any).detectHcaptchaWidget({
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.confidence).toBe(0.2);
      expect(result.anchorIframe).toBeNull();
    });
  });

  describe('determineChallengeType', () => {
    it('should detect checkbox challenge', async () => {
      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      mockPage.evaluate.mockResolvedValue(false);

      const result = await (solver as any).determineChallengeType(detection);

      expect(result).toBe(HcaptchaChallengeType.CHECKBOX);
    });

    it('should detect audio challenge', async () => {
      const mockAudioButton = {
        count: jest.fn().mockResolvedValue(1),
      };

      mockChallengeFrame.locator.mockImplementation((selector: string) => {
        if (selector.includes('audio')) {
          return mockAudioButton as any;
        }
        return { count: jest.fn().mockResolvedValue(0) } as any;
      });

      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const result = await (solver as any).determineChallengeType(detection);

      expect(result).toBe(HcaptchaChallengeType.AUDIO);
    });

    it('should detect accessibility challenge', async () => {
      const mockAccessibilityButton = {
        count: jest.fn().mockResolvedValue(1),
      };

      mockChallengeFrame.locator.mockImplementation((selector: string) => {
        if (selector.includes('accessibility')) {
          return mockAccessibilityButton as any;
        }
        return { count: jest.fn().mockResolvedValue(0) } as any;
      });

      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const result = await (solver as any).determineChallengeType(detection);

      expect(result).toBe(HcaptchaChallengeType.ACCESSIBILITY);
    });

    it('should detect invisible challenge', async () => {
      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      mockPage.evaluate.mockResolvedValue(true);

      const result = await (solver as any).determineChallengeType(detection);

      expect(result).toBe(HcaptchaChallengeType.INVISIBLE);
    });
  });

  describe('detectDifficulty', () => {
    it('should detect easy difficulty', async () => {
      mockChallengeFrame.evaluate.mockResolvedValue({
        hasComplexPrompt: false,
        hasMultipleSteps: false,
        hasTimeLimit: false,
        requiredSelections: 1,
      });

      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const result = await (solver as any).detectDifficulty(detection);

      expect(result).toBe(HcaptchaDifficulty.EASY);
    });

    it('should detect medium difficulty', async () => {
      mockChallengeFrame.evaluate.mockResolvedValue({
        hasComplexPrompt: true,
        hasMultipleSteps: false,
        hasTimeLimit: false,
        requiredSelections: 2,
      });

      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const result = await (solver as any).detectDifficulty(detection);

      expect(result).toBe(HcaptchaDifficulty.MEDIUM);
    });

    it('should detect hard difficulty', async () => {
      mockChallengeFrame.evaluate.mockResolvedValue({
        hasComplexPrompt: true,
        hasMultipleSteps: true,
        hasTimeLimit: true,
        requiredSelections: 4,
      });

      const detection = {
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const result = await (solver as any).detectDifficulty(detection);

      expect(result).toBe(HcaptchaDifficulty.HARD);
    });
  });

  describe('solveCheckboxChallenge', () => {
    it('should solve checkbox challenge successfully', async () => {
      const detection = {
        challengeType: HcaptchaChallengeType.CHECKBOX,
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      const mockCheckbox = {
        waitFor: jest.fn(),
        click: jest.fn(),
      };

      mockAnchorFrame.waitForLoadState.mockResolvedValue(undefined);
      mockAnchorFrame.locator.mockReturnValue(mockCheckbox as any);

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('checkbox-token-123');

      mockPage.frames.mockReturnValue([mockAnchorFrame]);

      const result = await (solver as any).solveCheckboxChallenge(detection, {
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('checkbox-token-123');
      expect(result.challengeType).toBe(HcaptchaChallengeType.CHECKBOX);
      expect(mockCheckbox.click).toHaveBeenCalled();
      expect(waitForTokenSpy).toHaveBeenCalled();

      waitForTokenSpy.mockRestore();
    });
  });

  describe('solveInvisibleChallenge', () => {
    it('should solve invisible challenge successfully', async () => {
      const detection = {
        challengeType: HcaptchaChallengeType.INVISIBLE,
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        callback: 'testCallback',
        confidence: 0.9,
      };

      mockAnchorFrame.waitForLoadState.mockResolvedValue(undefined);

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('invisible-token-123');

      const result = await (solver as any).solveInvisibleChallenge(detection, {
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('invisible-token-123');
      expect(result.challengeType).toBe(HcaptchaChallengeType.INVISIBLE);

      waitForTokenSpy.mockRestore();
    });
  });

  describe('solveAudioChallenge', () => {
    it('should solve audio challenge successfully', async () => {
      const detection = {
        challengeType: HcaptchaChallengeType.AUDIO,
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const mockAudioButton = {
        waitFor: jest.fn(),
        click: jest.fn(),
      };

      const mockInput = {
        waitFor: jest.fn(),
        fill: jest.fn(),
        press: jest.fn(),
      };

      mockChallengeFrame.waitForLoadState.mockResolvedValue(undefined);
      mockChallengeFrame.locator.mockImplementation((selector: string) => {
        if (selector.includes('audio-button')) {
          return mockAudioButton as any;
        }
        if (selector.includes('audio-response')) {
          return mockInput as any;
        }
        return { count: jest.fn().mockResolvedValue(0) } as any;
      });

      mockChallengeFrame.evaluate.mockResolvedValue('https://audio-url.com/audio.mp3');

      mockAudioProcessing.processAudioCaptcha.mockResolvedValue({
        transcription: 'test123',
        confidence: 0.9,
        provider: 'google-cloud' as any,
        cached: false,
        duration: 1000,
      });

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('audio-token-123');

      const extractAudioUrlSpy = jest
        .spyOn(solver as any, 'extractAudioUrl')
        .mockResolvedValue('https://audio-url.com/audio.mp3');

      const result = await (solver as any).solveAudioChallenge(detection, {
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('audio-token-123');
      expect(result.challengeType).toBe(HcaptchaChallengeType.AUDIO);
      expect(mockAudioButton.click).toHaveBeenCalled();
      expect(mockAudioProcessing.processAudioCaptcha).toHaveBeenCalled();

      waitForTokenSpy.mockRestore();
      extractAudioUrlSpy.mockRestore();
    });

    it('should throw error when audio challenges are disabled', async () => {
      const solverWithDisabledAudio = new NativeHcaptchaSolver(
        mockPage,
        mockWidgetInteraction,
        mockAudioProcessing,
        mockPerformanceTracker,
        { enableAudioChallenges: false },
      );

      const detection = {
        challengeType: HcaptchaChallengeType.AUDIO,
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      await expect(
        (solverWithDisabledAudio as any).solveAudioChallenge(detection, {
          type: 'hcaptcha',
          url: 'https://example.com',
        }),
      ).rejects.toThrow('Audio challenges are disabled');
    });
  });

  describe('solveAccessibilityChallenge', () => {
    it('should solve accessibility challenge successfully', async () => {
      const detection = {
        challengeType: HcaptchaChallengeType.ACCESSIBILITY,
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      const mockAccessibilityButton = {
        waitFor: jest.fn(),
        click: jest.fn(),
      };

      mockChallengeFrame.waitForLoadState.mockResolvedValue(undefined);
      mockChallengeFrame.locator.mockReturnValue(mockAccessibilityButton as any);
      mockChallengeFrame.evaluate.mockResolvedValue('Challenge text');

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('accessibility-token-123');

      const result = await (solver as any).solveAccessibilityChallenge(detection, {
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('accessibility-token-123');
      expect(result.challengeType).toBe(HcaptchaChallengeType.ACCESSIBILITY);
      expect(mockAccessibilityButton.click).toHaveBeenCalled();

      waitForTokenSpy.mockRestore();
    });
  });

  describe('extractAudioUrl', () => {
    it('should extract audio URL from audio element', async () => {
      mockChallengeFrame.evaluate.mockResolvedValue('https://audio-url.com/audio.mp3');

      const result = await (solver as any).extractAudioUrl(mockChallengeFrame);

      expect(result).toBe('https://audio-url.com/audio.mp3');
    });

    it('should return null when audio URL not found', async () => {
      mockChallengeFrame.evaluate.mockResolvedValue(null);

      const result = await (solver as any).extractAudioUrl(mockChallengeFrame);

      expect(result).toBeNull();
    });
  });

  describe('waitForToken', () => {
    it('should extract token from textarea', async () => {
      mockPage.evaluate.mockResolvedValue('test-token-123');

      const result = await (solver as any).waitForToken(mockAnchorFrame, 5000);

      expect(result).toBe('test-token-123');
    });

    it('should extract token from input field', async () => {
      mockPage.evaluate
        .mockResolvedValueOnce(null) // First check for textarea
        .mockResolvedValueOnce('test-token-456'); // Second check for input

      const result = await (solver as any).waitForToken(mockAnchorFrame, 5000);

      expect(result).toBe('test-token-456');
    });

    it('should timeout when token not found', async () => {
      mockPage.evaluate.mockResolvedValue(null);

      await expect(
        (solver as any).waitForToken(mockAnchorFrame, 100),
      ).rejects.toThrow('Timeout waiting for hCAPTCHA token');
    });
  });

  describe('solve', () => {
    it('should solve challenge with retry logic', async () => {
      const detectionSpy = jest
        .spyOn(solver as any, 'detectHcaptchaWidget')
        .mockResolvedValue({
          anchorIframe: mockAnchorFrame,
          challengeIframe: null,
          confidence: 0.9,
        });

      const solveChallengeSpy = jest
        .spyOn(solver as any, 'solveChallenge')
        .mockResolvedValue({
          token: 'test-token',
          solvedAt: new Date(),
          challengeType: HcaptchaChallengeType.CHECKBOX,
          duration: 1000,
        });

      const determineChallengeTypeSpy = jest
        .spyOn(solver as any, 'determineChallengeType')
        .mockResolvedValue(HcaptchaChallengeType.CHECKBOX);

      const result = await solver.solve({
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('test-token');
      expect(result.solverId).toBe('hcaptcha-native');
      expect(detectionSpy).toHaveBeenCalled();
      expect(solveChallengeSpy).toHaveBeenCalled();

      detectionSpy.mockRestore();
      solveChallengeSpy.mockRestore();
      determineChallengeTypeSpy.mockRestore();
    });

    it('should retry on failure', async () => {
      const detectionSpy = jest
        .spyOn(solver as any, 'detectHcaptchaWidget')
        .mockResolvedValue({
          anchorIframe: mockAnchorFrame,
          challengeIframe: null,
          confidence: 0.9,
        });

      const solveChallengeSpy = jest
        .spyOn(solver as any, 'solveChallenge')
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockResolvedValueOnce({
          token: 'test-token',
          solvedAt: new Date(),
          challengeType: HcaptchaChallengeType.CHECKBOX,
          duration: 1000,
        });

      const determineChallengeTypeSpy = jest
        .spyOn(solver as any, 'determineChallengeType')
        .mockResolvedValue(HcaptchaChallengeType.CHECKBOX);

      const sleepSpy = jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      const result = await solver.solve({
        type: 'hcaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('test-token');
      expect(solveChallengeSpy).toHaveBeenCalledTimes(2);
      expect(sleepSpy).toHaveBeenCalled();

      detectionSpy.mockRestore();
      solveChallengeSpy.mockRestore();
      determineChallengeTypeSpy.mockRestore();
      sleepSpy.mockRestore();
    });

    it('should throw error after max retries', async () => {
      const detectionSpy = jest
        .spyOn(solver as any, 'detectHcaptchaWidget')
        .mockResolvedValue({
          anchorIframe: mockAnchorFrame,
          challengeIframe: null,
          confidence: 0.9,
        });

      const solveChallengeSpy = jest
        .spyOn(solver as any, 'solveChallenge')
        .mockRejectedValue(new Error('Challenge failed'));

      const determineChallengeTypeSpy = jest
        .spyOn(solver as any, 'determineChallengeType')
        .mockResolvedValue(HcaptchaChallengeType.CHECKBOX);

      jest.spyOn(solver as any, 'sleep').mockResolvedValue(undefined);

      await expect(
        solver.solve({
          type: 'hcaptcha',
          url: 'https://example.com',
        }),
      ).rejects.toThrow('Failed to solve hCAPTCHA challenge after 3 attempts');

      expect(solveChallengeSpy).toHaveBeenCalledTimes(3);

      detectionSpy.mockRestore();
      solveChallengeSpy.mockRestore();
      determineChallengeTypeSpy.mockRestore();
    });
  });

  describe('getMetrics', () => {
    it('should return solver metrics', () => {
      const metrics = solver.getMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.totalAttempts).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });
});

