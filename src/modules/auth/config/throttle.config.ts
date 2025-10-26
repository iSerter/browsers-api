import { ThrottlerModuleOptions } from '@nestjs/throttler';

export const throttleConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'short',
      ttl: 1000, // 1 second
      limit: 10,
    },
    {
      name: 'medium',
      ttl: 10000, // 10 seconds
      limit: 50,
    },
    {
      name: 'long',
      ttl: 60000, // 1 minute
      limit: 100, // Default limit per API key
    },
  ],
};
