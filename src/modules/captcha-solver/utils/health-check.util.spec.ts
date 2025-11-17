import {
  createHealthIndicator,
  createHealthCheck,
  combineHealthChecks,
  createAlwaysHealthyCheck,
  createAlwaysUnhealthyCheck,
} from './health-check.util';

describe('createHealthIndicator', () => {
  it('should return healthy when check passes', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => true,
    });

    const result = await check();

    expect(result.name).toBe('test');
    expect(result.isHealthy).toBe(true);
    expect(result.message).toBe('Healthy');
    expect(result.timestamp).toBeDefined();
  });

  it('should return unhealthy when check fails', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => false,
    });

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Unhealthy');
  });

  it('should handle errors in check function', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => {
        throw new Error('Check failed');
      },
    });

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Check failed');
    expect(result.metadata?.error).toBeDefined();
  });

  it('should timeout after specified time', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return true;
      },
      timeoutMs: 50,
    });

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toContain('timeout');
  });

  it('should include metadata from getMetadata function', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => true,
      getMetadata: async () => ({
        version: '1.0.0',
        uptime: 1000,
      }),
    });

    const result = await check();

    expect(result.metadata?.version).toBe('1.0.0');
    expect(result.metadata?.uptime).toBe(1000);
  });

  it('should include duration in metadata', async () => {
    const check = createHealthIndicator({
      name: 'test',
      checkFn: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return true;
      },
    });

    const result = await check();

    expect(result.metadata?.duration).toBeGreaterThanOrEqual(10);
  });
});

describe('createHealthCheck', () => {
  it('should create a simple health check', async () => {
    const check = createHealthCheck('database', async () => true);

    const result = await check();

    expect(result.name).toBe('database');
    expect(result.isHealthy).toBe(true);
  });

  it('should handle async check failures', async () => {
    const check = createHealthCheck('service', async () => {
      throw new Error('Service unavailable');
    });

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Service unavailable');
  });
});

describe('combineHealthChecks', () => {
  it('should return healthy when all checks pass', async () => {
    const check1 = createHealthCheck('check1', async () => true);
    const check2 = createHealthCheck('check2', async () => true);
    const check3 = createHealthCheck('check3', async () => true);

    const result = await combineHealthChecks([check1, check2, check3]);

    expect(result.isHealthy).toBe(true);
    expect(result.message).toBe('All health checks passed');
    expect(result.metadata?.check1?.isHealthy).toBe(true);
    expect(result.metadata?.check2?.isHealthy).toBe(true);
    expect(result.metadata?.check3?.isHealthy).toBe(true);
  });

  it('should return unhealthy when any check fails', async () => {
    const check1 = createHealthCheck('check1', async () => true);
    const check2 = createHealthCheck('check2', async () => false);
    const check3 = createHealthCheck('check3', async () => true);

    const result = await combineHealthChecks([check1, check2, check3]);

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Some health checks failed');
    expect(result.metadata?.check1?.isHealthy).toBe(true);
    expect(result.metadata?.check2?.isHealthy).toBe(false);
    expect(result.metadata?.check3?.isHealthy).toBe(true);
  });

  it('should include all check results in metadata', async () => {
    const check1 = createHealthCheck('check1', async () => true);
    const check2 = createHealthCheck('check2', async () => {
      throw new Error('Failed');
    });

    const result = await combineHealthChecks([check1, check2]);

    expect(result.metadata?.check1).toBeDefined();
    expect(result.metadata?.check2).toBeDefined();
    expect(result.metadata?.check2?.isHealthy).toBe(false);
  });
});

describe('createAlwaysHealthyCheck', () => {
  it('should always return healthy', async () => {
    const check = createAlwaysHealthyCheck('test');

    const result = await check();

    expect(result.isHealthy).toBe(true);
    expect(result.message).toBe('Always healthy');
  });
});

describe('createAlwaysUnhealthyCheck', () => {
  it('should always return unhealthy', async () => {
    const check = createAlwaysUnhealthyCheck('test', 'Custom message');

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Custom message');
  });

  it('should use default message when not provided', async () => {
    const check = createAlwaysUnhealthyCheck('test');

    const result = await check();

    expect(result.isHealthy).toBe(false);
    expect(result.message).toBe('Always unhealthy');
  });
});

