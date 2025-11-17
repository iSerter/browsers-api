import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum GetTargetBy {
  GET_BY_LABEL = 'getByLabel',
  GET_BY_TEXT = 'getByText',
  GET_BY_ROLE = 'getByRole',
  GET_BY_SELECTOR = 'getBySelector',
  GET_BY_PLACEHOLDER = 'getByPlaceholder',
}

export enum ActionType {
  CLICK = 'click',
  FILL = 'fill',
  SCROLL = 'scroll',
  MOVE_CURSOR = 'moveCursor',
  SCREENSHOT = 'screenshot',
  VISIT = 'visit',
  EXTRACT = 'extract',
  PDF = 'pdf',
  SNAPSHOT = 'snapshot',
}

export enum ScreenshotType {
  PNG = 'png',
  JPEG = 'jpeg',
}

export enum MouseButton {
  LEFT = 'left',
  RIGHT = 'right',
  MIDDLE = 'middle',
}

/**
 * Configuration options for snapshot actions.
 * Controls which browser state data should be captured when taking a snapshot.
 */
export class SnapshotConfigDto {
  /**
   * Whether to capture cookies in the snapshot.
   * Defaults to true if not specified.
   */
  @IsOptional()
  @IsBoolean()
  cookies?: boolean;

  /**
   * Whether to capture localStorage data in the snapshot.
   * Defaults to true if not specified.
   */
  @IsOptional()
  @IsBoolean()
  localStorage?: boolean;

  /**
   * Whether to capture sessionStorage data in the snapshot.
   * Defaults to true if not specified.
   */
  @IsOptional()
  @IsBoolean()
  sessionStorage?: boolean;
}

export class ActionConfigDto {
  @IsEnum(ActionType)
  action: ActionType;

  @IsOptional()
  @IsString()
  target?: string;

  @IsOptional()
  @IsEnum(GetTargetBy)
  getTargetBy?: GetTargetBy;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  attribute?: string;

  @IsOptional()
  @IsBoolean()
  multiple?: boolean;

  // Element selection index (for handling multiple matches)
  // When multiple elements match, use this 0-based index to select which one
  // If not specified, defaults to 0 (first match)
  @IsOptional()
  @IsNumber()
  @Min(0)
  index?: number;

  // Click action fields
  @IsOptional()
  @IsEnum(MouseButton)
  button?: MouseButton;

  @IsOptional()
  @IsNumber()
  @Min(1)
  clickCount?: number;

  @IsOptional()
  @IsBoolean()
  waitForNavigation?: boolean;

  // Screenshot action fields
  @IsOptional()
  @IsBoolean()
  fullPage?: boolean;

  @IsOptional()
  @IsEnum(ScreenshotType)
  type?: ScreenshotType;

  @IsOptional()
  @IsString()
  format?: string; // Alias for type, used by actions service

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  quality?: number;

  // Scroll action fields
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetY?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  variance?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stepMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stepMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  pauseChance?: number;

  // Move cursor action fields
  @IsOptional()
  @IsNumber()
  @Min(0)
  jitter?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overshoot?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minPauseMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxPauseMs?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  stepsMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  stepsMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  padding?: number;

  // Fill action fields (human-like typing)
  @IsOptional()
  @IsNumber()
  @Min(0)
  typingDelay?: number; // Fixed delay between keystrokes in ms

  @IsOptional()
  @IsNumber()
  @Min(0)
  typingDelayMin?: number; // Minimum delay between keystrokes in ms

  @IsOptional()
  @IsNumber()
  @Min(0)
  typingDelayMax?: number; // Maximum delay between keystrokes in ms

  // Visit action fields (no additional fields needed)

  // Extract action fields
  @IsOptional()
  extractors?: any; // Can be complex object, validate as needed

  // PDF action fields
  @IsOptional()
  @IsString()
  pdfFormat?: string; // PDF format option

  @IsOptional()
  @IsBoolean()
  printBackground?: boolean;

  @IsOptional()
  margin?: any; // Can be object or string, validate as needed

  // Snapshot action fields
  /**
   * Configuration for snapshot actions (only relevant when action is SNAPSHOT).
   * Controls which browser state data (cookies, localStorage, sessionStorage) to capture.
   * If not specified, all state data will be captured by default.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => SnapshotConfigDto)
  snapshotConfig?: SnapshotConfigDto;
}

