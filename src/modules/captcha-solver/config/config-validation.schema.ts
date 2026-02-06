import * as Joi from 'joi';

/**
 * Joi schema for validating internal captcha-solver configuration values.
 * Used to validate both environment-loaded and runtime config updates.
 */

/**
 * Schema for runtime configuration updates (setConfig key/value pairs)
 */
export const configKeySchemas: Record<string, Joi.Schema> = {
  preferred_provider: Joi.string()
    .valid('2captcha', 'anticaptcha', 'capmonster')
    .messages({
      'any.only': 'preferred_provider must be one of: 2captcha, anticaptcha, capmonster',
    }),

  timeout_seconds: Joi.number()
    .integer()
    .min(10)
    .max(300)
    .messages({
      'number.min': 'timeout_seconds must be at least 10',
      'number.max': 'timeout_seconds must not exceed 300',
      'number.integer': 'timeout_seconds must be an integer',
    }),

  max_retries: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .messages({
      'number.min': 'max_retries must be at least 0',
      'number.max': 'max_retries must not exceed 10',
      'number.integer': 'max_retries must be an integer',
    }),

  enable_auto_retry: Joi.string()
    .valid('true', 'false')
    .insensitive()
    .messages({
      'any.only': "enable_auto_retry must be 'true' or 'false'",
    }),

  min_confidence_score: Joi.number()
    .min(0)
    .max(1)
    .messages({
      'number.min': 'min_confidence_score must be at least 0',
      'number.max': 'min_confidence_score must not exceed 1',
    }),

  fallback_enabled_recaptcha: Joi.string()
    .valid('true', 'false')
    .insensitive()
    .messages({
      'any.only': "fallback_enabled_recaptcha must be 'true' or 'false'",
    }),

  fallback_enabled_hcaptcha: Joi.string()
    .valid('true', 'false')
    .insensitive()
    .messages({
      'any.only': "fallback_enabled_hcaptcha must be 'true' or 'false'",
    }),

  fallback_enabled_datadome: Joi.string()
    .valid('true', 'false')
    .insensitive()
    .messages({
      'any.only': "fallback_enabled_datadome must be 'true' or 'false'",
    }),

  fallback_enabled_funcaptcha: Joi.string()
    .valid('true', 'false')
    .insensitive()
    .messages({
      'any.only': "fallback_enabled_funcaptcha must be 'true' or 'false'",
    }),
};

/**
 * Schema for the full CaptchaSolverConfiguration object loaded from env/DB
 */
export const captchaSolverConfigurationSchema = Joi.object({
  preferredProvider: Joi.string()
    .valid('2captcha', 'anticaptcha', 'capmonster')
    .optional(),

  timeoutSeconds: Joi.number()
    .integer()
    .min(10)
    .max(300)
    .optional(),

  maxRetries: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .optional(),

  enableAutoRetry: Joi.boolean()
    .optional(),

  minConfidenceScore: Joi.number()
    .min(0)
    .max(1)
    .optional(),

  fallbackEnabled: Joi.object({
    recaptcha: Joi.boolean().optional(),
    hcaptcha: Joi.boolean().optional(),
    datadome: Joi.boolean().optional(),
    funcaptcha: Joi.boolean().optional(),
  }).optional(),
}).options({ stripUnknown: false });

/**
 * Validate a single config key/value pair for runtime updates.
 * Returns validated value or throws with descriptive error message.
 */
export function validateConfigKeyValue(key: string, value: string): void {
  const schema = configKeySchemas[key];
  if (!schema) {
    // Allow custom keys without validation
    return;
  }

  // For numeric fields, validate the parsed number
  const numericKeys = ['timeout_seconds', 'max_retries', 'min_confidence_score'];
  const valueToValidate = numericKeys.includes(key) ? Number(value) : value;

  if (numericKeys.includes(key) && isNaN(Number(value))) {
    throw new Error(`Invalid ${key} value: ${value}. Must be a valid number`);
  }

  const { error } = schema.validate(valueToValidate);
  if (error) {
    throw new Error(`Invalid ${key} value: ${value}. ${error.details[0].message}`);
  }
}
