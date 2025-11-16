import { Controller, Get, Patch, Body } from '@nestjs/common';
import { CaptchaSolverService } from './captcha-solver.service';
import { UpdateConfigDto } from './dto/update-config.dto';

@Controller('captcha-solver')
export class CaptchaSolverController {
  constructor(private readonly captchaSolverService: CaptchaSolverService) {}

  @Get('providers')
  async getProviders() {
    return {
      providers: this.captchaSolverService.getAvailableProviders(),
    };
  }

  @Get('config')
  async getConfig() {
    const configs = await this.captchaSolverService.getAllConfigs();
    return {
      configs: configs.reduce((acc, config) => {
        acc[config.key] = config.value;
        return acc;
      }, {} as Record<string, string>),
    };
  }

  @Patch('config')
  async updateConfig(@Body() updateConfigDto: UpdateConfigDto) {
    const { key, value } = updateConfigDto;
    const config = await this.captchaSolverService.setConfig(key, value);
    return {
      message: 'Configuration updated successfully',
      config: {
        key: config.key,
        value: config.value,
      },
    };
  }
}
