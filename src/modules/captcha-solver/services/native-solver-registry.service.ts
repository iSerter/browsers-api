import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SolverRegistry } from '../factories/solver-registry.service';
import { SolverCapability } from '../factories/interfaces/solver-capability.interface';
import { TurnstileSolver } from '../solvers/turnstile-solver';
import { NativeRecaptchaSolver } from '../solvers/native-recaptcha-solver';

/**
 * Service for registering native solvers
 * Native solvers use browser automation instead of external APIs
 */
@Injectable()
export class NativeSolverRegistryService implements OnModuleInit {
  private readonly logger = new Logger(NativeSolverRegistryService.name);

  constructor(private readonly solverRegistry: SolverRegistry) {}

  async onModuleInit() {
    this.logger.log('Initializing Native Solver Registry...');
    this.registerNativeSolvers();
    this.logger.log('Native Solver Registry initialized');
  }

  /**
   * Register all native solvers
   */
  private registerNativeSolvers(): void {
    // Register TurnstileSolver
    const turnstileCapabilities: SolverCapability = {
      supportedChallengeTypes: ['recaptcha'], // Turnstile is treated as recaptcha type
      maxConcurrency: 10,
      averageResponseTime: 5000, // 5 seconds average
      successRate: 0.7, // Initial estimate, will be updated by performance tracker
      isEnabled: true,
      priority: 100, // High priority for native solvers (preferred over external)
      metadata: {
        solverType: 'native',
        name: 'Turnstile Native Solver',
        description: 'Browser automation-based solver for Cloudflare Turnstile challenges',
        supportsWidgetModes: ['managed', 'non-interactive', 'invisible'],
      },
    };

    this.solverRegistry.register(
      'turnstile-native',
      TurnstileSolver,
      turnstileCapabilities,
    );

    this.logger.log('Registered TurnstileSolver as native solver');

    // Register NativeRecaptchaSolver
    const recaptchaCapabilities: SolverCapability = {
      supportedChallengeTypes: ['recaptcha'],
      maxConcurrency: 10,
      averageResponseTime: 15000, // 15 seconds average (varies by challenge type)
      successRate: 0.6, // Initial estimate, will be updated by performance tracker
      isEnabled: true,
      priority: 100, // High priority for native solvers (preferred over external)
      metadata: {
        solverType: 'native',
        name: 'Native reCAPTCHA Solver',
        description: 'Browser automation-based solver for Google reCAPTCHA v2 and v3 challenges',
        supportsVersions: ['v2', 'v3'],
        supportsChallengeTypes: ['checkbox', 'invisible', 'audio', 'image'],
      },
    };

    this.solverRegistry.register(
      'recaptcha-native',
      NativeRecaptchaSolver,
      recaptchaCapabilities,
    );

    this.logger.log('Registered NativeRecaptchaSolver as native solver');
  }
}

