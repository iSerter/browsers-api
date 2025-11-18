import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';
import { ErrorContext } from '../interfaces/error-context.interface';

/**
 * Context key for storing error context in AsyncLocalStorage
 */
const ERROR_CONTEXT_KEY = 'errorContext';

/**
 * Service for managing error context using AsyncLocalStorage.
 * Provides request-scoped error context that persists across async operations.
 */
@Injectable()
export class ErrorContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<ErrorContext>();

  /**
   * Run a function within an error context scope
   * @param correlationId - Optional correlation ID. If not provided, a new UUID will be generated
   * @param fn - Function to execute within the context
   * @returns Result of the function execution
   */
  async run<T>(
    correlationId?: string,
    fn?: (context: ErrorContext) => Promise<T>,
  ): Promise<T> {
    const context: ErrorContext = {
      correlationId: correlationId || uuidv4(),
      timestamp: Date.now(),
    };

    if (fn) {
      return this.asyncLocalStorage.run(context, () => fn(context));
    }

    return this.asyncLocalStorage.run(context, async () => {
      throw new Error('No function provided to run');
    });
  }

  /**
   * Get the current error context
   * @returns Current error context or undefined if not in a context scope
   */
  getContext(): ErrorContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Get the correlation ID from the current context
   * @returns Correlation ID or undefined if not in a context scope
   */
  getCorrelationId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.correlationId;
  }

  /**
   * Update the current error context with additional information
   * @param updates - Partial error context to merge into the current context
   */
  updateContext(updates: Partial<ErrorContext>): void {
    const currentContext = this.asyncLocalStorage.getStore();
    if (currentContext) {
      Object.assign(currentContext, updates);
    }
  }

  /**
   * Add timing information to the current context
   * @param start - Start timestamp
   * @param end - End timestamp
   */
  addTiming(start: number, end: number): void {
    const currentContext = this.asyncLocalStorage.getStore();
    if (currentContext) {
      currentContext.timings = {
        start,
        end,
        duration: end - start,
      };
    }
  }

  /**
   * Set solver metadata in the current context
   * @param solverType - Type of solver
   * @param metadata - Additional solver metadata
   */
  setSolverMetadata(
    solverType: string,
    metadata?: Record<string, any>,
  ): void {
    const currentContext = this.asyncLocalStorage.getStore();
    if (currentContext) {
      currentContext.solverType = solverType;
      if (metadata) {
        currentContext.solverMetadata = metadata;
      }
    }
  }

  /**
   * Set attempt number in the current context
   * @param attemptNumber - Attempt number
   */
  setAttemptNumber(attemptNumber: number): void {
    const currentContext = this.asyncLocalStorage.getStore();
    if (currentContext) {
      currentContext.attemptNumber = attemptNumber;
    }
  }

  /**
   * Add additional context data
   * @param key - Key for the context data
   * @param value - Value to store
   */
  addAdditionalContext(key: string, value: any): void {
    const currentContext = this.asyncLocalStorage.getStore();
    if (currentContext) {
      if (!currentContext.additionalContext) {
        currentContext.additionalContext = {};
      }
      currentContext.additionalContext[key] = value;
    }
  }
}



