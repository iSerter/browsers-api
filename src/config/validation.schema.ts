import * as Joi from 'joi';

export const validationSchema = Joi.object({
  // Application
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3333),
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

  // Proxy Configuration
  DEFAULT_PROXY: Joi.string()
    .optional()
    .allow('')
    .pattern(/^(https?|socks5):\/\/.+/)
    .message('DEFAULT_PROXY must be a valid proxy URL (http://, https://, or socks5://)'),

  // Captcha Solver
  '2CAPTCHA_API_KEY': Joi.string()
    .optional()
    .allow('')
    .pattern(/^[a-zA-Z0-9,]+$/)
    .message('2CAPTCHA_API_KEY must contain only alphanumeric characters and commas'),
  TWOCAPTCHA_API_KEY: Joi.string()
    .optional()
    .allow('')
    .pattern(/^[a-zA-Z0-9,]+$/)
    .message('TWOCAPTCHA_API_KEY must contain only alphanumeric characters and commas'),
  ANTICAPTCHA_API_KEY: Joi.string()
    .optional()
    .allow('')
    .pattern(/^[a-zA-Z0-9,]+$/)
    .message('ANTICAPTCHA_API_KEY must contain only alphanumeric characters and commas'),
  CAPTCHA_SOLVER_PREFERRED_PROVIDER: Joi.string()
    .valid('2captcha', 'anticaptcha')
    .optional()
    .default('2captcha'),
  CAPTCHA_SOLVER_TIMEOUT_SECONDS: Joi.number().integer().min(10).max(300).optional().default(60),
  CAPTCHA_SOLVER_MAX_RETRIES: Joi.number().integer().min(0).max(10).optional().default(3),
  CAPTCHA_SOLVER_ENABLE_AUTO_RETRY: Joi.boolean().optional().default(true),
  CAPTCHA_SOLVER_MIN_CONFIDENCE_SCORE: Joi.number().min(0).max(1).optional().default(0.7),
  CAPTCHA_SOLVER_FALLBACK_RECAPTCHA: Joi.boolean().optional().default(true),
  CAPTCHA_SOLVER_FALLBACK_HCAPTCHA: Joi.boolean().optional().default(true),
  CAPTCHA_SOLVER_FALLBACK_DATADOME: Joi.boolean().optional().default(true),
  CAPTCHA_SOLVER_FALLBACK_FUNCAPTCHA: Joi.boolean().optional().default(true),

  // Audio Captcha Processing
  GOOGLE_SPEECH_API_KEY: Joi.string().optional().allow(''),
  OPENAI_API_KEY: Joi.string().optional().allow(''),
  AZURE_SPEECH_KEY: Joi.string().optional().allow(''),
  AZURE_SPEECH_REGION: Joi.string().optional().allow(''),
  AUDIO_CAPTCHA_PROVIDER_PRIORITY: Joi.string()
    .optional()
    .pattern(/^(google-cloud|openai-whisper|azure-speech)(,(google-cloud|openai-whisper|azure-speech))*$/)
    .message('AUDIO_CAPTCHA_PROVIDER_PRIORITY must be comma-separated provider names'),
  AUDIO_CAPTCHA_MIN_CONFIDENCE: Joi.number().min(0).max(1).optional().default(0.7),
  AUDIO_CAPTCHA_MAX_RETRIES: Joi.number().integer().min(1).max(10).optional().default(3),
  AUDIO_CAPTCHA_CACHE_TTL_HOURS: Joi.number().integer().min(1).max(168).optional().default(24),
  AUDIO_CAPTCHA_ENABLE_CACHE: Joi.boolean().optional().default(true),
  AUDIO_CAPTCHA_RATE_LIMIT: Joi.number().integer().min(1).max(1000).optional().default(60),
  AUDIO_CAPTCHA_TEMP_DIR: Joi.string().optional().default('./tmp/audio'),
  AUDIO_CAPTCHA_TIMEOUT: Joi.number().integer().min(5000).max(120000).optional().default(30000),
});
