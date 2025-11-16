import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCaptchaSolverConfig1731800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create captcha_solver_configs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS captcha_solver_configs (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    // Create index on key for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_captcha_solver_configs_key 
      ON captcha_solver_configs(key);
    `);

    // Insert default configuration values
    await queryRunner.query(`
      INSERT INTO captcha_solver_configs (key, value) 
      VALUES 
        ('preferred_provider', '2captcha'),
        ('timeout_seconds', '60'),
        ('max_retries', '3')
      ON CONFLICT (key) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop index
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_captcha_solver_configs_key;
    `);

    // Drop table
    await queryRunner.query(`
      DROP TABLE IF EXISTS captcha_solver_configs;
    `);
  }
}
