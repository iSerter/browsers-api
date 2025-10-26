export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: ErrorDetails | null;
  metadata: ResponseMetadata;
}

export interface ErrorDetails {
  code: string;
  message: string;
  details?: any;
  stack?: string;
}

export interface ResponseMetadata {
  timestamp: string;
  version: string;
  requestId?: string;
}

