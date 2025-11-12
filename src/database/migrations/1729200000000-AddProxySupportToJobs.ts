import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProxySupportToJobs1729200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add proxy columns to automation_jobs table
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      ADD COLUMN IF NOT EXISTS proxy_server VARCHAR(500),
      ADD COLUMN IF NOT EXISTS proxy_username VARCHAR(255),
      ADD COLUMN IF NOT EXISTS proxy_password VARCHAR(255);
    `);

    // Add index on proxy_server for potential filtering/analytics
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_automation_jobs_proxy_server 
      ON automation_jobs(proxy_server) 
      WHERE proxy_server IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_automation_jobs_proxy_server;
    `);

    // Drop columns
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      DROP COLUMN IF EXISTS proxy_server,
      DROP COLUMN IF EXISTS proxy_username,
      DROP COLUMN IF EXISTS proxy_password;
    `);
  }
}

