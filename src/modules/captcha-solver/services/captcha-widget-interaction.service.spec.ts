import { Test, TestingModule } from '@nestjs/testing';
import { CaptchaWidgetInteractionService } from './captcha-widget-interaction.service';
import { HumanBehaviorSimulationService } from './human-behavior-simulation.service';
import {
  CaptchaWidgetType,
  WidgetInteractionConfig,
  ElementLocatorOptions,
} from './interfaces/widget-interaction.interface';

describe('CaptchaWidgetInteractionService', () => {
  let service: CaptchaWidgetInteractionService;
  let behaviorSimulation: HumanBehaviorSimulationService;
  let mockPage: any;
  let mockFrame: any;
  let mockLocator: any;

  beforeEach(async () => {
    jest.setTimeout(30000);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaptchaWidgetInteractionService,
        HumanBehaviorSimulationService,
      ],
    }).compile();

    service = module.get<CaptchaWidgetInteractionService>(
      CaptchaWidgetInteractionService,
    );
    behaviorSimulation = module.get<HumanBehaviorSimulationService>(
      HumanBehaviorSimulationService,
    );

    // Create mock locator
    mockLocator = {
      waitFor: jest
        .fn()
        .mockResolvedValue(undefined),
      click: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
      selectOption: jest.fn().mockResolvedValue(undefined),
      focus: jest.fn().mockResolvedValue(undefined),
      first: jest.fn().mockReturnThis(),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
    };

    // Create mock frame
    mockFrame = {
      url: jest.fn().mockReturnValue('https://www.google.com/recaptcha/api2/anchor'),
      name: jest.fn().mockReturnValue('recaptcha-frame'),
      evaluate: jest.fn().mockResolvedValue(true),
      locator: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByLabel: jest.fn().mockReturnValue(mockLocator),
    };

    // Create mock page
    mockPage = {
      frames: jest.fn().mockReturnValue([mockFrame]),
      url: jest.fn().mockReturnValue('https://example.com'),
      title: jest.fn().mockResolvedValue('Test Page'),
      locator: jest.fn().mockReturnValue(mockLocator),
      getByRole: jest.fn().mockReturnValue(mockLocator),
      getByText: jest.fn().mockReturnValue(mockLocator),
      getByLabel: jest.fn().mockReturnValue(mockLocator),
      screenshot: jest.fn().mockResolvedValue(Buffer.from('screenshot')),
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      keyboard: {
        down: jest.fn().mockResolvedValue(undefined),
        up: jest.fn().mockResolvedValue(undefined),
        type: jest.fn().mockResolvedValue(undefined),
      },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('waitForCaptchaWidget', () => {
    it('should detect reCAPTCHA widget', async () => {
      mockFrame.url.mockReturnValue(
        'https://www.google.com/recaptcha/api2/anchor',
      );
      mockFrame.evaluate.mockResolvedValue(true);

      const result = await service.waitForCaptchaWidget(
        mockPage,
        CaptchaWidgetType.RECAPTCHA,
      );

      expect(result.widgetType).toBe(CaptchaWidgetType.RECAPTCHA);
      expect(result.iframe).toBe(mockFrame);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect hCAPTCHA widget', async () => {
      mockFrame.url.mockReturnValue('https://hcaptcha.com/1/api.js');
      mockFrame.evaluate.mockResolvedValue(true);

      const result = await service.waitForCaptchaWidget(
        mockPage,
        CaptchaWidgetType.HCAPTCHA,
      );

      expect(result.widgetType).toBe(CaptchaWidgetType.HCAPTCHA);
      expect(result.iframe).toBe(mockFrame);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return unknown when no widget found', async () => {
      mockFrame.url.mockReturnValue('https://example.com/other');
      mockFrame.evaluate.mockResolvedValue(false);

      const result = await service.waitForCaptchaWidget(mockPage);

      expect(result.widgetType).toBe(CaptchaWidgetType.UNKNOWN);
      expect(result.iframe).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      // Mock detectWidget to throw an error
      jest.spyOn(service, 'detectWidget').mockRejectedValue(new Error('Frame access error'));

      const result = await service.waitForCaptchaWidget(mockPage);

      expect(result.widgetType).toBe(CaptchaWidgetType.UNKNOWN);
      expect(result.iframe).toBeNull();
      expect(result.details?.error).toBeDefined();
      expect(result.details?.error).toBe('Frame access error');
    });
  });

  describe('detectWidget', () => {
    it('should detect Turnstile widget', async () => {
      mockFrame.url.mockReturnValue(
        'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile',
      );
      mockFrame.evaluate.mockResolvedValue(true);

      const result = await service.detectWidget(
        mockPage,
        CaptchaWidgetType.TURNSTILE,
      );

      expect(result.widgetType).toBe(CaptchaWidgetType.TURNSTILE);
      expect(result.iframe).toBe(mockFrame);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should detect DataDome widget', async () => {
      mockFrame.url.mockReturnValue('https://datadome.co/challenge');
      mockFrame.evaluate.mockResolvedValue(true);

      const result = await service.detectWidget(
        mockPage,
        CaptchaWidgetType.DATADOME,
      );

      expect(result.widgetType).toBe(CaptchaWidgetType.DATADOME);
      expect(result.iframe).toBe(mockFrame);
    });

    it('should return low confidence for non-matching frames', async () => {
      mockFrame.url.mockReturnValue('https://example.com/other');

      const result = await service.detectWidget(
        mockPage,
        CaptchaWidgetType.RECAPTCHA,
      );

      expect(result.confidence).toBe(0);
    });
  });

  describe('switchToIframe', () => {
    it('should return frame when provided as Frame object', async () => {
      const result = await service.switchToIframe(mockPage, mockFrame);

      expect(result).toBe(mockFrame);
    });

    it('should find frame by URL pattern', async () => {
      const result = await service.switchToIframe(mockPage, 'recaptcha');

      expect(result).toBe(mockFrame);
    });

    it('should find frame by name', async () => {
      mockFrame.name.mockReturnValue('recaptcha-frame');
      const result = await service.switchToIframe(mockPage, 'recaptcha-frame');

      expect(result).toBe(mockFrame);
    });

    it('should return null when frame not found', async () => {
      mockPage.frames.mockReturnValue([]);
      const result = await service.switchToIframe(mockPage, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('locateElement', () => {
    it('should locate element by CSS selector', async () => {
      const options: ElementLocatorOptions = {
        css: '.captcha-button',
        timeout: 1000,
      };

      const result = await service.locateElement(mockPage, options);

      expect(result).toBe(mockLocator);
      expect(mockPage.locator).toHaveBeenCalledWith('.captcha-button');
      expect(mockLocator.waitFor).toHaveBeenCalledWith({
        state: 'visible',
        timeout: 1000,
      });
    });

    it('should try XPath when CSS fails', async () => {
      mockPage.locator.mockImplementation((selector: string) => {
        if (selector.startsWith('//')) {
          return mockLocator;
        }
        throw new Error('Not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
        xpath: '//button[@class="captcha-button"]',
        timeout: 1000,
      };

      const result = await service.locateElement(mockPage, options);

      expect(result).toBe(mockLocator);
    });

    it('should try role-based selector', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Not found');
      });

      const options: ElementLocatorOptions = {
        role: 'button',
        text: 'Submit',
        timeout: 1000,
      };

      const result = await service.locateElement(mockPage, options);

      expect(result).toBe(mockLocator);
      expect(mockPage.getByRole).toHaveBeenCalledWith('button', {
        name: 'Submit',
      });
    });

    it('should try text content selector', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Not found');
      });
      mockPage.getByRole.mockImplementation(() => {
        throw new Error('Not found');
      });

      const options: ElementLocatorOptions = {
        text: 'Click here',
        timeout: 1000,
      };

      const result = await service.locateElement(mockPage, options);

      expect(result).toBe(mockLocator);
      expect(mockPage.getByText).toHaveBeenCalledWith('Click here');
    });

    it('should return null when all strategies fail', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Not found');
      });
      mockPage.getByRole.mockImplementation(() => {
        throw new Error('Not found');
      });
      mockPage.getByText.mockImplementation(() => {
        throw new Error('Not found');
      });
      mockPage.getByLabel.mockImplementation(() => {
        throw new Error('Not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
        timeout: 100,
      };

      const result = await service.locateElement(mockPage, options);

      expect(result).toBeNull();
    });

    it('should respect visible option', async () => {
      const options: ElementLocatorOptions = {
        css: '.hidden-element',
        visible: false,
        timeout: 1000,
      };

      await service.locateElement(mockPage, options);

      expect(mockLocator.waitFor).toHaveBeenCalledWith({
        state: 'attached',
        timeout: 1000,
      });
    });
  });

  describe('clickElement', () => {
    it('should click element successfully', async () => {
      const options: ElementLocatorOptions = {
        css: '.button',
      };

      const result = await service.clickElement(mockPage, options);

      expect(result.success).toBe(true);
      expect(mockLocator.click).toHaveBeenCalled();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should add human-like delay before click', async () => {
      jest.useFakeTimers();
      const options: ElementLocatorOptions = {
        css: '.button',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: true,
        clickDelayRange: [100, 200],
      };

      const clickPromise = service.clickElement(mockPage, options, config);

      // Advance timers to cover the delay
      await jest.advanceTimersByTimeAsync(250);

      const result = await clickPromise;

      expect(result.success).toBe(true);
      expect(mockLocator.click).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should use force click when configured', async () => {
      const options: ElementLocatorOptions = {
        css: '.button',
      };
      const config: WidgetInteractionConfig = {
        forceClicks: true,
        enableHumanDelays: false, // Disable delays to avoid timeout
      };

      await service.clickElement(mockPage, options, config);

      expect(mockLocator.click).toHaveBeenCalledWith({
        force: true,
        timeout: undefined,
      });
    });

    it('should return error when element not found', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Element not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
      };

      const result = await service.clickElement(mockPage, options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Element not found');
    });
  });

  describe('typeText', () => {
    it('should type text successfully', async () => {
      const options: ElementLocatorOptions = {
        css: 'input[type="text"]',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: false, // Disable delays to use regular typing
      };

      const result = await service.typeText(mockPage, 'test text', options, config);

      expect(result.success).toBe(true);
      expect(mockLocator.focus).toHaveBeenCalled();
      expect(mockLocator.type).toHaveBeenCalledWith('test text', { timeout: undefined });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should use behavior simulation for human-like typing', async () => {
      jest
        .spyOn(behaviorSimulation, 'typeWithTiming')
        .mockResolvedValue(undefined);

      const options: ElementLocatorOptions = {
        css: 'input',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: true,
      };

      await service.typeText(mockPage, 'test', options, config);

      expect(behaviorSimulation.typeWithTiming).toHaveBeenCalledWith(
        mockPage,
        'test',
        expect.objectContaining({
          keyPressMean: expect.any(Number),
          keyPressStdDev: expect.any(Number),
        }),
      );
    });

    it('should fallback to regular typing for frames', async () => {
      // Create a frame mock without keyboard property (not undefined, but missing)
      const frameMock: any = {
        url: jest.fn().mockReturnValue('https://example.com/frame'),
        name: jest.fn().mockReturnValue('test-frame'),
        evaluate: jest.fn().mockResolvedValue(true),
        locator: jest.fn().mockReturnValue(mockLocator),
        getByRole: jest.fn().mockReturnValue(mockLocator),
        getByText: jest.fn().mockReturnValue(mockLocator),
        getByLabel: jest.fn().mockReturnValue(mockLocator),
        // No keyboard property - this is key for the fallback
      };

      const options: ElementLocatorOptions = {
        css: 'input',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: true,
      };

      // Mock behaviorSimulation.typeWithTiming to not be called for frames
      jest.spyOn(behaviorSimulation, 'typeWithTiming').mockResolvedValue(undefined);

      await service.typeText(frameMock, 'test', options, config);

      // Should use regular typing since frame doesn't have keyboard
      expect(mockLocator.type).toHaveBeenCalledWith('test', {
        timeout: undefined,
      });
      // Should not call behaviorSimulation for frames
      expect(behaviorSimulation.typeWithTiming).not.toHaveBeenCalled();
    });

    it('should return error when element not found', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Element not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
      };

      const result = await service.typeText(mockPage, 'test', options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Element not found');
    });
  });

  describe('selectOption', () => {
    it('should select option successfully', async () => {
      const options: ElementLocatorOptions = {
        css: 'select',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: false, // Disable delays to avoid timeout
      };

      const result = await service.selectOption(mockPage, 'value1', options, config);

      expect(result.success).toBe(true);
      expect(mockLocator.selectOption).toHaveBeenCalledWith('value1', {
        timeout: undefined,
      });
    });

    it('should select multiple options', async () => {
      const options: ElementLocatorOptions = {
        css: 'select[multiple]',
      };
      const config: WidgetInteractionConfig = {
        enableHumanDelays: false, // Disable delays to avoid timeout
      };

      await service.selectOption(mockPage, ['value1', 'value2'], options, config);

      expect(mockLocator.selectOption).toHaveBeenCalledWith(
        ['value1', 'value2'],
        { timeout: undefined },
      );
    });

    it('should return error when element not found', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Element not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
      };

      const result = await service.selectOption(mockPage, 'value', options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Element not found');
    });
  });

  describe('waitForElementStability', () => {
    it('should wait for element stability', async () => {
      jest.useFakeTimers();
      const options: ElementLocatorOptions = {
        css: '.widget',
      };

      const stabilityPromise = service.waitForElementStability(
        mockPage,
        options,
        100,
      );

      // Advance timers to resolve setTimeout
      await jest.advanceTimersByTimeAsync(150);

      const result = await stabilityPromise;

      expect(result).toBe(true);
      expect(mockPage.waitForLoadState).toHaveBeenCalledWith('networkidle', {
        timeout: 5000,
      });
      jest.useRealTimers();
    });

    it('should return false when element not found', async () => {
      mockPage.locator.mockImplementation(() => {
        throw new Error('Element not found');
      });

      const options: ElementLocatorOptions = {
        css: '.not-found',
      };

      const result = await service.waitForElementStability(mockPage, options);

      expect(result).toBe(false);
    });
  });

  describe('captureDebugScreenshot', () => {
    it('should capture screenshot when enabled', async () => {
      const config: WidgetInteractionConfig = {
        enableScreenshots: true,
        screenshotDirectory: './test-screenshots',
      };

      const result = await service.captureDebugScreenshot(mockPage, {}, config);

      expect(result.success).toBe(true);
      expect(result.path).toContain('captcha-');
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it('should not capture screenshot when disabled', async () => {
      const config: WidgetInteractionConfig = {
        enableScreenshots: false,
      };

      const result = await service.captureDebugScreenshot(mockPage, {}, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Screenshots disabled');
      expect(mockPage.screenshot).not.toHaveBeenCalled();
    });

    it('should capture element screenshot', async () => {
      const config: WidgetInteractionConfig = {
        enableScreenshots: true,
        screenshotDirectory: './test-screenshots',
      };

      const screenshotOptions = {
        type: 'element' as const,
        selector: '.captcha-widget',
      };

      await service.captureDebugScreenshot(mockPage, screenshotOptions, config);

      expect(mockPage.locator).toHaveBeenCalledWith('.captcha-widget');
      expect(mockLocator.screenshot).toHaveBeenCalled();
    });

    it('should handle screenshot errors gracefully', async () => {
      mockPage.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      const config: WidgetInteractionConfig = {
        enableScreenshots: true,
        screenshotDirectory: './test-screenshots',
      };

      const result = await service.captureDebugScreenshot(mockPage, {}, config);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Screenshot failed');
    });
  });

  describe('waitForDynamicWidget', () => {
    it('should detect widget when it appears', async () => {
      jest.useFakeTimers();

      // Initially no widget, then widget appears
      let callCount = 0;
      jest.spyOn(service, 'detectWidget').mockImplementation(async (): Promise<any> => {
        callCount++;
        if (callCount === 1) {
          return {
            widgetType: CaptchaWidgetType.RECAPTCHA,
            iframe: null,
            confidence: 0,
          };
        }
        return {
          widgetType: CaptchaWidgetType.RECAPTCHA,
          iframe: mockFrame,
          confidence: 0.9,
        };
      });

      const promise = service.waitForDynamicWidget(
        mockPage,
        CaptchaWidgetType.RECAPTCHA,
        5000,
      );

      // Fast-forward time to trigger detection
      jest.advanceTimersByTime(1000);

      const result = await promise;

      expect(result.widgetType).toBe(CaptchaWidgetType.RECAPTCHA);
      expect(result.iframe).toBe(mockFrame);
      expect(result.confidence).toBe(0.9);

      jest.useRealTimers();
    });

    it('should timeout when widget does not appear', async () => {
      jest.useFakeTimers();

      jest
        .spyOn(service, 'detectWidget')
        .mockResolvedValue({
          widgetType: CaptchaWidgetType.RECAPTCHA,
          iframe: null,
          confidence: 0,
        });

      const promise = service.waitForDynamicWidget(
        mockPage,
        CaptchaWidgetType.RECAPTCHA,
        1000,
      );

      jest.advanceTimersByTime(2000);

      const result = await promise;

      expect(result.confidence).toBe(0);
      expect(result.details?.error).toBe('Timeout waiting for widget');

      jest.useRealTimers();
    });
  });
});

