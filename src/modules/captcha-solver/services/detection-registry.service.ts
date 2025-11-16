import { Injectable, Logger } from '@nestjs/common';
import { AntiBotSystemType } from '../interfaces';
import { IDetectionStrategy } from './detection-strategy.interface';

/**
 * Registry service for managing anti-bot detection strategies
 * 
 * This service implements the Registry pattern to allow dynamic
 * registration and retrieval of detection strategies. New anti-bot
 * systems can be added by registering their strategies here.
 */
@Injectable()
export class DetectionRegistryService {
  private readonly logger = new Logger(DetectionRegistryService.name);
  private readonly strategies = new Map<
    AntiBotSystemType,
    IDetectionStrategy
  >();

  /**
   * Register a detection strategy
   * 
   * @param strategy - The detection strategy to register
   * @throws Error if a strategy for the same system type is already registered
   */
  register(strategy: IDetectionStrategy): void {
    if (this.strategies.has(strategy.systemType)) {
      const existing = this.strategies.get(strategy.systemType);
      this.logger.warn(
        `Strategy for ${strategy.systemType} already registered. Overwriting ${existing?.getName()} with ${strategy.getName()}`,
      );
    }

    this.strategies.set(strategy.systemType, strategy);
    this.logger.debug(
      `Registered detection strategy: ${strategy.getName()} for ${strategy.systemType}`,
    );
  }

  /**
   * Register multiple detection strategies at once
   * 
   * @param strategies - Array of detection strategies to register
   */
  registerAll(strategies: IDetectionStrategy[]): void {
    strategies.forEach((strategy) => this.register(strategy));
  }

  /**
   * Get a detection strategy by system type
   * 
   * @param systemType - The anti-bot system type to get strategy for
   * @returns The detection strategy or undefined if not found
   */
  get(systemType: AntiBotSystemType): IDetectionStrategy | undefined {
    return this.strategies.get(systemType);
  }

  /**
   * Check if a strategy is registered for a system type
   * 
   * @param systemType - The anti-bot system type to check
   * @returns True if a strategy is registered, false otherwise
   */
  has(systemType: AntiBotSystemType): boolean {
    return this.strategies.has(systemType);
  }

  /**
   * Get all registered system types
   * 
   * @returns Array of all registered anti-bot system types
   */
  getRegisteredTypes(): AntiBotSystemType[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get all registered strategies
   * 
   * @returns Array of all registered detection strategies
   */
  getAll(): IDetectionStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Unregister a detection strategy
   * 
   * @param systemType - The anti-bot system type to unregister
   * @returns True if a strategy was removed, false if it wasn't registered
   */
  unregister(systemType: AntiBotSystemType): boolean {
    const removed = this.strategies.delete(systemType);
    if (removed) {
      this.logger.debug(`Unregistered detection strategy for ${systemType}`);
    }
    return removed;
  }

  /**
   * Clear all registered strategies
   */
  clear(): void {
    this.strategies.clear();
    this.logger.debug('Cleared all detection strategies');
  }

  /**
   * Get the number of registered strategies
   */
  getCount(): number {
    return this.strategies.size;
  }
}

