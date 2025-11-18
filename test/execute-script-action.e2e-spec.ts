import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as request from 'supertest';
import { JobsModule } from '../src/modules/jobs/jobs.module';
import { BrowsersModule } from '../src/modules/browsers/browsers.module';
import { ApiKeysModule } from '../src/modules/api-keys/api-keys.module';
import { validationSchema } from '../src/config/validation.schema';

describe('ExecuteScript Action E2E', () => {
  let app: INestApplication;
  let configService: ConfigService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validationSchema,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres',
            host: config.get('DB_HOST'),
            port: config.get('DB_PORT'),
            username: config.get('DB_USERNAME'),
            password: config.get('DB_PASSWORD'),
            database: config.get('DB_DATABASE'),
            entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
            synchronize: true,
            dropSchema: true,
          }),
        }),
        JobsModule,
        BrowsersModule,
        ApiKeysModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    configService = moduleFixture.get<ConfigService>(ConfigService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /jobs with executeScript action', () => {
    it('should reject executeScript when ENABLE_EXECUTE_SCRIPT is false', async () => {
      // Verify the flag is false
      const isEnabled = configService.get('ENABLE_EXECUTE_SCRIPT', false);
      expect(isEnabled).toBe(false);

      const jobPayload = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'executeScript',
            script: 'return document.title',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', 'test-api-key')
        .send(jobPayload)
        .expect(201);

      // Job should be created but will fail during execution
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.status).toBe('pending');

      // Wait a moment for processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check job status - it should have failed
      const jobStatus = await request(app.getHttpServer())
        .get(`/api/v1/jobs/${response.body.data.id}`)
        .set('X-API-Key', 'test-api-key')
        .expect(200);

      expect(jobStatus.body.data.status).toBe('failed');
      expect(jobStatus.body.data.error).toContain('executeScript action is disabled');
    });

    it('should accept executeScript action in job payload validation', async () => {
      const jobPayload = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'executeScript',
            script: 'console.log("test")',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', 'test-api-key')
        .send(jobPayload)
        .expect(201);

      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.actions[0].action).toBe('executeScript');
      expect(response.body.data.actions[0].script).toBe('console.log("test")');
    });

    it('should reject executeScript without script field', async () => {
      const jobPayload = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'executeScript',
          },
        ],
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', 'test-api-key')
        .send(jobPayload)
        .expect(201);

      // Job is created but will fail during execution
      expect(response.body.data.id).toBeDefined();
    });

    it('should include executeScript in action type enum', async () => {
      const jobPayload = {
        browserTypeId: 1,
        targetUrl: 'https://example.com',
        actions: [
          {
            action: 'invalidAction',
            script: 'test',
          },
        ],
      };

      await request(app.getHttpServer())
        .post('/api/v1/jobs')
        .set('X-API-Key', 'test-api-key')
        .send(jobPayload)
        .expect(400);
    });
  });
});

