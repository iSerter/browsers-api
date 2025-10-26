import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrowserType } from './entities/browser-type.entity';

@Injectable()
export class BrowsersService {
  constructor(
    @InjectRepository(BrowserType)
    private readonly browserTypeRepository: Repository<BrowserType>,
  ) {}

  async findAll() {
    return this.browserTypeRepository.find({
      where: { isActive: true },
      order: { id: 'ASC' },
    });
  }

  async findOne(id: number) {
    const browserType = await this.browserTypeRepository.findOne({
      where: { id },
    });

    if (!browserType) {
      throw new NotFoundException(`Browser type with ID ${id} not found`);
    }

    return browserType;
  }
}
