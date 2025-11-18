# Browser Pool & Action Handlers

## Browser Pool Architecture

The browser pool manages Playwright browser instances to optimize resource usage and performance.

### Pool Structure

```
BrowserPoolService
  │
  ├─► BrowserPool (per browser type)
  │   │
  │   ├─► availableInstances: Browser[]
  │   │   └─► Idle browsers ready for use
  │   │
  │   ├─► activeInstances: Set<Browser>
  │   │   └─► Browsers currently in use
  │   │
  │   └─► idleTimers: Map<Browser, Timer>
  │       └─► Timers for idle browser cleanup
```

### Pool Lifecycle

#### 1. Initialization

On service startup, pools are initialized with minimum size:

```typescript
async initializePoolAsync() {
  const minSize = this.config.minSize || 1;
  const browsers = await Promise.all(
    Array.from({ length: minSize }, () => this.createBrowser())
  );
  browsers.forEach(browser => {
    this.availableInstances.push(browser);
    this.startIdleTimer(browser);
  });
}
```

#### 2. Browser Acquisition

```typescript
async acquire(): Promise<Browser> {
  // 1. Check for available browser
  if (this.availableInstances.length > 0) {
    const browser = this.availableInstances.shift();
    this.activeInstances.add(browser);
    this.clearIdleTimer(browser);
    return browser;
  }

  // 2. Create new browser if under max size
  if (totalInstances < this.config.maxSize) {
    const browser = await this.createBrowser();
    this.activeInstances.add(browser);
    return browser;
  }

  // 3. Wait for available browser
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (this.availableInstances.length > 0) {
        clearInterval(checkInterval);
        const browser = this.availableInstances.shift();
        this.activeInstances.add(browser);
        this.clearIdleTimer(browser);
        resolve(browser);
      }
    }, 100);
  });
}
```

#### 3. Browser Release

```typescript
async release(browser: Browser): Promise<void> {
  this.activeInstances.delete(browser);
  
  if (!browser.isConnected()) {
    return; // Skip if browser is closed
  }

  this.availableInstances.push(browser);
  this.startIdleTimer(browser);
}
```

#### 4. Idle Cleanup

Browsers idle for more than `idleTimeout` (default: 5 minutes) are automatically closed:

```typescript
closeIdleBrowsers(): void {
  for (const browser of this.availableInstances) {
    const timer = this.idleTimers.get(browser);
    const idleDuration = Date.now() - timer._idleStart;
    
    if (idleDuration > this.config.idleTimeout) {
      this.closeBrowser(browser);
      this.removeFromAvailable(browser);
    }
  }
}
```

### Browser Configuration

#### Chromium

```typescript
{
  type: 'chromium',
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      // ... additional optimization flags
    ]
  }
}
```

#### Firefox

```typescript
{
  type: 'firefox',
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
}
```

#### WebKit

```typescript
{
  type: 'webkit',
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  }
}
```

### Pool Statistics

```typescript
getStats(browserType: string): PoolStats {
  return {
    availableCount: this.availableInstances.length,
    activeCount: this.activeInstances.size,
    totalCount: this.availableInstances.length + this.activeInstances.size
  };
}
```

## Browser Context Management

### Context Creation

```typescript
async createContext(browser: Browser, options: ContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1920, height: 1080 },
    userAgent: options.userAgent,
    // ... additional context options
  });
  return context;
}
```

### Context Lifecycle

1. **Create**: Context created from browser instance
2. **Use**: Pages created from context for automation
3. **Close**: Context closed after job completion

## Action Handler System

### Handler Interface

All action handlers implement:

```typescript
interface IActionHandler {
  execute(
    page: Page,
    config: ActionConfig,
    jobId: string
  ): Promise<ActionResult>
}
```

### Action Result

```typescript
interface ActionResult {
  success: boolean
  artifactId?: string      // For screenshot/PDF actions
  data?: any                // Action-specific data
  error?: {
    message: string
    code: string
    retryable: boolean
  }
}
```

### Handler Factory

Routes actions to appropriate handlers:

```typescript
class ActionHandlerFactory {
  private handlers: Map<string, IActionHandler>

  getHandler(actionType: string): IActionHandler {
    const handler = this.handlers.get(actionType);
    if (!handler) {
      throw new Error(`No handler for: ${actionType}`);
    }
    return handler;
  }
}
```

## Action Handlers

### Screenshot Handler

Captures screenshots of pages or elements.

