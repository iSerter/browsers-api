import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrowserWorker, WorkerStatus } from './entities/browser-worker.entity';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(BrowserWorker)
    private readonly workerRepository: Repository<BrowserWorker>,
  ) {}

  async findAll() {
    return this.workerRepository.find({
      relations: ['browserType', 'currentJob'],
      order: { startedAt: 'DESC' },
    });
  }

  async getStats() {
    const workers = await this.workerRepository.find({
      relations: ['browserType'],
    });

    const totalWorkers = workers.length;
    const idleWorkers = workers.filter(
      (w) => w.status === WorkerStatus.IDLE,
    ).length;
    const busyWorkers = workers.filter(
      (w) => w.status === WorkerStatus.BUSY,
    ).length;
    const offlineWorkers = workers.filter(
      (w) => w.status === WorkerStatus.OFFLINE,
    ).length;

    // Group by browser type
    const byBrowserType = workers.reduce((acc, worker) => {
      const typeName = worker.browserType?.name || 'Unknown';
      if (!acc[typeName]) {
        acc[typeName] = { total: 0, idle: 0, busy: 0, offline: 0 };
      }
      acc[typeName].total++;
      if (worker.status === WorkerStatus.IDLE) acc[typeName].idle++;
      if (worker.status === WorkerStatus.BUSY) acc[typeName].busy++;
      if (worker.status === WorkerStatus.OFFLINE) acc[typeName].offline++;
      return acc;
    }, {});

    return {
      totalWorkers,
      idleWorkers,
      busyWorkers,
      offlineWorkers,
      byBrowserType,
    };
  }
}
