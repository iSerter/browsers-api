import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrowserStorageToJobs1732000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add browser_storage column to automation_jobs table
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      ADD COLUMN IF NOT EXISTS browser_storage JSONB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop column
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      DROP COLUMN IF EXISTS browser_storage;
    `);
  }
}
