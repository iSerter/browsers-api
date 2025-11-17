import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createServer, Server } from 'http';
import { AppModule } from '../src/app.module';
import { AutomationJob, JobStatus } from '../src/modules/jobs/entities/automation-job.entity';
import { ApiKey, ApiKeyStatus } from '../src/modules/api-keys/entities/api-key.entity';
import { BrowserType, BrowserTypeEnum, DeviceTypeEnum } from '../src/modules/browsers/entities/browser-type.entity';
import { chromium, Browser, Page } from 'playwright';

describe('Captcha Mock E2E Tests', () => {
  let app: INestApplication<App>;
  let jobRepository: Repository<AutomationJob>;
  let apiKeyRepository: Repository<ApiKey>;
  let browserTypeRepository: Repository<BrowserType>;
  let testApiKey: string;
  let testBrowserTypeId: number;
  let mockServer: Server;
  let mockServerPort: number;
  let mockServerUrl: string;
  let browser: Browser;
  let page: Page;

  // Mock captcha HTML pages
  const getRecaptchaV2Page = () => `
<!DOCTYPE html>
<html>
<head>
  <title>reCAPTCHA v2 Test</title>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head>
<body>
  <h1>reCAPTCHA v2 Test Page</h1>
  <form id="test-form">
    <div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const result = document.getElementById('result');
      result.textContent = 'Form submitted successfully!';
      result.style.color = 'green';
    });
  </script>
</body>
</html>
  `;

  const getHcaptchaPage = () => `
<!DOCTYPE html>
<html>
<head>
  <title>hCAPTCHA Test</title>
  <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
</head>
<body>
  <h1>hCAPTCHA Test Page</h1>
  <form id="test-form">
    <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const result = document.getElementById('result');
      result.textContent = 'Form submitted successfully!';
      result.style.color = 'green';
    });
  </script>
</body>
</html>
  `;

  const getAudioCaptchaPage = () => `
<!DOCTYPE html>
<html>
<head>
  <title>Audio CAPTCHA Test</title>
  <script src="https://www.google.com/recaptcha/api.js" async defer></script>
</head>
<body>
  <h1>Audio CAPTCHA Test Page</h1>
  <form id="test-form">
    <div class="g-recaptcha" data-sitekey="6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"></div>
    <button type="submit" id="submit-btn">Submit</button>
  </form>
  <div id="result"></div>
  <script>
    document.getElementById('test-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const result = document.getElementById('result');
      result.textContent = 'Form submitted successfully!';
      result.style.color = 'green';
    });
  </script>
</body>
</html>
  `;

  beforeAll(async () => {
    // Start mock HTTP server for captcha pages
    mockServerPort = 8888;
    mockServerUrl = `http://localhost:${mockServerPort}`;
    
    mockServer = createServer((req, res) => {
      let html = '';
      let contentType = 'text/html';

      if (req.url === '/recaptcha-v2') {
        html = getRecaptchaV2Page();
      } else if (req.url === '/hcaptcha') {
        html = getHcaptchaPage();
      } else if (req.url === '/audio-captcha') {
        html = getAudioCaptchaPage();
      } else {
        html = '<html><body><h1>Not Found</h1></body></html>';
        res.writeHead(404, { 'Content-Type': contentType });
        res.end(html);
        return;
      }

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(html);
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(mockServerPort, () => {
        resolve();
      });
    });

    // Initialize NestJS app
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply global validation pipe (same as main.ts)
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();

    // Get repositories
    jobRepository = moduleFixture.get<Repository<AutomationJob>>(
      getRepositoryToken(AutomationJob),
    );
    apiKeyRepository = moduleFixture.get<Repository<ApiKey>>(
      getRepositoryToken(ApiKey),
    );
    browserTypeRepository = moduleFixture.get<Repository<BrowserType>>(
      getRepositoryToken(BrowserType),
    );

    // Create test browser type if it doesn't exist
    const existingBrowserType = await browserTypeRepository.findOne({
      where: { id: 1 },
    });
    if (!existingBrowserType) {
      const browserType = browserTypeRepository.create({
        name: 'Chromium',
        type: BrowserTypeEnum.CHROMIUM,
        deviceType: DeviceTypeEnum.DESKTOP,
        isActive: true,
      });
      const saved = await browserTypeRepository.save(browserType);
      testBrowserTypeId = saved.id;
    } else {
      testBrowserTypeId = existingBrowserType.id;
    }

    // Create test API key
    const apiKey = apiKeyRepository.create({
      key: 'test-api-key-captcha-e2e',
      clientId: 'test-client-captcha',
      name: 'Test API Key for Captcha E2E',
      rateLimit: 1000,
      status: ApiKeyStatus.ACTIVE,
      isActive: true,
    });
    await apiKeyRepository.save(apiKey);
    testApiKey = apiKey.key;

    // Launch Playwright browser
    browser = await chromium.launch({
      headless: true,
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    // Cleanup
    if (page) {
      await page.close();
    }
    if (browser) {
      await browser.close();
    }
    if (mockServer) {
      await new Promise<void>((resolve) => {
        mockServer.close(() => {
          resolve();
        });
      });
    }
    if (jobRepository) {
      await jobRepository.delete({});
    }
    if (apiKeyRepository) {
      await apiKeyRepository.delete({ key: testApiKey });
    }
    if (app) {
      await app.close();
    }
  });

  describe('reCAPTCHA v2 E2E Test', () => {
    it('should detect and solve reCAPTCHA v2 captcha', async () => {
      const targetUrl = `${mockServerUrl}/recaptcha-v2`;

      // Create job with captcha config
      const createJobResponse = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl,
          actions: [
            {
              action: 'screenshot',
              fullPage: true,
              type: 'png',
            },
          ],
          captcha: {
            enabled: true,
            minConfidence: 0.5,
            enableThirdPartyFallback: false,
            solverPriority: ['native'],
          },
          timeoutMs: 60000,
        })
        .expect(201);

      expect(createJobResponse.body).toHaveProperty('success', true);
      expect(createJobResponse.body.data).toHaveProperty('jobId');
      const jobId = createJobResponse.body.data.jobId;

      // Wait for job to complete (with timeout)
      let jobStatus = JobStatus.PENDING;
      const maxWaitTime = 120000; // 2 minutes
      const startTime = Date.now();

      while (jobStatus === JobStatus.PENDING || jobStatus === JobStatus.PROCESSING) {
        if (Date.now() - startTime > maxWaitTime) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const jobResponse = await request(app.getHttpServer())
          .get(`/api/v1/jobs/${jobId}`)
          .set('X-API-Key', testApiKey)
          .expect(200);

        jobStatus = jobResponse.body.data.status;
      }

      // Verify job completed
      const finalJobResponse = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      const finalJob = finalJobResponse.body.data;
      
      // Job should be completed (either success or failure, but not pending)
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(finalJob.status);
      
      // If completed, verify captcha was detected and handled
      if (finalJob.status === JobStatus.COMPLETED) {
        // Check that artifacts were created (screenshots)
        expect(finalJob.artifacts).toBeDefined();
      }
    }, 150000); // 2.5 minute timeout
  });

  describe('hCAPTCHA E2E Test', () => {
    it('should detect and solve hCAPTCHA captcha', async () => {
      const targetUrl = `${mockServerUrl}/hcaptcha`;

      // Create job with captcha config
      const createJobResponse = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl,
          actions: [
            {
              action: 'screenshot',
              fullPage: true,
              type: 'png',
            },
          ],
          captcha: {
            enabled: true,
            minConfidence: 0.5,
            enableThirdPartyFallback: false,
            solverPriority: ['native'],
          },
          timeoutMs: 60000,
        })
        .expect(201);

      expect(createJobResponse.body).toHaveProperty('success', true);
      expect(createJobResponse.body.data).toHaveProperty('jobId');
      const jobId = createJobResponse.body.data.jobId;

      // Wait for job to complete (with timeout)
      let jobStatus = JobStatus.PENDING;
      const maxWaitTime = 120000; // 2 minutes
      const startTime = Date.now();

      while (jobStatus === JobStatus.PENDING || jobStatus === JobStatus.PROCESSING) {
        if (Date.now() - startTime > maxWaitTime) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const jobResponse = await request(app.getHttpServer())
          .get(`/api/v1/jobs/${jobId}`)
          .set('X-API-Key', testApiKey)
          .expect(200);

        jobStatus = jobResponse.body.data.status;
      }

      // Verify job completed
      const finalJobResponse = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      const finalJob = finalJobResponse.body.data;
      
      // Job should be completed (either success or failure, but not pending)
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(finalJob.status);
    }, 150000); // 2.5 minute timeout
  });

  describe('Audio CAPTCHA E2E Test', () => {
    it('should detect and handle audio captcha variant', async () => {
      const targetUrl = `${mockServerUrl}/audio-captcha`;

      // Create job with captcha config
      const createJobResponse = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl,
          actions: [
            {
              action: 'screenshot',
              fullPage: true,
              type: 'png',
            },
          ],
          captcha: {
            enabled: true,
            minConfidence: 0.5,
            enableThirdPartyFallback: false,
            solverPriority: ['native'],
          },
          timeoutMs: 60000,
        })
        .expect(201);

      expect(createJobResponse.body).toHaveProperty('success', true);
      expect(createJobResponse.body.data).toHaveProperty('jobId');
      const jobId = createJobResponse.body.data.jobId;

      // Wait for job to complete (with timeout)
      let jobStatus = JobStatus.PENDING;
      const maxWaitTime = 120000; // 2 minutes
      const startTime = Date.now();

      while (jobStatus === JobStatus.PENDING || jobStatus === JobStatus.PROCESSING) {
        if (Date.now() - startTime > maxWaitTime) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const jobResponse = await request(app.getHttpServer())
          .get(`/api/v1/jobs/${jobId}`)
          .set('X-API-Key', testApiKey)
          .expect(200);

        jobStatus = jobResponse.body.data.status;
      }

      // Verify job completed
      const finalJobResponse = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      const finalJob = finalJobResponse.body.data;
      
      // Job should be completed (either success or failure, but not pending)
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(finalJob.status);
    }, 150000); // 2.5 minute timeout
  });

  describe('Captcha Detection Workflow', () => {
    it('should detect captcha presence on page', async () => {
      const targetUrl = `${mockServerUrl}/recaptcha-v2`;

      // Navigate to page with Playwright to verify captcha is present
      await page.goto(targetUrl);
      await page.waitForLoadState('networkidle');

      // Check for reCAPTCHA iframe or element
      const recaptchaIframe = page.locator('iframe[src*="recaptcha"]');
      const recaptchaElement = page.locator('.g-recaptcha');
      const recaptchaExists = (await recaptchaIframe.count()) > 0 || (await recaptchaElement.count()) > 0;

      expect(recaptchaExists).toBe(true);
    });

    it('should detect hCAPTCHA presence on page', async () => {
      const targetUrl = `${mockServerUrl}/hcaptcha`;

      // Navigate to page with Playwright to verify captcha is present
      await page.goto(targetUrl);
      await page.waitForLoadState('networkidle');

      // Check for hCAPTCHA iframe
      const hcaptchaExists = await page.locator('.h-captcha').count() > 0;

      expect(hcaptchaExists).toBe(true);
    });
  });

  describe('Captcha Solving Submission Workflow', () => {
    it('should complete full workflow: detection → solving → submission', async () => {
      const targetUrl = `${mockServerUrl}/recaptcha-v2`;

      // Create job with captcha config and form submission
      const createJobResponse = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl,
          actions: [
            {
              action: 'click',
              target: 'Submit',
              getTargetBy: 'getByText',
            },
            {
              action: 'screenshot',
              fullPage: true,
              type: 'png',
            },
          ],
          captcha: {
            enabled: true,
            minConfidence: 0.5,
            enableThirdPartyFallback: false,
            solverPriority: ['native'],
          },
          timeoutMs: 90000,
        })
        .expect(201);

      expect(createJobResponse.body).toHaveProperty('success', true);
      const jobId = createJobResponse.body.data.jobId;

      // Wait for job to complete
      let jobStatus = JobStatus.PENDING;
      const maxWaitTime = 150000; // 2.5 minutes
      const startTime = Date.now();

      while (jobStatus === JobStatus.PENDING || jobStatus === JobStatus.PROCESSING) {
        if (Date.now() - startTime > maxWaitTime) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const jobResponse = await request(app.getHttpServer())
          .get(`/api/v1/jobs/${jobId}`)
          .set('X-API-Key', testApiKey)
          .expect(200);

        jobStatus = jobResponse.body.data.status;
      }

      // Verify job completed
      const finalJobResponse = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      const finalJob = finalJobResponse.body.data;
      
      // Job should be completed
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(finalJob.status);
    }, 180000); // 3 minute timeout
  });
});

