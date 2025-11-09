import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AutomationJob, JobStatus } from '../src/modules/jobs/entities/automation-job.entity';
import { ApiKey, ApiKeyStatus } from '../src/modules/api-keys/entities/api-key.entity';
import { BrowserType, BrowserTypeEnum, DeviceTypeEnum } from '../src/modules/browsers/entities/browser-type.entity';
import { ActionType } from '../src/modules/jobs/dto/action-config.dto';

describe('JobsController (e2e)', () => {
  let app: INestApplication<App>;
  let jobRepository: Repository<AutomationJob>;
  let apiKeyRepository: Repository<ApiKey>;
  let browserTypeRepository: Repository<BrowserType>;
  let testApiKey: string;
  let testBrowserTypeId: number;

  beforeAll(async () => {
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
      key: 'test-api-key-12345',
      clientId: 'test-client',
      name: 'Test API Key',
      rateLimit: 1000,
      status: ApiKeyStatus.ACTIVE,
      isActive: true,
    });
    await apiKeyRepository.save(apiKey);
    testApiKey = apiKey.key;
  });

  afterAll(async () => {
    // Cleanup test data
    if (jobRepository) {
      await jobRepository.delete({});
    }
    if (apiKeyRepository) {
      await apiKeyRepository.delete({ key: testApiKey });
    }
    await app.close();
  });

  describe('POST /api/v1/jobs', () => {
    const getValidPayload = () => ({
      browserTypeId: testBrowserTypeId,
      targetUrl: 'https://iserter.com',
      actions: [
        {
          action: 'click',
          target: 'Contact',
          getTargetBy: 'getByText',
          waitForNavigation: true,
        },
        {
          action: 'fill',
          target: 'Full Name',
          getTargetBy: 'getByLabel',
          value: 'Ilyas Test',
        },
        {
          action: 'fill',
          target: 'Email Address',
          getTargetBy: 'getByLabel',
          value: 'ilyas.serter+test@gmail.com',
        },
        {
          action: 'fill',
          target: 'Subject',
          getTargetBy: 'getByLabel',
          value: 'lorem ipsum',
        },
        {
          action: 'moveCursor',
          target: 'Send message',
          getTargetBy: 'getByText',
        },
        {
          action: 'screenshot',
          fullPage: true,
          type: 'png',
        },
      ],
      timeoutMs: 30000,
    });

    it('should create a job successfully with valid payload', async () => {
      const validPayload = getValidPayload();
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(validPayload)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('jobId');
      expect(response.body.data).toHaveProperty('status', JobStatus.PENDING);
      expect(response.body.data).toHaveProperty('createdAt');

      // Verify job was saved to database
      const job = await jobRepository.findOne({
        where: { id: response.body.data.jobId },
      });
      expect(job).toBeDefined();
      expect(job.browserTypeId).toBe(validPayload.browserTypeId);
      expect(job.targetUrl).toBe(validPayload.targetUrl);
      expect(job.actions).toEqual(validPayload.actions);
      expect(job.timeoutMs).toBe(validPayload.timeoutMs);
    });

    it('should create a job with all action types', async () => {
      const payloadWithAllActions = {
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'click',
            target: 'Button',
            getTargetBy: 'getByText',
          },
          {
            action: 'fill',
            target: 'Input',
            getTargetBy: 'getByLabel',
            value: 'test value',
          },
          {
            action: 'scroll',
            targetY: 1000,
            speed: 2000,
          },
          {
            action: 'moveCursor',
            target: 'Element',
            getTargetBy: 'getBySelector',
            speed: 1000,
          },
          {
            action: 'screenshot',
            fullPage: true,
            type: 'png',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(payloadWithAllActions)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('jobId');
    });

    it('should use default values for optional fields', async () => {
      const minimalPayload = {
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'click',
            target: 'Button',
            getTargetBy: 'getByText',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(minimalPayload)
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify defaults were applied
      const job = await jobRepository.findOne({
        where: { id: response.body.data.jobId },
      });
      expect(job.priority).toBe(0);
      expect(job.timeoutMs).toBe(30000);
      expect(job.maxRetries).toBe(3);
    });

    it('should accept custom priority, timeout, and retries', async () => {
      const payloadWithCustomValues = {
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'click',
            target: 'Button',
            getTargetBy: 'getByText',
          },
        ],
        priority: 50,
        timeoutMs: 60000,
        maxRetries: 5,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(payloadWithCustomValues)
        .expect(201);

      const job = await jobRepository.findOne({
        where: { id: response.body.data.jobId },
      });
      expect(job.priority).toBe(50);
      expect(job.timeoutMs).toBe(60000);
      expect(job.maxRetries).toBe(5);
    });

    it('should reject request without API key', async () => {
      const validPayload = getValidPayload();
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .send(validPayload)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('API key');
    });

    it('should reject request with invalid API key', async () => {
      const validPayload = getValidPayload();
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', 'invalid-key')
        .send(validPayload)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should validate required fields', async () => {
      const invalidPayload = {};

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBeInstanceOf(Array);
      expect(response.body.error.message.length).toBeGreaterThan(0);
    });

    it('should validate browserTypeId is a positive integer', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        browserTypeId: -1,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate targetUrl is a valid URL', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        targetUrl: 'not-a-valid-url',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate actions array is not empty', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        actions: [],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate action type enum', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        actions: [
          {
            action: 'invalidAction',
            target: 'Button',
            getTargetBy: 'getByText',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate getTargetBy enum when provided', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        actions: [
          {
            action: 'click',
            target: 'Button',
            getTargetBy: 'invalidMethod',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate timeoutMs range', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        timeoutMs: 500, // Below minimum of 1000
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate priority range', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        priority: 150, // Above maximum of 100
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject non-whitelisted properties in actions', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        actions: [
          {
            action: 'click',
            target: 'Button',
            getTargetBy: 'getByText',
            invalidProperty: 'should not exist',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBeInstanceOf(Array);
      expect(
        response.body.error.message.some((msg: string) =>
          msg.includes('invalidProperty'),
        ),
      ).toBe(true);
    });

    it('should return 400 when browser type does not exist', async () => {
      const validPayload = getValidPayload();
      const invalidPayload = {
        ...validPayload,
        browserTypeId: 99999,
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(invalidPayload)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('not found');
    });

    it('should accept API key via Authorization Bearer header', async () => {
      const validPayload = getValidPayload();
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('Authorization', `Bearer ${testApiKey}`)
        .send(validPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle scroll action with targetY', async () => {
      const scrollPayload = {
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'scroll',
            targetY: 2000,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(scrollPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should handle screenshot action with different types', async () => {
      const screenshotPayload = {
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'screenshot',
            fullPage: false,
            type: 'jpeg',
            quality: 90,
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send(screenshotPayload)
        .expect(201);

      expect(response.body.success).toBe(true);
    });
  });
});

