/**
 * Anti-bot system types supported by the detection service
 */
export enum AntiBotSystemType {
  CLOUDFLARE = 'cloudflare',
  DATADOME = 'datadome',
  AKAMAI = 'akamai',
  IMPERVA = 'imperva',
  RECAPTCHA = 'recaptcha',
  HCAPTCHA = 'hcaptcha',
  UNKNOWN = 'unknown',
}

/**
 * Detection signal strength levels
 */
export enum SignalStrength {
  WEAK = 'weak',
  MODERATE = 'moderate',
  STRONG = 'strong',
}

/**
 * Individual detection signal found during analysis
 */
export interface DetectionSignal {
  /** Type of signal (e.g., 'dom-element', 'cookie', 'script', 'header') */
  type: string;
  /** Signal identifier or name */
  name: string;
  /** Signal strength indicator */
  strength: SignalStrength;
  /** Additional context about the signal */
  context?: Record<string, any>;
}

/**
 * Detailed information about a specific anti-bot system detection
 */
export interface AntiBotSystemDetails {
  /** Challenge version or variant (e.g., 'v2', 'v3', 'turnstile') */
  version?: string;
  /** Challenge type or mode (e.g., 'checkbox', 'invisible', 'managed') */
  challengeType?: string;
  /** Specific signals that triggered the detection */
  signals: DetectionSignal[];
  /** Additional metadata specific to the anti-bot system */
  metadata?: Record<string, any>;
}

/**
 * Error information when detection fails
 */
export interface DetectionError {
  /** Error code or type */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Error stack trace (if available) */
  stack?: string;
  /** Additional error context */
  context?: Record<string, any>;
}

/**
 * Main detection result interface
 * Standardizes detection results across all anti-bot systems
 */
export interface AntiBotDetectionResult {
  /** Whether an anti-bot system was detected */
  detected: boolean;
  
  /** Type of anti-bot system detected (null if not detected) */
  type: AntiBotSystemType | null;
  
  /** 
   * Confidence score for the detection (0-1)
   * 0 = no confidence, 1 = absolute certainty
   */
  confidence: number;
  
  /** Detailed information about the detection */
  details: AntiBotSystemDetails;
  
  /** Error information if detection failed */
  error?: DetectionError;
  
  /** Timestamp when detection was performed */
  detectedAt: Date;
  
  /** Duration of detection process in milliseconds */
  durationMs: number;
}

/**
 * Configuration for detection process
 */
export interface DetectionConfig {
  /** Timeout for detection in milliseconds */
  timeout?: number;
  
  /** Whether to perform deep inspection (slower but more accurate) */
  deepInspection?: boolean;
  
  /** Specific anti-bot systems to check (empty = check all) */
  targetSystems?: AntiBotSystemType[];
  
  /** Minimum confidence threshold to report detection */
  minConfidence?: number;
}

/**
 * Result of analyzing multiple potential anti-bot systems
 */
export interface MultiDetectionResult {
  /** All detection results, sorted by confidence (highest first) */
  detections: AntiBotDetectionResult[];
  
  /** The most likely anti-bot system detected (highest confidence) */
  primary: AntiBotDetectionResult | null;
  
  /** Total time spent on all detections in milliseconds */
  totalDurationMs: number;
  
  /** Timestamp when multi-detection started */
  analyzedAt: Date;
}

/**
 * Context information for detection process
 */
export interface DetectionContext {
  /** Current page URL */
  url: string;
  
  /** Page title */
  title?: string;
  
  /** HTTP status code */
  statusCode?: number;
  
  /** Response headers */
  headers?: Record<string, string>;
  
  /** Cookies present on the page */
  cookies?: Array<{ name: string; value: string; domain: string }>;
}
