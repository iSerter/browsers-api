import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { CaptchaSolverService } from './captcha-solver.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { TestCaptchaDto } from './dto/test-captcha.dto';
import { CaptchaParams } from './interfaces/captcha-solver.interface';

@Controller('captcha-solver')
export class CaptchaSolverController {
  constructor(
    private readonly captchaSolverService: CaptchaSolverService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  @Get('providers')
  async getProviders() {
    const availableProviders = this.captchaSolverService.getAvailableProviders();
    const allProviders = this.providerRegistry.getProviderNames();
    
    // Check availability for each provider
    const providersWithDetails = await Promise.all(
      allProviders.map(async (name) => {
        const provider = this.providerRegistry.getProvider(name);
        const isAvailable = provider
          ? await provider.isAvailable()
          : false;
        return {
          name,
          available: isAvailable,
        };
      }),
    );

    return {
      providers: providersWithDetails,
      availableCount: availableProviders.length,
      totalCount: allProviders.length,
    };
  }

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testCaptcha(@Body() testCaptchaDto: TestCaptchaDto) {
    // Validate that at least one provider is available
    const availableProviders = this.captchaSolverService.getAvailableProviders();
    if (availableProviders.length === 0) {
      throw new BadRequestException(
        'No captcha solver providers are available. Please configure at least one API key.',
      );
    }

    // Convert DTO to CaptchaParams
    const params: CaptchaParams = {
      type: testCaptchaDto.type,
      url: testCaptchaDto.url,
      sitekey: testCaptchaDto.sitekey,
      version: testCaptchaDto.version,
      action: testCaptchaDto.action,
      proxy: testCaptchaDto.proxy
        ? {
            type: testCaptchaDto.proxy.type,
            host: testCaptchaDto.proxy.host,
            port: testCaptchaDto.proxy.port,
            username: testCaptchaDto.proxy.username,
            password: testCaptchaDto.proxy.password,
          }
        : undefined,
    };

    try {
      const solution = await this.captchaSolverService.solveWithFallback(params);
      return {
        success: true,
        solution: {
          token: solution.token,
          solvedAt: solution.solvedAt,
          solverId: solution.solverId,
        },
      };
    } catch (error: any) {
      throw new BadRequestException(
        `Failed to solve captcha: ${error.message}`,
      );
    }
  }

  @Get('config')
  async getConfig() {
    const configs = await this.captchaSolverService.getAllConfigs();
    const configuration = this.captchaSolverService.getConfiguration();
    return {
      configs: configs.reduce((acc, config) => {
        acc[config.key] = config.value;
        return acc;
      }, {} as Record<string, string>),
      configuration,
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

  @Get('stats')
  async getStats() {
    const stats = this.captchaSolverService.getUsageStatistics();
    const totalCost = this.captchaSolverService.getTotalCost();
    const availableProviders = this.captchaSolverService.getAvailableProviders();

    return {
      totalCost,
      availableProviders,
      usage: stats,
      summary: {
        totalUses: stats.reduce((sum, stat) => sum + stat.totalUses, 0),
        totalCost,
        providerCount: stats.length,
      },
    };
  }
}