**Configuration**:
```typescript
{
  action: 'screenshot',
  type: 'png' | 'jpeg',
  fullPage?: boolean,
  selector?: string  // CSS selector for element screenshot
}
```

**Implementation**:
```typescript
async execute(page: Page, config: ScreenshotConfig, jobId: string) {
  const buffer = await page.screenshot({
    type: config.type,
    fullPage: config.fullPage,
    path: config.selector ? undefined : filePath
  });
  
  const artifactId = await this.artifactStorage.saveArtifact(
    buffer,
    jobId,
    filename,
    ArtifactType.SCREENSHOT,
    mimeType
  );
  
  return { success: true, artifactId, data: { filePath } };
}
```

### Fill Handler

Fills form fields with values.

**Configuration**:
```typescript
{
  action: 'fill',
  target: string,
  getTargetBy: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector' | 'getByPlaceholder',
  value: string,
  typingDelay?: number,      // Fixed delay between keystrokes
  typingDelayMin?: number,   // Min delay (randomized)
  typingDelayMax?: number    // Max delay (randomized)
}
```

**Implementation**:
```typescript
async execute(page: Page, config: FillConfig, jobId: string) {
  const locator = getLocator(page, config.target, config.getTargetBy);
  
  if (config.typingDelayMin && config.typingDelayMax) {
    // Human-like typing with random delays
    await locator.fill(''); // Clear first
    for (const char of config.value) {
      await locator.type(char);
      const delay = random(config.typingDelayMin, config.typingDelayMax);
      await page.waitForTimeout(delay);
    }
  } else {
    await locator.fill(config.value);
  }
  
  return { success: true, data: { filled: true } };
}
```

### Click Handler

Clicks on elements.

**Configuration**:
```typescript
{
  action: 'click',
  target: string,
  getTargetBy: 'getByLabel' | 'getByText' | 'getByRole' | 'getBySelector',
  button?: 'left' | 'right' | 'middle',
  clickCount?: number,
  waitForNavigation?: boolean,
  index?: number  // For multiple matches
}
```

**Implementation**:
```typescript
async execute(page: Page, config: ClickConfig, jobId: string) {
  const locator = getLocator(page, config.target, config.getTargetBy);
  
  if (config.index !== undefined) {
    const locators = await locator.all();
    locator = locators[config.index];
  }
  
  await locator.click({
    button: config.button,
    clickCount: config.clickCount
  });
  
  if (config.waitForNavigation) {
    await page.waitForLoadState('networkidle');
  }
  
  return { success: true, data: { clicked: true } };
}
```

### Scroll Handler

Scrolls the page with human-like behavior.

**Configuration**:
```typescript
{
  action: 'scroll',
  target?: string,           // Element to scroll to
  getTargetBy?: string,      // How to find target
  targetY?: number,          // Specific Y position
  speed?: number,            // Scroll speed (ms)
  variance?: number,       // Randomness (0-1)
  stepMin?: number,          // Min scroll step
  stepMax?: number,          // Max scroll step
  pauseChance?: number       // Chance to pause (0-1)
}
```

**Implementation**:
Uses `human-scroll.ts` utility for smooth, human-like scrolling:

```typescript
async execute(page: Page, config: ScrollConfig, jobId: string) {
  if (config.targetY !== undefined) {
    await humanScrollToY(page, config.targetY, config);
  } else if (config.target) {
    const locator = getLocator(page, config.target, config.getTargetBy);
    await humanScrollToElement(page, locator, config);
  } else {
    await humanScrollToBottom(page, config);
  }
  
  return { success: true, data: { scrolled: true } };
}
```

### Move Cursor Handler

Moves cursor to element with human-like movement.

**Configuration**:
```typescript
{
  action: 'moveCursor',
  target: string,
  getTargetBy: string,
  speed?: number,            // Movement speed (ms)
  jitter?: number,           // Random movement (0-1)
  overshoot?: number,        // Overshoot factor (0-1)
  minPauseMs?: number,       // Min pause duration
  maxPauseMs?: number,       // Max pause duration
  stepsMin?: number,         // Min movement steps
  stepsMax?: number,         // Max movement steps
  padding?: number            // Element padding
}
```

**Implementation**:
Uses `human-mouse.ts` utility for realistic cursor movement:

```typescript
async execute(page: Page, config: MoveCursorConfig, jobId: string) {
  const locator = getLocator(page, config.target, config.getTargetBy);
  const box = await locator.boundingBox();
  
  await humanMoveMouse(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    config
  );
  
  return { success: true, data: { moved: true } };
}
```

