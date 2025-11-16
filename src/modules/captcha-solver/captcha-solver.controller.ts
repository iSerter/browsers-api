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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { CaptchaSolverService } from './captcha-solver.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { UpdateConfigDto } from './dto/update-config.dto';
import { TestCaptchaDto } from './dto/test-captcha.dto';
import { CaptchaParams } from './interfaces/captcha-solver.interface';

@ApiTags('captcha-solver')
@Controller('captcha-solver')
export class CaptchaSolverController {
  constructor(
    private readonly captchaSolverService: CaptchaSolverService,
    private readonly providerRegistry: ProviderRegistryService,
  ) {}

  @Get('providers')
  @ApiOperation({
    summary: 'Get available captcha solver providers',
    description: 'Returns a list of all registered captcha solver providers and their availability status',
  })
  @ApiOkResponse({
    description: 'List of providers with availability status',
    schema: {
      type: 'object',
      properties: {
        providers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', example: '2captcha' },
              available: { type: 'boolean', example: true },
            },
          },
        },
        availableCount: { type: 'number', example: 2 },
        totalCount: { type: 'number', example: 2 },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Test captcha solving',
    description: 'Attempts to solve a captcha challenge using the configured providers. Supports reCAPTCHA, hCAPTCHA, DataDome, and FunCaptcha.',
  })
  @ApiOkResponse({
    description: 'Captcha solved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        solution: {
          type: 'object',
          properties: {
            token: { type: 'string', example: '03AGdBq24...' },
            solvedAt: { type: 'string', format: 'date-time' },
            solverId: { type: 'string', example: '2captcha-123' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or no providers available',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'No captcha solver providers are available' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Get captcha solver configuration',
    description: 'Retrieves the current configuration settings for the captcha solver module',
  })
  @ApiOkResponse({
    description: 'Configuration retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        configs: {
          type: 'object',
          additionalProperties: { type: 'string' },
          example: {
            CAPTCHA_MIN_CONFIDENCE: '0.5',
            CAPTCHA_ENABLE_THIRD_PARTY_FALLBACK: 'true',
          },
        },
        configuration: {
          type: 'object',
          description: 'Additional configuration object',
        },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Update captcha solver configuration',
    description: 'Updates a specific configuration key-value pair for the captcha solver module',
  })
  @ApiOkResponse({
    description: 'Configuration updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Configuration updated successfully' },
        config: {
          type: 'object',
          properties: {
            key: { type: 'string', example: 'CAPTCHA_MIN_CONFIDENCE' },
            value: { type: 'string', example: '0.7' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid configuration key or value',
  })
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
  @ApiOperation({
    summary: 'Get captcha solver usage statistics',
    description: 'Retrieves usage statistics including total cost, provider usage, and summary metrics',
  })
  @ApiOkResponse({
    description: 'Statistics retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        totalCost: { type: 'number', example: 0.125 },
        availableProviders: {
          type: 'array',
          items: { type: 'string' },
          example: ['2captcha', 'anticaptcha'],
        },
        usage: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string', example: '2captcha' },
              totalUses: { type: 'number', example: 50 },
              totalCost: { type: 'number', example: 0.1 },
              successCount: { type: 'number', example: 48 },
              failureCount: { type: 'number', example: 2 },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            totalUses: { type: 'number', example: 50 },
            totalCost: { type: 'number', example: 0.125 },
            providerCount: { type: 'number', example: 2 },
          },
        },
      },
    },
  })
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
