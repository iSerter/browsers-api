import { retryWithBackoff, createRetryFunction } from './retry.util';

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffMs: 100,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    let attempt = 0;
    const fn = jest.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 3) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return Promise.resolve('success');
    });

    const result = await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffMs: 10,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        backoffMs: 10,
      }),
    ).rejects.toThrow('Always fails');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect shouldRetry function', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('INVALID_API_KEY'));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        backoffMs: 10,
        shouldRetry: (error) => {
          const err = error as Error;
          return !err.message.includes('INVALID_API_KEY');
        },
      }),
    ).rejects.toThrow('INVALID_API_KEY');

    // Should not retry for invalid API key
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const onRetry = jest.fn();
    let attempt = 0;
    const fn = jest.fn().mockImplementation(() => {
      attempt++;
      if (attempt < 2) {
        throw new Error(`Attempt ${attempt} failed`);
      }
      return Promise.resolve('success');
    });

    await retryWithBackoff(fn, {
      maxAttempts: 3,
      backoffMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      1,
      expect.any(Error),
      expect.any(Number),
    );
  });

  it('should call onExhausted callback when all retries fail', async () => {
    const onExhausted = jest.fn();
    const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        backoffMs: 10,
        onExhausted,
      }),
    ).rejects.toThrow();

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(
      expect.any(Error),
      2,
    );
  });

  it('should use exponential backoff', async () => {
    const delays: number[] = [];
    const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 3,
        backoffMs: 100,
        maxBackoffMs: 1000,
        onRetry: (attempt, error, delay) => {
          delays.push(delay);
        },
      }),
    ).rejects.toThrow();

    // First retry: 100ms, second retry: 200ms (capped at maxBackoffMs)
    expect(delays.length).toBe(2);
    expect(delays[0]).toBe(100); // 100 * 2^0
    expect(delays[1]).toBe(200); // 100 * 2^1
  });

  it(
    'should cap backoff at maxBackoffMs',
    async () => {
      const delays: number[] = [];
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 5,
          backoffMs: 1000,
          maxBackoffMs: 2000,
          onRetry: (attempt, error, delay) => {
            delays.push(delay);
          },
        }),
      ).rejects.toThrow('Always fails');

      // All delays should be capped at 2000ms
      // With 5 attempts, we have 4 retries (attempts 2-5)
      // Delays: 1000ms (attempt 1->2), 2000ms (attempt 2->3), 
      //        2000ms (attempt 3->4), 2000ms (attempt 4->5)
      // Total: 7000ms, which exceeds default 5000ms timeout
      expect(delays.length).toBe(4);
      delays.forEach((delay) => {
        expect(delay).toBeLessThanOrEqual(2000);
      });
    },
    10000, // Increase timeout to 10s to accommodate total delays of ~7000ms
  );
});

describe('createRetryFunction', () => {
  it('should create a reusable retry function', async () => {
    const retry = createRetryFunction({
      maxAttempts: 3,
      backoffMs: 10,
    });

    const fn1 = jest.fn().mockResolvedValue('result1');
    const fn2 = jest.fn().mockResolvedValue('result2');

    const result1 = await retry(fn1);
    const result2 = await retry(fn2);

    expect(result1).toBe('result1');
    expect(result2).toBe('result2');
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('should apply same retry configuration to multiple functions', async () => {
    const retry = createRetryFunction({
      maxAttempts: 2,
      backoffMs: 10,
    });

    let attempt1 = 0;
    const fn1 = jest.fn().mockImplementation(() => {
      attempt1++;
      if (attempt1 < 2) {
        throw new Error('Fail');
      }
      return Promise.resolve('success1');
    });

    let attempt2 = 0;
    const fn2 = jest.fn().mockImplementation(() => {
      attempt2++;
      if (attempt2 < 2) {
        throw new Error('Fail');
      }
      return Promise.resolve('success2');
    });

    const result1 = await retry(fn1);
    const result2 = await retry(fn2);

    expect(result1).toBe('success1');
    expect(result2).toBe('success2');
    expect(fn1).toHaveBeenCalledTimes(2);
    expect(fn2).toHaveBeenCalledTimes(2);
  });
});

