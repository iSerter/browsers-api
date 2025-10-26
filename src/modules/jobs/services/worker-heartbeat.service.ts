import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkerStatus } from '../../workers/entities/browser-worker.entity';

@Injectable()
export class WorkerHeartbeatService implements OnModuleInit {
  private readonly logger = new Logger(WorkerHeartbeatService.name);
  private workerId: string | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly heartbeatIntervalMs = 10000; // 10 seconds
  private readonly heartbeatTimeoutMs = 30000; // 30 seconds
  private lastHeartbeat: Date | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    // Worker registration and heartbeat will be handled by the worker manager
    this.logger.log('WorkerHeartbeatService initialized');
  }

  startHeartbeat(workerId: string): void {
    this.workerId = workerId;
    this.lastHeartbeat = new Date();

    // Send heartbeat immediately
    this.updateHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatInterval = setInterval(() => {
      this.updateHeartbeat();
    }, this.heartbeatIntervalMs);

    this.logger.log(`Started heartbeat monitoring for worker ${workerId}`);
  }

  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.log(
        `Stopped heartbeat monitoring for worker ${this.workerId}`,
      );
    }
  }

  private updateHeartbeat(): void {
    if (this.workerId) {
      // This will be called by the worker manager to update the database
      // The actual implementation will be in the WorkerManagerService
      this.lastHeartbeat = new Date();
      this.logger.debug(
        `Heartbeat update at ${this.lastHeartbeat.toISOString()}`,
      );
    }
  }

  getLastHeartbeat(): Date | null {
    return this.lastHeartbeat;
  }

  isWorkerHealthy(): boolean {
    if (!this.lastHeartbeat) {
      return false;
    }

    const now = new Date();
    const timeSinceLastHeartbeat = now.getTime() - this.lastHeartbeat.getTime();
    return timeSinceLastHeartbeat < this.heartbeatTimeoutMs;
  }

  async getHeartbeatTimeoutMs(): Promise<number> {
    return this.heartbeatTimeoutMs;
  }
}
