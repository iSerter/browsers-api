import { Controller, Get } from '@nestjs/common';
import { WorkersService } from './workers.service';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  @Get()
  async findAll() {
    return this.workersService.findAll();
  }

  @Get('stats')
  async getStats() {
    return this.workersService.getStats();
  }
}

