import { AppDataSource } from '../data-source';
import {
  BrowserType,
  BrowserTypeEnum,
  DeviceTypeEnum,
} from '../../modules/browsers/entities/browser-type.entity';

export async function seedBrowserTypes() {
  const browserTypeRepository = AppDataSource.getRepository(BrowserType);

  const browserTypes = [
    {
      name: 'Chromium',
      type: BrowserTypeEnum.CHROMIUM,
      deviceType: DeviceTypeEnum.DESKTOP,
      viewportWidth: 1920,
      viewportHeight: 1080,
      userAgent: null,
      isActive: true,
    },
    {
      name: 'Firefox',
      type: BrowserTypeEnum.FIREFOX,
      deviceType: DeviceTypeEnum.DESKTOP,
      viewportWidth: 1920,
      viewportHeight: 1080,
      userAgent: null,
      isActive: true,
    },
    {
      name: 'WebKit',
      type: BrowserTypeEnum.WEBKIT,
      deviceType: DeviceTypeEnum.DESKTOP,
      viewportWidth: 1920,
      viewportHeight: 1080,
      userAgent: null,
      isActive: true,
    },
    {
      name: 'Mobile Chrome',
      type: BrowserTypeEnum.CHROMIUM,
      deviceType: DeviceTypeEnum.MOBILE,
      viewportWidth: 375,
      viewportHeight: 667,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      isActive: true,
    },
    {
      name: 'Mobile Firefox',
      type: BrowserTypeEnum.FIREFOX,
      deviceType: DeviceTypeEnum.MOBILE,
      viewportWidth: 375,
      viewportHeight: 667,
      userAgent:
        'Mozilla/5.0 (Android 11; Mobile; rv:98.0) Gecko/98.0 Firefox/98.0',
      isActive: true,
    },
  ];

  for (const browserTypeData of browserTypes) {
    const exists = await browserTypeRepository.findOne({
      where: { name: browserTypeData.name },
    });

    if (!exists) {
      const browserType = browserTypeRepository.create(browserTypeData);
      await browserTypeRepository.save(browserType);
      console.log(`✓ Created browser type: ${browserTypeData.name}`);
    } else {
      console.log(`- Browser type already exists: ${browserTypeData.name}`);
    }
  }
}

// Run seed if called directly
if (require.main === module) {
  AppDataSource.initialize()
    .then(async () => {
      console.log('Data Source initialized');
      await seedBrowserTypes();
      console.log('Seeding completed');
      await AppDataSource.destroy();
    })
    .catch((error) => {
      console.error('Error during seeding:', error);
      process.exit(1);
    });
}

