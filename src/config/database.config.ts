import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export default registerAs('database', (): TypeOrmModuleOptions => {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'automation_user',
    password: process.env.DB_PASSWORD || 'secure_password',
    database: process.env.DB_DATABASE || 'browser_automation',
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: false,
    // Connection pool configuration for better performance
    extra: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum pool size
      min: parseInt(process.env.DB_POOL_MIN || '5', 10), // Minimum pool size
      idleTimeoutMillis: parseInt(
        process.env.DB_POOL_IDLE_TIMEOUT || '30000',
        10,
      ), // 30 seconds
      connectionTimeoutMillis: parseInt(
        process.env.DB_CONNECTION_TIMEOUT || '5000',
        10,
      ), // 5 seconds
    },
  };
});