### Snapshot Handler

Captures the current state of a web page including HTML content, metadata (URL, title, timestamp, viewport), and optionally cookies, localStorage, and sessionStorage.

**Configuration**:
```typescript
{
  action: 'snapshot',
  snapshotConfig?: {
    cookies?: boolean,           // Capture browser cookies (default: false)
    localStorage?: boolean,       // Capture localStorage data (default: false)
    sessionStorage?: boolean      // Capture sessionStorage data (default: false)
  }
}
```

**Implementation**:
```typescript
@Injectable()
export class SnapshotActionHandler implements IActionHandler {
  private readonly logger = new Logger(SnapshotActionHandler.name);

  constructor(
    private readonly artifactStorageService: ArtifactStorageService,
  ) {}

  async execute(
    page: Page,
    config: SnapshotActionConfig,
    jobId: string
  ): Promise<ActionResult> {
    const snapshotConfig = config.snapshotConfig || {};
    const {
      cookies = false,
      localStorage = false,
      sessionStorage = false,
    } = snapshotConfig;

    // 1. Always capture HTML content
    const htmlContent = await page.content();

    // 2. Capture metadata (always included)
    const url = page.url();
    const viewport = page.viewportSize();
    const title = await page.title().catch(() => undefined);
    const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
    const language = await page.evaluate(() => navigator.language).catch(() => undefined);
    const platform = await page.evaluate(() => navigator.platform).catch(() => undefined);
    const timezone = await page.evaluate(() =>
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ).catch(() => undefined);

    // 3. Build snapshot data object
    const snapshotData = {
      html: htmlContent,
      url,
      title,
      timestamp: new Date().toISOString(),
      metadata: {
        viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
        userAgent,
        language,
        platform,
        timezone,
      },
    };

    // 4. Conditionally capture cookies
    if (cookies) {
      try {
        const context = page.context();
        const contextCookies = await context.cookies();
        snapshotData.cookies = contextCookies;
      } catch (error) {
        this.logger.warn(`Failed to capture cookies: ${error.message}`);
        snapshotData.cookies = null;
      }
    }

    // 5. Conditionally capture localStorage
    if (localStorage) {
      try {
        const localStorageData = await page.evaluate(() => {
          const storage: Record<string, string> = {};
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key) {
              storage[key] = window.localStorage.getItem(key) || '';
            }
          }
          return storage;
        });
        snapshotData.localStorage = localStorageData;
      } catch (error) {
        this.logger.warn(`Failed to capture localStorage: ${error.message}`);
        snapshotData.localStorage = null;
      }
    }

    // 6. Conditionally capture sessionStorage
    if (sessionStorage) {
      try {
        const sessionStorageData = await page.evaluate(() => {
          const storage: Record<string, string> = {};
          for (let i = 0; i < window.sessionStorage.length; i++) {
            const key = window.sessionStorage.key(i);
            if (key) {
              storage[key] = window.sessionStorage.getItem(key) || '';
            }
          }
          return storage;
        });
        snapshotData.sessionStorage = sessionStorageData;
      } catch (error) {
        this.logger.warn(`Failed to capture sessionStorage: ${error.message}`);
        snapshotData.sessionStorage = null;
      }
    }

    // 7. Convert to JSON and save artifact
    const jsonString = JSON.stringify(snapshotData, null, 2);
    const jsonBuffer = Buffer.from(jsonString, 'utf-8');
    const timestamp = Date.now();
    const filename = `${timestamp}-snapshot.json`;

    const filePath = await this.artifactStorageService.saveArtifact(
      jsonBuffer,
      jobId,
      filename,
      ArtifactType.SNAPSHOT,
      'application/json',
    );

    return {
      success: true,
      artifactId: filePath,
      data: {
        filePath,
        size: jsonBuffer.length,
        mimeType: 'application/json',
        url,
        title,
        timestamp: snapshotData.timestamp,
      },
    };
  }
}
```

**Snapshot Data Structure**:

The saved artifact is a JSON file containing:

