# Task: Add Support for Browser Profiles and Fingerprinting

## Objective
Implement support for advanced browser profiles by extending the `browser_types` system. This will allow users to create custom browser configurations with specific fingerprints (User-Agent, Device Memory, Hardware Concurrency, Locale, Timezone, etc.) and optionally pre-populated storage (cookies, localStorage).

## Implementation Plan

### 1. Database Schema Update
Create a migration to add the following columns to the `browser_types` table:
- `owner_id` (VARCHAR(255), nullable): To associate custom types with a specific client.
- `device_memory` (INTEGER, nullable): To spoof `navigator.deviceMemory`.
- `hardware_concurrency` (INTEGER, nullable): To spoof `navigator.hardwareConcurrency`.
- `locale` (VARCHAR(20), nullable): To set browser locale.
- `timezone_id` (VARCHAR(50), nullable): To set browser timezone.
- `device_scale_factor` (FLOAT, nullable): For high-DPI emulation.
- `color_depth` (INTEGER, nullable): To spoof screen color depth.
- `is_stealth` (BOOLEAN, default true): To toggle stealth mode.
- `default_storage` (JSONB, nullable): To store default cookies, localStorage, and sessionStorage for the profile.

### 2. Entity and DTO Updates
- Update `BrowserType` entity in `src/modules/browsers/entities/browser-type.entity.ts`.
- Create `CreateBrowserTypeDto` and `UpdateBrowserTypeDto` for CRUD operations.
- Update `CreateContextOptions` interface in `src/modules/browsers/interfaces/browser-pool.interface.ts` to include new fingerprinting options.

### 3. Service Enhancements
#### StealthService (`src/modules/browsers/services/stealth.service.ts`)
- Update `StealthConfig` interface to support explicit values for `hardwareConcurrency` and `deviceMemory`.
- Implement `getDeviceMemoryMockingScript(memory: number)`.
- Modify `addStealthInitScripts` to use explicit values if provided, falling back to randomization.

#### BrowserContextManagerService (`src/modules/browsers/services/browser-context-manager.service.ts`)
- Update `createContext` to handle new options: `deviceScaleFactor`, `deviceMemory`, etc.
- Ensure `storageState` is correctly applied if `default_storage` is provided in the `BrowserType`.

#### BrowsersService (`src/modules/browsers/browsers.service.ts`)
- Implement `create`, `update`, and `delete` for browser types.
- Update `findAll` and `findOne` to respect ownership (return public types + user's types).

#### JobProcessorService (`src/modules/jobs/services/job-processor.service.ts`)
- Ensure that when a job is processed, the full `BrowserType` configuration is loaded and passed to context creation.
- Resolve priority between Job-level `browserStorage` and BrowserType-level `default_storage`.

### 4. API Endpoints
- Update `BrowsersController` in `src/modules/browsers/browsers.controller.ts`:
  - `POST /browsers`: Create a custom browser type (authenticated).
  - `PATCH /browsers/:id`: Update a custom browser type (owner only).
  - `DELETE /browsers/:id`: Delete a custom browser type (owner only).
- Ensure all endpoints are protected by `ApiKeyGuard`.

### 5. Validation and Testing
- **Unit Tests:**
  - Test `StealthService` with explicit fingerprint values.
  - Test `BrowsersService` CRUD and ownership logic.
  - Test `BrowserContextManagerService` context options mapping.
- **Integration Tests:**
  - Create a custom browser type and run a job using it.
  - Verify the fingerprint in the browser (using `executeScript` to check `navigator` properties).
  - Verify storage persistence (cookies/localStorage) from the profile.

## Security Considerations
- Ensure users can only access/modify their own custom browser types.
- Built-in browser types (`owner_id IS NULL`) should be read-only for all users.
- Validate all fingerprint values to prevent injection or invalid Playwright configurations.

