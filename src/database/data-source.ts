import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load environment variables
config();

// Determine if we're running compiled code (production) or source code (development)
const isProduction = process.env.NODE_ENV === 'production' || !require('fs').existsSync('src');
const basePath = isProduction ? 'dist' : 'src';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'automation_user',
  password: process.env.DB_PASSWORD || 'secure_password',
  database: process.env.DB_DATABASE || 'browser_automation',
  entities: [`${basePath}/**/*.entity{.ts,.js}`],
  migrations: [`${basePath}/database/migrations/*{.ts,.js}`],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
