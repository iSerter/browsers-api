import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaptchaSolverApiKeys1731900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create captcha_solver_api_keys table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS captcha_solver_api_keys (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        api_key TEXT NOT NULL,
        health_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
        last_successful_use TIMESTAMP,
        last_failure TIMESTAMP,
        consecutive_failures INTEGER NOT NULL DEFAULT 0,
        total_uses INTEGER NOT NULL DEFAULT 0,
        total_failures INTEGER NOT NULL DEFAULT 0,
        last_validation_error TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_health_status CHECK (health_status IN ('healthy', 'unhealthy', 'unknown', 'validating'))
      );
    `);

    // Create indexes for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_captcha_solver_api_keys_provider 
      ON captcha_solver_api_keys(provider);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_captcha_solver_api_keys_health_status 
      ON captcha_solver_api_keys(health_status);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_captcha_solver_api_keys_provider_health 
      ON captcha_solver_api_keys(provider, health_status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_captcha_solver_api_keys_provider_health;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_captcha_solver_api_keys_health_status;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_captcha_solver_api_keys_provider;
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS captcha_solver_api_keys;
    `);
  }
}

