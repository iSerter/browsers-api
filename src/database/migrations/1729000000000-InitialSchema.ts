import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1729000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create browser_types table
    await queryRunner.query(`
      CREATE TABLE browser_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) NOT NULL,
        device_type VARCHAR(20) DEFAULT 'desktop',
        user_agent TEXT,
        viewport_width INTEGER,
        viewport_height INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for browser_types
    await queryRunner.query(`
      CREATE INDEX idx_browser_types_name ON browser_types(name);
    `);

    // Create automation_jobs table
    await queryRunner.query(`
      CREATE TABLE automation_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        browser_type_id INTEGER REFERENCES browser_types(id),
        target_url TEXT NOT NULL,
        actions JSONB NOT NULL,
        wait_until VARCHAR(20) DEFAULT 'networkidle',
        status VARCHAR(20) DEFAULT 'pending',
        priority INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        timeout_ms INTEGER DEFAULT 30000,
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        result JSONB,
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT actions_is_array CHECK (jsonb_typeof(actions) = 'array')
      );
    `);

    // Create indexes for automation_jobs
    await queryRunner.query(`
      CREATE INDEX idx_jobs_status ON automation_jobs(status);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_jobs_browser_type ON automation_jobs(browser_type_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_jobs_created_at ON automation_jobs(created_at);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_jobs_priority_created ON automation_jobs(priority DESC, created_at ASC) 
      WHERE status = 'pending';
    `);

    // Create job_artifacts table
    await queryRunner.query(`
      CREATE TABLE job_artifacts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
        artifact_type VARCHAR(50) NOT NULL,
        file_path TEXT,
        file_data BYTEA,
        mime_type VARCHAR(100),
        size_bytes BIGINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create index for job_artifacts
    await queryRunner.query(`
      CREATE INDEX idx_artifacts_job_id ON job_artifacts(job_id);
    `);

    // Create browser_workers table
    await queryRunner.query(`
      CREATE TABLE browser_workers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        browser_type_id INTEGER REFERENCES browser_types(id),
        status VARCHAR(20) DEFAULT 'idle',
        current_job_id UUID REFERENCES automation_jobs(id),
        last_heartbeat TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP DEFAULT NOW(),
        metadata JSONB
      );
    `);

    // Create indexes for browser_workers
    await queryRunner.query(`
      CREATE INDEX idx_workers_status ON browser_workers(status);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_workers_browser_type ON browser_workers(browser_type_id);
    `);

    // Create job_logs table
    await queryRunner.query(`
      CREATE TABLE job_logs (
        id SERIAL PRIMARY KEY,
        job_id UUID REFERENCES automation_jobs(id) ON DELETE CASCADE,
        level VARCHAR(20),
        message TEXT NOT NULL,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for job_logs
    await queryRunner.query(`
      CREATE INDEX idx_logs_job_id ON job_logs(job_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_logs_created_at ON job_logs(created_at);
    `);

    // Insert seed data for browser types
    await queryRunner.query(`
      INSERT INTO browser_types (name, type, device_type, viewport_width, viewport_height) VALUES
        ('Chromium', 'chromium', 'desktop', 1920, 1080),
        ('Firefox', 'firefox', 'desktop', 1920, 1080),
        ('WebKit', 'webkit', 'desktop', 1920, 1080),
        ('Mobile Chrome', 'chromium', 'mobile', 375, 667),
        ('Mobile Firefox', 'firefox', 'mobile', 375, 667);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryRunner.query(`DROP TABLE IF EXISTS job_logs CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS browser_workers CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS job_artifacts CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS automation_jobs CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS browser_types CASCADE;`);
  }
}

