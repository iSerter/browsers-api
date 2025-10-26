import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { CreateUrlPolicyDto } from './dto/create-url-policy.dto';

@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  async createApiKey(@Body() dto: CreateApiKeyDto) {
    const apiKey = await this.apiKeysService.generateApiKey(dto);

    // Return API key (only shown once)
    return {
      id: apiKey.id,
      key: apiKey.key,
      clientId: apiKey.clientId,
      name: apiKey.name,
      rateLimit: apiKey.rateLimit,
      createdAt: apiKey.createdAt,
      message: 'Store this API key securely. It will not be shown again.',
    };
  }

  @Get()
  async listApiKeys() {
    const keys = await this.apiKeysService.findAllApiKeys();

    return keys.map((key) => ({
      id: key.id,
      clientId: key.clientId,
      name: key.name,
      rateLimit: key.rateLimit,
      status: key.status,
      isActive: key.isActive,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    }));
  }

  @Get(':id')
  async getApiKey(@Param('id') id: string) {
    return this.apiKeysService.findApiKeyById(id);
  }

  @Delete(':id')
  async revokeApiKey(@Param('id') id: string) {
    await this.apiKeysService.revokeApiKey(id);
    return { message: 'API key revoked successfully' };
  }

  @Get('url-policies')
  async listUrlPolicies() {
    return this.apiKeysService.findAllUrlPolicies();
  }

  @Post('url-policies')
  async createUrlPolicy(@Body() dto: CreateUrlPolicyDto) {
    return this.apiKeysService.createUrlPolicy(dto);
  }

  @Get('url-policies/:id')
  async getUrlPolicy(@Param('id') id: string) {
    return this.apiKeysService.findUrlPolicyById(id);
  }

  @Delete('url-policies/:id')
  async deleteUrlPolicy(@Param('id') id: string) {
    await this.apiKeysService.deleteUrlPolicy(id);
    return { message: 'URL policy deleted successfully' };
  }
}
