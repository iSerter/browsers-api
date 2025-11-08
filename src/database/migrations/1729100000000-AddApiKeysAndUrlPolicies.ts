import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeysAndUrlPolicies1729100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create api_keys table
    await queryRunner.query(`
      CREATE TABLE api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(64) UNIQUE NOT NULL,
        client_id VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        rate_limit INTEGER DEFAULT 100,
        is_active BOOLEAN DEFAULT true,
        last_used_at TIMESTAMP,
        expires_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for api_keys
    await queryRunner.query(`
      CREATE INDEX idx_api_keys_key ON api_keys(key);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_api_keys_client_id ON api_keys(client_id);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_api_keys_status ON api_keys(status);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_api_keys_created_at ON api_keys(created_at);
    `);

    // Create url_policies table
    await queryRunner.query(`
      CREATE TABLE url_policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern VARCHAR(255) NOT NULL,
        type VARCHAR(20) DEFAULT 'blacklist',
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for url_policies
    await queryRunner.query(`
      CREATE INDEX idx_url_policies_type ON url_policies(type);
    `);
    await queryRunner.query(`
      CREATE INDEX idx_url_policies_is_active ON url_policies(is_active);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS url_policies CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS api_keys CASCADE;`);
  }
}

