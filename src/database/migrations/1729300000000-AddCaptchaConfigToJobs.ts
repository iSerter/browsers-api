import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaptchaConfigToJobs1729300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add captcha_config column to automation_jobs table
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      ADD COLUMN IF NOT EXISTS captcha_config JSONB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop column
    await queryRunner.query(`
      ALTER TABLE automation_jobs
      DROP COLUMN IF EXISTS captcha_config;
    `);
  }
}