```typescript
{
  html: string,                    // Complete HTML source of the page
  url: string,                      // Current page URL
  title?: string,                   // Page title (if available)
  timestamp: string,                // ISO 8601 timestamp
  metadata: {
    viewport: {                     // Viewport dimensions
      width: number,
      height: number
    } | null,
    userAgent?: string,             // Browser user agent
    language?: string,              // Browser language
    platform?: string,              // Operating system platform
    timezone?: string               // Timezone identifier
  },
  cookies?: Cookie[],               // Array of cookie objects (if enabled)
  localStorage?: Record<string, string>,  // localStorage key-value pairs (if enabled)
  sessionStorage?: Record<string, string>  // sessionStorage key-value pairs (if enabled)
}
```

**Artifact Details**:
- **ArtifactType**: `SNAPSHOT`
- **Content-Type**: `application/json`
- **File Format**: JSON file named `{timestamp}-snapshot.json`
- **Storage**: Saved to both filesystem and database

**Error Handling**:
- HTML capture failures cause the entire snapshot to fail
- Metadata capture failures (title, userAgent, etc.) are logged but don't fail the snapshot (set to `undefined` or `null`)
- Cookie capture failures are logged with warnings, snapshot continues with `cookies: null`
- localStorage/sessionStorage capture failures are logged with warnings, snapshot continues with `localStorage: null` or `sessionStorage: null`
- Timeout errors are retryable; other errors are not retryable

**Edge Cases**:
- **Pages without storage support**: localStorage and sessionStorage capture gracefully handles unsupported scenarios
- **Cookie access restrictions**: Cookie capture may fail due to security policies, but snapshot continues
- **Large data handling**: Large HTML content or extensive storage data can result in large artifact files; consider memory usage for very large pages
- **CSP restrictions**: Content Security Policy may block JavaScript evaluation needed for storage capture

**Integration**:
- Registered in `ActionHandlerFactory` constructor: `this.handlers.set('snapshot', this.snapshotHandler)`
- Provided in `JobsModule` providers array
- Uses `ArtifactStorageService` for artifact persistence
- See [API Reference](./05-api-reference.md#snapshot-action) for API usage examples
- See `ActionType.SNAPSHOT` enum value in `ActionConfigDto`
- See `ArtifactType.SNAPSHOT` enum value in `JobArtifact` entity

## Locator Helper

Centralized element location logic:

```typescript
function getLocator(
  page: Page,
  target: string,
  getTargetBy: string
): Locator {
  switch (getTargetBy) {
    case 'getByLabel':
      return page.getByLabel(target);
    case 'getByText':
      return page.getByText(target);
    case 'getByRole':
      return page.getByRole(target as any);
    case 'getBySelector':
      return page.locator(target);
    case 'getByPlaceholder':
      return page.getByPlaceholder(target);
    default:
      throw new Error(`Unknown getTargetBy: ${getTargetBy}`);
  }
}
```

## Human-Like Interactions

### Human Scroll

Smooth scrolling with:
- Variable step sizes
- Random pauses
- Acceleration/deceleration curves
- Natural movement patterns

### Human Mouse Movement

Realistic cursor movement with:
- Bezier curves
- Variable speed
- Jitter and overshoot
- Natural pauses

## Artifact Storage

### Storage Service

Handles artifact persistence:

```typescript
async saveArtifact(
  buffer: Buffer,
  jobId: string,
  filename: string,
  artifactType: ArtifactType,
  mimeType: string
): Promise<string> {
  // 1. Create job-specific directory
  const jobDir = path.join(this.artifactsBaseDir, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  
  // 2. Save to filesystem
  const filePath = path.join(jobDir, filename);
  await fs.writeFile(filePath, buffer);
  
  // 3. Create database record
  const artifact = this.artifactRepository.create({
    jobId,
    artifactType,
    filePath,
    mimeType,
    sizeBytes: buffer.length
  });
  
  await this.artifactRepository.save(artifact);
  return artifact.id;
}
```

### Storage Backends

Currently supports:
- **Filesystem**: Default, stores files on disk
- **Database**: Stores binary data in BYTEA column
- **S3**: Planned for future (configurable)

## Extending Actions

### Adding New Actions

1. **Create Handler**:
```typescript
@Injectable()
export class NewActionHandler implements IActionHandler {
  async execute(page: Page, config: ActionConfig, jobId: string) {
    // Implementation
    return { success: true, data: {} };
  }
}
```

2. **Register in Factory**:
```typescript
constructor(
  private readonly newHandler: NewActionHandler
) {
  this.handlers.set('newAction', this.newHandler);
}
```

3. **Add to Module**:
```typescript
@Module({
  providers: [
    NewActionHandler,
    // ...
  ]
})
```

4. **Update DTO**:
Add action type to `ActionConfigDto` if needed.

