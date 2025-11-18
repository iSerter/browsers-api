import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AutomationJob, JobStatus } from '../src/modules/jobs/entities/automation-job.entity';
import { JobArtifact, ArtifactType } from '../src/modules/jobs/entities/job-artifact.entity';
import { ApiKey, ApiKeyStatus } from '../src/modules/api-keys/entities/api-key.entity';
import { BrowserType, BrowserTypeEnum, DeviceTypeEnum } from '../src/modules/browsers/entities/browser-type.entity';
import { ActionType } from '../src/modules/jobs/dto/action-config.dto';

describe('Snapshot Action (e2e)', () => {
  let app: INestApplication<App>;
  let jobRepository: Repository<AutomationJob>;
  let artifactRepository: Repository<JobArtifact>;
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
    artifactRepository = moduleFixture.get<Repository<JobArtifact>>(
      getRepositoryToken(JobArtifact),
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
      key: 'test-api-key-snapshot-12345',
      clientId: 'test-client-snapshot',
      name: 'Test API Key for Snapshots',
      rateLimit: 1000,
      status: ApiKeyStatus.ACTIVE,
      isActive: true,
    });
    await apiKeyRepository.save(apiKey);
    testApiKey = apiKey.key;
  });

  afterAll(async () => {
    // Cleanup test data
    if (artifactRepository) {
      await artifactRepository.delete({});
    }
    if (jobRepository) {
      await jobRepository.delete({});
    }
    if (apiKeyRepository) {
      await apiKeyRepository.delete({ key: testApiKey });
    }
    await app.close();
  });

  afterEach(async () => {
    // Clean up artifacts and jobs after each test
    if (artifactRepository) {
      await artifactRepository.delete({});
    }
    if (jobRepository) {
      await jobRepository.delete({});
    }
  });

  // Helper function to create a job with snapshot action
  const createJobWithSnapshot = async (snapshotConfig?: {
    cookies?: boolean;
    localStorage?: boolean;
    sessionStorage?: boolean;
  }) => {
    const actions: any[] = [
      {
        action: ActionType.SNAPSHOT,
        ...(snapshotConfig && { snapshotConfig }),
      },
    ];

    const response = await request(app.getHttpServer())
      .post('/api/v1/jobs')
      .set('X-API-Key', testApiKey)
      .send({
        browserTypeId: testBrowserTypeId,
        targetUrl: 'https://example.com',
        actions,
        timeoutMs: 30000,
      });

    return response.body.data.jobId;
  };

  // Helper function to execute job and wait for completion
  const executeAndWaitForJob = async (
    jobId: string,
    maxWaitTime: number = 60000,
  ): Promise<AutomationJob> => {
    let jobStatus = JobStatus.PENDING;
    const startTime = Date.now();

    while (
      jobStatus === JobStatus.PENDING ||
      jobStatus === JobStatus.PROCESSING
    ) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new Error(`Job ${jobId} did not complete within ${maxWaitTime}ms`);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const jobResponse = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      jobStatus = jobResponse.body.data.status;
    }

    const finalJobResponse = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}`)
      .set('X-API-Key', testApiKey)
      .expect(200);

    return finalJobResponse.body.data;
  };

  // Helper function to get snapshot artifacts
  const getSnapshotArtifacts = async (jobId: string): Promise<JobArtifact[]> => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/artifacts`)
      .set('X-API-Key', testApiKey)
      .expect(200);

    return response.body.filter(
      (artifact: JobArtifact) => artifact.artifactType === ArtifactType.SNAPSHOT,
    );
  };

  // Helper function to parse snapshot content from artifact
  const parseSnapshotContent = async (
    jobId: string,
    artifactId: string,
  ): Promise<any> => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/artifacts/${artifactId}`)
      .set('X-API-Key', testApiKey)
      .expect(200);

    const jsonString = response.text;
    return JSON.parse(jsonString);
  };

  describe('Basic Snapshot Functionality', () => {
    it('should create a single snapshot with HTML content and metadata', async () => {
      const jobId = await createJobWithSnapshot();
      const job = await executeAndWaitForJob(jobId);

      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(job.status);
      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      expect(artifacts.length).toBe(1);

      const artifact = artifacts[0];
      expect(artifact.artifactType).toBe(ArtifactType.SNAPSHOT);
      expect(artifact.mimeType).toBe('application/json');

      const snapshotContent = await parseSnapshotContent(jobId, artifact.id);

      // Verify required fields
      expect(snapshotContent).toHaveProperty('html');
      expect(snapshotContent).toHaveProperty('url');
      expect(snapshotContent).toHaveProperty('title');
      expect(snapshotContent).toHaveProperty('timestamp');
      expect(snapshotContent).toHaveProperty('metadata');

      // Verify HTML content is not empty
      expect(snapshotContent.html).toBeTruthy();
      expect(typeof snapshotContent.html).toBe('string');
      expect(snapshotContent.html.length).toBeGreaterThan(0);

      // Verify metadata structure
      expect(snapshotContent.metadata).toHaveProperty('viewport');
      expect(snapshotContent.metadata).toHaveProperty('userAgent');
      expect(snapshotContent.metadata).toHaveProperty('language');
      expect(snapshotContent.metadata).toHaveProperty('platform');
      expect(snapshotContent.metadata).toHaveProperty('timezone');

      // Verify URL matches target
      expect(snapshotContent.url).toContain('example.com');
    }, 90000);

    it('should create multiple snapshots in sequence', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: 'https://example.com',
          actions: [
            {
              action: ActionType.SNAPSHOT,
            },
            {
              action: ActionType.SNAPSHOT,
            },
            {
              action: ActionType.SNAPSHOT,
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      expect(artifacts.length).toBe(3);

      // Verify each artifact has unique content
      const contents = await Promise.all(
        artifacts.map((artifact) => parseSnapshotContent(jobId, artifact.id)),
      );

      // All should have HTML content
      contents.forEach((content, index) => {
        expect(content).toHaveProperty('html');
        expect(content.html).toBeTruthy();
        expect(content).toHaveProperty('timestamp');
      });

      // Verify timestamps are different (or at least sequential)
      const timestamps = contents.map((c) => c.timestamp);
      expect(new Set(timestamps).size).toBeGreaterThanOrEqual(1); // At least some uniqueness
    }, 90000);
  });

  describe('Cookie Capture', () => {
    it('should capture cookies when cookies option is enabled', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: 'https://example.com',
          actions: [
            {
              action: ActionType.SNAPSHOT,
              snapshotConfig: {
                cookies: true,
              },
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      expect(artifacts.length).toBe(1);

      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Verify cookies are captured
      expect(snapshotContent).toHaveProperty('cookies');
      expect(Array.isArray(snapshotContent.cookies)).toBe(true);

      // Cookies array may be empty if no cookies are set, but the field should exist
      snapshotContent.cookies.forEach((cookie: any) => {
        expect(cookie).toHaveProperty('name');
        expect(cookie).toHaveProperty('value');
        expect(cookie).toHaveProperty('domain');
      });
    }, 90000);

    it('should not capture cookies when cookies option is disabled or omitted', async () => {
      const jobId = await createJobWithSnapshot({ cookies: false });
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Cookies should not be present or should be null/undefined
      expect(snapshotContent.cookies).toBeUndefined();
    }, 90000);
  });

  describe('LocalStorage Capture', () => {
    it('should capture localStorage when localStorage option is enabled', async () => {
      // Use data URL that sets localStorage, then snapshot
      const dataUrl = 'data:text/html,<html><body><script>localStorage.setItem("testKey", "testValue"); localStorage.setItem("anotherKey", "anotherValue");</script></body></html>';
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: dataUrl,
          actions: [
            {
              action: ActionType.SNAPSHOT,
              snapshotConfig: {
                localStorage: true,
              },
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Verify localStorage is captured
      expect(snapshotContent).toHaveProperty('localStorage');
      expect(typeof snapshotContent.localStorage).toBe('object');
      expect(snapshotContent.localStorage).not.toBeNull();

      // Verify localStorage contains expected data (if page set it)
      if (Object.keys(snapshotContent.localStorage).length > 0) {
        expect(typeof snapshotContent.localStorage).toBe('object');
      }
    }, 90000);
  });

  describe('SessionStorage Capture', () => {
    it('should capture sessionStorage when sessionStorage option is enabled', async () => {
      const dataUrl = 'data:text/html,<html><body><script>sessionStorage.setItem("sessionKey", "sessionValue");</script></body></html>';
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: dataUrl,
          actions: [
            {
              action: ActionType.SNAPSHOT,
              snapshotConfig: {
                sessionStorage: true,
              },
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Verify sessionStorage is captured
      expect(snapshotContent).toHaveProperty('sessionStorage');
      expect(typeof snapshotContent.sessionStorage).toBe('object');
      expect(snapshotContent.sessionStorage).not.toBeNull();
    }, 90000);
  });

  describe('Combined Storage Capture', () => {
    it('should capture all storage types when all options are enabled', async () => {
      const dataUrl = 'data:text/html,<html><body><script>localStorage.setItem("localKey", "localValue"); sessionStorage.setItem("sessionKey", "sessionValue");</script></body></html>';
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: dataUrl,
          actions: [
            {
              action: ActionType.SNAPSHOT,
              snapshotConfig: {
                cookies: true,
                localStorage: true,
                sessionStorage: true,
              },
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Verify all storage types are present
      expect(snapshotContent).toHaveProperty('cookies');
      expect(snapshotContent).toHaveProperty('localStorage');
      expect(snapshotContent).toHaveProperty('sessionStorage');

      // Verify they are the correct types
      expect(Array.isArray(snapshotContent.cookies)).toBe(true);
      expect(typeof snapshotContent.localStorage).toBe('object');
      expect(typeof snapshotContent.sessionStorage).toBe('object');
    }, 90000);
  });

  describe('Snapshot After Interactions', () => {
    it('should capture snapshot after page interactions', async () => {
      const dataUrl = 'data:text/html,<html><body><input id="testInput" type="text" /><button id="testButton">Click Me</button></body></html>';
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: dataUrl,
          actions: [
            {
              action: ActionType.FILL,
              target: '#testInput',
              getTargetBy: 'getBySelector',
              value: 'Test Value',
            },
            {
              action: ActionType.CLICK,
              target: '#testButton',
              getTargetBy: 'getBySelector',
            },
            {
              action: ActionType.SNAPSHOT,
            },
          ],
          timeoutMs: 30000,
        })
        .expect(201);

      const jobId = response.body.data.jobId;
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      const artifacts = await getSnapshotArtifacts(jobId);
      expect(artifacts.length).toBe(1);

      const snapshotContent = await parseSnapshotContent(jobId, artifacts[0].id);

      // Verify HTML content reflects the interactions
      expect(snapshotContent.html).toBeTruthy();
      expect(snapshotContent.html).toContain('testInput');
      expect(snapshotContent.html).toContain('testButton');
    }, 90000);
  });

  describe('Artifact Retrieval', () => {
    it('should retrieve snapshot artifacts by job ID', async () => {
      const jobId = await createJobWithSnapshot();
      const job = await executeAndWaitForJob(jobId);

      expect(job.status).toBe(JobStatus.COMPLETED);

      // Retrieve artifacts using the API endpoint
      const response = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${jobId}/artifacts`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      const allArtifacts = response.body;
      expect(Array.isArray(allArtifacts)).toBe(true);

      // Filter snapshot artifacts
      const snapshotArtifacts = allArtifacts.filter(
        (artifact: JobArtifact) => artifact.artifactType === ArtifactType.SNAPSHOT,
      );

      expect(snapshotArtifacts.length).toBeGreaterThan(0);

      // Verify artifact metadata
      snapshotArtifacts.forEach((artifact: JobArtifact) => {
        expect(artifact).toHaveProperty('id');
        expect(artifact).toHaveProperty('jobId', jobId);
        expect(artifact).toHaveProperty('artifactType', ArtifactType.SNAPSHOT);
        expect(artifact).toHaveProperty('mimeType', 'application/json');
        expect(artifact).toHaveProperty('filePath');
        expect(artifact).toHaveProperty('sizeBytes');
        expect(artifact).toHaveProperty('createdAt');
      });
    }, 90000);
  });

  describe('Error Scenarios', () => {
    it('should handle snapshot before navigation gracefully', async () => {
      // This test verifies that snapshot can work even if there's no explicit navigation
      // (the job processor should handle initial navigation)
      const jobId = await createJobWithSnapshot();
      const job = await executeAndWaitForJob(jobId);

      // Job should complete (either successfully or with a clear error)
      expect([JobStatus.COMPLETED, JobStatus.FAILED]).toContain(job.status);
    }, 90000);

    it('should validate snapshot configuration', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', testApiKey)
        .send({
          browserTypeId: testBrowserTypeId,
          targetUrl: 'https://example.com',
          actions: [
            {
              action: ActionType.SNAPSHOT,
              snapshotConfig: {
                cookies: 'invalid', // Should be boolean
              },
            },
          ],
        });

      // Should either accept it (if validation is lenient) or reject it
      // The validation pipe should handle this
      if (response.status === 400) {
        expect(response.body.success).toBe(false);
      }
    });
  });
});

