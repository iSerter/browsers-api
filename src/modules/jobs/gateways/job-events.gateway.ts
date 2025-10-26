import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable, UseGuards } from '@nestjs/common';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { JobEvent, JobEventType } from '../interfaces/job-event.interface';

interface ClientInfo {
  apiKeyId: string;
  clientId: string;
  connectedAt: Date;
  lastPong: Date;
}

@Injectable()
@WebSocketGateway({
  namespace: '/jobs',
  cors: {
    origin: '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class JobEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(JobEventsGateway.name);
  private readonly clients = new Map<string, ClientInfo>();
  private readonly apiKeyClients = new Map<string, Set<string>>(); // apiKeyId -> Set of socketIds
  private readonly MAX_CONNECTIONS_PER_KEY = 10;
  private pingInterval: NodeJS.Timeout;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PONG_TIMEOUT = 60000; // 60 seconds

  constructor(private readonly apiKeysService: ApiKeysService) {}

  afterInit() {
    this.logger.log('JobEventsGateway initialized');
    this.startPingInterval();
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client attempting connection: ${client.id}`);

    try {
      // Extract API key from handshake
      const apiKey = this.extractApiKey(client);
      if (!apiKey) {
        this.logger.warn(`No API key provided by client: ${client.id}`);
        client.disconnect();
        return;
      }

      // Validate API key
      const apiKeyData = await this.apiKeysService.validateApiKey(apiKey);
      if (!apiKeyData) {
        this.logger.warn(`Invalid API key from client: ${client.id}`);
        client.disconnect();
        return;
      }

      // Check connection limits
      const connectionsForKey =
        this.apiKeyClients.get(apiKeyData.id)?.size || 0;
      if (connectionsForKey >= this.MAX_CONNECTIONS_PER_KEY) {
        this.logger.warn(
          `Connection limit exceeded for API key: ${apiKeyData.id}`,
        );
        client.emit('error', { message: 'Maximum connections exceeded' });
        client.disconnect();
        return;
      }

      // Store client info
      const clientInfo: ClientInfo = {
        apiKeyId: apiKeyData.id,
        clientId: apiKeyData.clientId,
        connectedAt: new Date(),
        lastPong: new Date(),
      };
      this.clients.set(client.id, clientInfo);

      // Track client per API key
      if (!this.apiKeyClients.has(apiKeyData.id)) {
        this.apiKeyClients.set(apiKeyData.id, new Set());
      }
      this.apiKeyClients.get(apiKeyData.id)!.add(client.id);

      this.logger.log(
        `Client connected: ${client.id} (API key: ${apiKeyData.id})`,
      );
      client.emit('connected', {
        message: 'Connected to job events',
        clientId: apiKeyData.clientId,
      });
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (clientInfo) {
      // Remove from API key tracking
      const apiKeyClients = this.apiKeyClients.get(clientInfo.apiKeyId);
      if (apiKeyClients) {
        apiKeyClients.delete(client.id);
        if (apiKeyClients.size === 0) {
          this.apiKeyClients.delete(clientInfo.apiKeyId);
        }
      }

      this.logger.log(
        `Client disconnected: ${client.id} (API key: ${clientInfo.apiKeyId})`,
      );
      this.clients.delete(client.id);
    }
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (data?.jobId) {
      // Subscribe to specific job
      client.join(`job:${data.jobId}`);
      this.logger.log(
        `Client ${clientInfo.clientId} subscribed to job: ${data.jobId}`,
      );
      client.emit('subscribed', { jobId: data.jobId });
    } else {
      // Subscribe to all jobs for this client
      client.join(`client:${clientInfo.clientId}`);
      this.logger.log(`Client ${clientInfo.clientId} subscribed to all jobs`);
      client.emit('subscribed', { clientId: clientInfo.clientId });
    }
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId?: string },
  ) {
    const clientInfo = this.clients.get(client.id);
    if (!clientInfo) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    if (data?.jobId) {
      client.leave(`job:${data.jobId}`);
      this.logger.log(
        `Client ${clientInfo.clientId} unsubscribed from job: ${data.jobId}`,
      );
      client.emit('unsubscribed', { jobId: data.jobId });
    } else {
      client.leave(`client:${clientInfo.clientId}`);
      this.logger.log(
        `Client ${clientInfo.clientId} unsubscribed from all jobs`,
      );
      client.emit('unsubscribed', { clientId: clientInfo.clientId });
    }
  }

  @SubscribeMessage('pong')
  handlePong(@ConnectedSocket() client: Socket) {
    const clientInfo = this.clients.get(client.id);
    if (clientInfo) {
      clientInfo.lastPong = new Date();
      this.logger.debug(`Received pong from client: ${client.id}`);
    }
  }

  // Public method to emit job events
  emitJobEvent(event: JobEventType) {
    this.logger.log(`Emitting job event: ${event.type} for job ${event.jobId}`);

    // Emit to job-specific room
    this.server.to(`job:${event.jobId}`).emit('job.event', {
      ...event,
      data: event.data,
    });

    // Extract clientId from job if available (would need to be added to job entity)
    // For now, we'll need to get it from the database or pass it in the event
    // This is a simplified version - in production you'd fetch the clientId
  }

  emitJobEventToClient(clientId: string, event: JobEventType) {
    this.server.to(`client:${clientId}`).emit('job.event', {
      ...event,
      data: event.data,
    });
  }

  private extractApiKey(client: Socket): string | null {
    // Try query parameter first
    const query = client.handshake.query;
    if (query.apiKey) {
      return Array.isArray(query.apiKey) ? query.apiKey[0] : query.apiKey;
    }

    // Try authorization header
    const authHeader = client.handshake.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        return parts[1];
      }
    }

    // Try x-api-key header
    const apiKeyHeader = client.handshake.headers['x-api-key'] as string;
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    return null;
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      this.clients.forEach((clientInfo, socketId) => {
        const timeSinceLastPong = now.getTime() - clientInfo.lastPong.getTime();
        if (timeSinceLastPong > this.PONG_TIMEOUT) {
          this.logger.warn(`Client ${socketId} timed out, disconnecting`);
          this.server.to(socketId).disconnectSockets();
        } else {
          // Send ping
          this.server
            .to(socketId)
            .emit('ping', { timestamp: now.toISOString() });
        }
      });
    }, this.PING_INTERVAL);
  }
}
