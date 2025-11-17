import { Test, TestingModule } from '@nestjs/testing';
import { Page, Frame } from 'playwright';
import { NativeRecaptchaSolver } from './native-recaptcha-solver';
import { CaptchaWidgetInteractionService } from '../services/captcha-widget-interaction.service';
import { SolverPerformanceTracker } from '../factories/solver-performance-tracker.service';
import { AudioCaptchaProcessingService } from '../services/audio-captcha-processing.service';
import { HumanBehaviorSimulationService } from '../services/human-behavior-simulation.service';
import {
  RecaptchaVersion,
  RecaptchaV2ChallengeType,
} from './interfaces/recaptcha-solver.interface';
import { CaptchaWidgetType } from '../services/interfaces/widget-interaction.interface';
import { SolverUnavailableException } from '../exceptions';

describe('NativeRecaptchaSolver', () => {
  let solver: NativeRecaptchaSolver;
  let mockPage: jest.Mocked<Page>;
  let mockWidgetInteraction: jest.Mocked<CaptchaWidgetInteractionService>;
  let mockAudioProcessing: jest.Mocked<AudioCaptchaProcessingService>;
  let mockBehaviorSimulation: jest.Mocked<HumanBehaviorSimulationService>;
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
      viewportSize: jest.fn(),
      mouse: {
        move: jest.fn(),
        wheel: jest.fn(),
      },
      keyboard: {
        press: jest.fn(),
      },
    } as any;

    // Create mock frames
    mockFrame = {
      url: jest.fn(),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    mockAnchorFrame = {
      url: jest.fn().mockReturnValue('https://www.google.com/recaptcha/api2/anchor'),
      evaluate: jest.fn(),
      waitForLoadState: jest.fn(),
      locator: jest.fn(),
    } as any;

    mockChallengeFrame = {
      url: jest.fn().mockReturnValue('https://www.google.com/recaptcha/api2/bframe'),
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

    // Create mock behavior simulation service
    mockBehaviorSimulation = {
      moveMouseBezier: jest.fn(),
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
          provide: HumanBehaviorSimulationService,
          useValue: mockBehaviorSimulation,
        },
        {
          provide: SolverPerformanceTracker,
          useValue: mockPerformanceTracker,
        },
      ],
    }).compile();

    solver = new NativeRecaptchaSolver(
      mockPage,
      mockWidgetInteraction,
      mockAudioProcessing,
      mockBehaviorSimulation,
      mockPerformanceTracker,
    );
  });

  describe('getName', () => {
    it('should return correct solver name', () => {
      expect(solver.getName()).toBe('recaptcha-native');
    });
  });

  describe('isAvailable', () => {
    it('should always return true for native solvers', async () => {
      const result = await solver.isAvailable();
      expect(result).toBe(true);
    });
  });

  describe('detectRecaptchaWidget', () => {
    it('should detect v2 checkbox widget', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.RECAPTCHA,
        iframe: mockFrame,
        confidence: 0.9,
        iframeSrc: 'https://www.google.com/recaptcha/api2/anchor',
      });

      mockPage.evaluate.mockResolvedValue({
        version: 'v2',
        hasDataSitekey: true,
        callback: 'callback',
        size: 'normal',
      });

      mockPage.frames.mockReturnValue([mockAnchorFrame, mockChallengeFrame]);

      const result = await (solver as any).detectRecaptchaWidget({
        type: 'recaptcha',
        url: 'https://example.com',
      });

      expect(result.version).toBe(RecaptchaVersion.V2);
      expect(result.challengeType).toBe(RecaptchaV2ChallengeType.CHECKBOX);
      expect(result.anchorIframe).toBeDefined();
      expect(result.confidence).toBe(0.9);
    });

    it('should detect v3 widget', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.RECAPTCHA,
        iframe: mockFrame,
        confidence: 0.9,
        iframeSrc: 'https://www.google.com/recaptcha/api2/anchor',
      });

      mockPage.evaluate.mockResolvedValue({
        version: 'v3',
        hasDataSitekey: true,
        action: 'submit',
      });

      mockPage.frames.mockReturnValue([mockAnchorFrame]);

      const result = await (solver as any).detectRecaptchaWidget({
        type: 'recaptcha',
        url: 'https://example.com',
        version: 'v3',
      });

      expect(result.version).toBe(RecaptchaVersion.V3);
      expect(result.anchorIframe).toBeDefined();
    });

    it('should return low confidence when widget not detected', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.RECAPTCHA,
        iframe: null,
        confidence: 0.2,
      });

      const result = await (solver as any).detectRecaptchaWidget({
        type: 'recaptcha',
        url: 'https://example.com',
      });

      expect(result.confidence).toBe(0.2);
      expect(result.anchorIframe).toBeNull();
    });
  });

  describe('determineVersion', () => {
    it('should detect v2 version', async () => {
      mockPage.evaluate.mockResolvedValue({
        version: 'v2',
        hasDataSitekey: true,
        callback: 'callback',
      });

      const result = await (solver as any).determineVersion(mockFrame);

      expect(result.version).toBe(RecaptchaVersion.V2);
    });

    it('should detect v3 version', async () => {
      mockPage.evaluate.mockResolvedValue({
        version: 'v3',
        hasDataSitekey: true,
        action: 'submit',
      });

      const result = await (solver as any).determineVersion(mockFrame);

      expect(result.version).toBe(RecaptchaVersion.V3);
    });

    it('should default to v2 on error', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Evaluation failed'));

      const result = await (solver as any).determineVersion(mockFrame);

      expect(result.version).toBe(RecaptchaVersion.V2);
    });
  });

  describe('determineChallengeType', () => {
    it('should detect checkbox challenge', async () => {
      mockPage.evaluate.mockResolvedValue({
        type: 'checkbox',
        isVisible: true,
      });

      const result = await (solver as any).determineChallengeType(
        mockFrame,
        RecaptchaVersion.V2,
      );

      expect(result).toBe(RecaptchaV2ChallengeType.CHECKBOX);
    });

    it('should detect invisible challenge', async () => {
      mockPage.evaluate.mockResolvedValue({
        type: 'invisible',
        isVisible: false,
      });

      const result = await (solver as any).determineChallengeType(
        mockFrame,
        RecaptchaVersion.V2,
      );

      expect(result).toBe(RecaptchaV2ChallengeType.INVISIBLE);
    });

    it('should return undefined for v3', async () => {
      const result = await (solver as any).determineChallengeType(
        mockFrame,
        RecaptchaVersion.V3,
      );

      expect(result).toBeUndefined();
    });
  });

  describe('solveV2CheckboxChallenge', () => {
    it('should solve checkbox challenge successfully', async () => {
      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.CHECKBOX,
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
      mockPage.frames.mockReturnValue([mockAnchorFrame]);

      // Mock token extraction
      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('test-token-123');

      const result = await (solver as any).solveV2CheckboxChallenge(
        detection,
        { type: 'recaptcha', url: 'https://example.com' },
      );

      expect(result.token).toBe('test-token-123');
      expect(result.version).toBe(RecaptchaVersion.V2);
      expect(result.challengeType).toBe(RecaptchaV2ChallengeType.CHECKBOX);
      expect(mockCheckbox.click).toHaveBeenCalled();

      waitForTokenSpy.mockRestore();
    });

    it('should handle challenge iframe appearance', async () => {
      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.CHECKBOX,
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      const mockCheckbox = {
        waitFor: jest.fn().mockResolvedValue(undefined),
        click: jest.fn().mockResolvedValue(undefined),
      };

      mockAnchorFrame.waitForLoadState.mockResolvedValue(undefined);
      mockAnchorFrame.locator.mockReturnValue(mockCheckbox as any);
      mockPage.frames.mockReturnValue([mockAnchorFrame, mockChallengeFrame]);

      // Mock findIframes to return challenge iframe
      const findIframesSpy = jest
        .spyOn(solver as any, 'findIframes')
        .mockResolvedValue({
          anchorIframe: mockAnchorFrame,
          challengeIframe: mockChallengeFrame,
        });

      // Mock sleep to resolve immediately
      const sleepSpy = jest
        .spyOn(solver as any, 'sleep')
        .mockResolvedValue(undefined);

      // Mock challenge type detection
      const detectChallengeTypeSpy = jest
        .spyOn(solver as any, 'detectChallengeType')
        .mockResolvedValue(RecaptchaV2ChallengeType.AUDIO);

      // Mock audio challenge solving
      const solveAudioSpy = jest
        .spyOn(solver as any, 'solveV2AudioChallenge')
        .mockResolvedValue({
          token: 'audio-token',
          solvedAt: new Date(),
          version: RecaptchaVersion.V2,
          challengeType: RecaptchaV2ChallengeType.AUDIO,
          duration: 1000,
        });

      const result = await (solver as any).solveV2CheckboxChallenge(
        detection,
        { type: 'recaptcha', url: 'https://example.com' },
      );

      expect(result.token).toBe('audio-token');
      expect(solveAudioSpy).toHaveBeenCalled();

      findIframesSpy.mockRestore();
      sleepSpy.mockRestore();
      detectChallengeTypeSpy.mockRestore();
      solveAudioSpy.mockRestore();
    });
  });

  describe('solveV2InvisibleChallenge', () => {
    it('should solve invisible challenge successfully', async () => {
      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.INVISIBLE,
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      mockAnchorFrame.waitForLoadState.mockResolvedValue(undefined);

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('invisible-token-123');

      const result = await (solver as any).solveV2InvisibleChallenge(
        detection,
        { type: 'recaptcha', url: 'https://example.com' },
      );

      expect(result.token).toBe('invisible-token-123');
      expect(result.challengeType).toBe(RecaptchaV2ChallengeType.INVISIBLE);

      waitForTokenSpy.mockRestore();
    });
  });

  describe('solveV2AudioChallenge', () => {
    it('should solve audio challenge successfully', async () => {
      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.AUDIO,
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
        return null;
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

      const result = await (solver as any).solveV2AudioChallenge(
        detection,
        { type: 'recaptcha', url: 'https://example.com' },
      );

      expect(result.token).toBe('audio-token-123');
      expect(result.challengeType).toBe(RecaptchaV2ChallengeType.AUDIO);
      expect(mockAudioButton.click).toHaveBeenCalled();
      expect(mockAudioProcessing.processAudioCaptcha).toHaveBeenCalled();

      waitForTokenSpy.mockRestore();
      extractAudioUrlSpy.mockRestore();
    });

    it('should throw error when audio challenges are disabled', async () => {
      const solverWithDisabledAudio = new NativeRecaptchaSolver(
        mockPage,
        mockWidgetInteraction,
        mockAudioProcessing,
        mockBehaviorSimulation,
        mockPerformanceTracker,
        { enableAudioChallenges: false },
      );

      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.AUDIO,
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      await expect(
        (solverWithDisabledAudio as any).solveV2AudioChallenge(detection, {
          type: 'recaptcha',
          url: 'https://example.com',
        }),
      ).rejects.toThrow('Audio challenges are disabled');
    });
  });

  describe('solveV2ImageChallenge', () => {
    it('should solve image challenge successfully', async () => {
      const detection = {
        version: RecaptchaVersion.V2,
        challengeType: RecaptchaV2ChallengeType.IMAGE,
        anchorIframe: mockAnchorFrame,
        challengeIframe: mockChallengeFrame,
        confidence: 0.9,
      };

      mockChallengeFrame.waitForLoadState.mockResolvedValue(undefined);
      mockChallengeFrame.evaluate.mockResolvedValue('Select all images with traffic lights');

      const getTilesSpy = jest
        .spyOn(solver as any, 'getImageChallengeTiles')
        .mockResolvedValue([
          { index: 0, imageUrl: 'https://image1.jpg' },
          { index: 1, imageUrl: 'https://image2.jpg' },
          { index: 2, imageUrl: 'https://image3.jpg' },
        ]);

      const solveImageSpy = jest
        .spyOn(solver as any, 'solveImageChallenge')
        .mockResolvedValue({
          selectedTiles: [0, 2],
          confidence: 0.8,
          method: 'pattern',
        });

      const mockTile = {
        click: jest.fn(),
      };

      const mockVerifyButton = {
        waitFor: jest.fn(),
        click: jest.fn(),
      };

      mockChallengeFrame.locator.mockImplementation((selector: string) => {
        if (selector.includes('image-tile')) {
          return {
            nth: jest.fn().mockReturnValue(mockTile),
          } as any;
        }
        if (selector.includes('verify-button')) {
          return mockVerifyButton as any;
        }
        return null;
      });

      const waitForTokenSpy = jest
        .spyOn(solver as any, 'waitForToken')
        .mockResolvedValue('image-token-123');

      const result = await (solver as any).solveV2ImageChallenge(
        detection,
        { type: 'recaptcha', url: 'https://example.com' },
      );

      expect(result.token).toBe('image-token-123');
      expect(result.challengeType).toBe(RecaptchaV2ChallengeType.IMAGE);
      expect(solveImageSpy).toHaveBeenCalled();

      getTilesSpy.mockRestore();
      solveImageSpy.mockRestore();
      waitForTokenSpy.mockRestore();
    });
  });

  describe('solveV3Challenge', () => {
    it('should solve v3 challenge successfully', async () => {
      const detection = {
        version: RecaptchaVersion.V3,
        anchorIframe: mockAnchorFrame,
        challengeIframe: null,
        confidence: 0.9,
      };

      mockPage.viewportSize.mockReturnValue({ width: 1920, height: 1080 });

      const simulateMouseSpy = jest
        .spyOn(solver as any, 'simulateMouseMovements')
        .mockResolvedValue(undefined);

      const simulateScrollsSpy = jest
        .spyOn(solver as any, 'simulateScrolls')
        .mockResolvedValue(undefined);

      const simulateKeyboardSpy = jest
        .spyOn(solver as any, 'simulateKeyboardEvents')
        .mockResolvedValue(undefined);

      const waitForV3TokenSpy = jest
        .spyOn(solver as any, 'waitForV3Token')
        .mockResolvedValue('v3-token-123');

      const result = await (solver as any).solveV3Challenge(detection, {
        type: 'recaptcha',
        url: 'https://example.com',
        version: 'v3',
      });

      expect(result.token).toBe('v3-token-123');
      expect(result.version).toBe(RecaptchaVersion.V3);
      expect(simulateMouseSpy).toHaveBeenCalled();
      expect(simulateScrollsSpy).toHaveBeenCalled();
      expect(simulateKeyboardSpy).toHaveBeenCalled();

      simulateMouseSpy.mockRestore();
      simulateScrollsSpy.mockRestore();
      simulateKeyboardSpy.mockRestore();
      waitForV3TokenSpy.mockRestore();
    });
  });

  describe('waitForToken', () => {
    it('should extract token from textarea', async () => {
      mockPage.evaluate.mockResolvedValue('test-token-from-textarea');

      const result = await (solver as any).waitForToken(mockAnchorFrame, 5000);

      expect(result).toBe('test-token-from-textarea');
    });

    it('should extract token from network response', async () => {
      mockPage.evaluate.mockResolvedValue(null);

      let responseHandler: any;
      mockPage.on.mockImplementation((event: string, handler: any) => {
        if (event === 'response') {
          responseHandler = handler;
        }
      });

      const mockResponse = {
        url: jest.fn().mockReturnValue('https://www.google.com/recaptcha/api2/userverify'),
        text: jest.fn().mockResolvedValue('{"token": "test-token-from-response"}'),
      };

      const promise = (solver as any).waitForToken(mockAnchorFrame, 5000);

      // Simulate response
      setTimeout(() => {
        if (responseHandler) {
          responseHandler(mockResponse);
        }
      }, 100);

      const result = await promise;
      expect(result).toBe('test-token-from-response');
    });

    it('should timeout if token not found', async () => {
      mockPage.evaluate.mockResolvedValue(null);

      await expect(
        (solver as any).waitForToken(mockAnchorFrame, 100),
      ).rejects.toThrow('Timeout waiting for reCAPTCHA token');
    });
  });

  describe('solve', () => {
    it('should solve challenge with retry logic', async () => {
      // Widget detection succeeds on first attempt
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.RECAPTCHA,
        iframe: mockFrame,
        confidence: 0.9,
      });

      mockPage.evaluate.mockResolvedValue({
        version: 'v2',
        hasDataSitekey: true,
      });

      mockPage.frames.mockReturnValue([mockAnchorFrame]);

      const solveChallengeSpy = jest
        .spyOn(solver as any, 'solveChallenge')
        .mockResolvedValue({
          token: 'final-token',
          solvedAt: new Date(),
          version: RecaptchaVersion.V2,
          challengeType: RecaptchaV2ChallengeType.CHECKBOX,
          duration: 1000,
        });

      const result = await solver.solve({
        type: 'recaptcha',
        url: 'https://example.com',
      });

      expect(result.token).toBe('final-token');
      expect(solveChallengeSpy).toHaveBeenCalled();

      solveChallengeSpy.mockRestore();
    });

    it('should throw error after max retries', async () => {
      mockWidgetInteraction.detectWidget.mockResolvedValue({
        widgetType: CaptchaWidgetType.RECAPTCHA,
        iframe: null,
        confidence: 0.2,
      });

      await expect(
        solver.solve({
          type: 'recaptcha',
          url: 'https://example.com',
        }),
      ).rejects.toThrow(SolverUnavailableException);
    });
  });

  describe('getMetrics', () => {
    it('should return solver metrics', () => {
      const metrics = solver.getMetrics();

      expect(metrics).toHaveProperty('totalAttempts');
      expect(metrics).toHaveProperty('successCount');
      expect(metrics).toHaveProperty('failureCount');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('averageSolvingTime');
      expect(metrics).toHaveProperty('versionDistribution');
      expect(metrics).toHaveProperty('challengeTypeDistribution');
      expect(metrics).toHaveProperty('failureReasons');
    });
  });
});

