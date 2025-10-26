import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { BrowsersService } from './browsers.service';

@Controller('browsers')
export class BrowsersController {
  constructor(private readonly browsersService: BrowsersService) {}

  @Get()
  async findAll() {
    return this.browsersService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.browsersService.findOne(id);
  }
}
