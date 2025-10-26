import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),

  // Database
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_DATABASE: Joi.string().required(),

  // Worker Configuration
  WORKER_POLL_INTERVAL_MS: Joi.number().default(1000),
  WORKER_MAX_CONCURRENT_JOBS: Joi.number().default(10),
  BROWSER_POOL_MIN_SIZE: Joi.number().default(1),
  BROWSER_POOL_MAX_SIZE: Joi.number().default(5),
  BROWSER_IDLE_TIMEOUT_MS: Joi.number().default(300000),

  // Job Configuration
  DEFAULT_JOB_TIMEOUT_MS: Joi.number().default(30000),
  MAX_JOB_RETRIES: Joi.number().default(3),
  JOB_CLEANUP_AFTER_DAYS: Joi.number().default(7),

  // Storage
  ARTIFACT_STORAGE_TYPE: Joi.string()
    .valid('filesystem', 'database', 's3')
    .default('filesystem'),
  ARTIFACT_STORAGE_PATH: Joi.string().default('./artifacts'),
  MAX_ARTIFACT_SIZE_MB: Joi.number().default(50),

  // Playwright
  PLAYWRIGHT_HEADLESS: Joi.boolean().default(true),
  PLAYWRIGHT_TIMEOUT_MS: Joi.number().default(30000),
  PLAYWRIGHT_SCREENSHOTS_DIR: Joi.string().default('./screenshots'),

  // Security
  API_KEY_HEADER: Joi.string().default('X-API-Key'),
  RATE_LIMIT_MAX: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),

  // Monitoring
  ENABLE_METRICS: Joi.boolean().default(false),
  METRICS_PORT: Joi.number().default(9090),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug')
    .default('info'),
});
