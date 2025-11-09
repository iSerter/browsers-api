import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

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
}

