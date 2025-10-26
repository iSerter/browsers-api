import { Test, TestingModule } from '@nestjs/testing';
import { JobEventsGateway } from './job-events.gateway';
import { ApiKeysService } from '../../api-keys/api-keys.service';
import { JobStatus } from '../entities/automation-job.entity';

describe('JobEventsGateway', () => {
  let gateway: JobEventsGateway;
  let mockApiKeysService: jest.Mocked<ApiKeysService>;
  let mockServer: any;
  let mockSocket: any;

  beforeEach(async () => {
    mockApiKeysService = {
      validateApiKey: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobEventsGateway,
        {
          provide: ApiKeysService,
          useValue: mockApiKeysService,
        },
      ],
    }).compile();

    gateway = module.get<JobEventsGateway>(JobEventsGateway);

    // Mock Socket.IO server
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      disconnectSockets: jest.fn(),
    };

    gateway.server = mockServer;

    // Mock socket
    mockSocket = {
      id: 'socket-id-123',
      handshake: {
        query: {},
        headers: {},
      },
      disconnect: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should disconnect client if no API key is provided', async () => {
      mockSocket.handshake.query = {};
      mockSocket.handshake.headers = {};

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if API key is invalid', async () => {
      mockSocket.handshake.query = { apiKey: 'invalid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue(null);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(mockApiKeysService.validateApiKey).toHaveBeenCalledWith(
        'invalid-key',
      );
    });

    it('should disconnect client if connection limit is exceeded', async () => {
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });

      // Add 10 existing connections for the API key
      const clients = new Set<string>();
      for (let i = 0; i < 10; i++) {
        clients.add(`socket-${i}`);
      }
      gateway['apiKeyClients'].set('api-key-id', clients);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should connect client with valid API key', async () => {
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        message: 'Connected to job events',
        clientId: 'client-id',
      });
      expect(gateway['clients'].has('socket-id-123')).toBe(true);
    });

    it('should extract API key from Bearer token in Authorization header', async () => {
      mockSocket.handshake.query = {};
      mockSocket.handshake.headers = {
        authorization: 'Bearer token-123',
      };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockApiKeysService.validateApiKey).toHaveBeenCalledWith(
        'token-123',
      );
    });

    it('should extract API key from x-api-key header', async () => {
      mockSocket.handshake.query = {};
      mockSocket.handshake.headers = {
        'x-api-key': 'api-key-123',
      };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });

      await gateway.handleConnection(mockSocket);

      expect(mockApiKeysService.validateApiKey).toHaveBeenCalledWith(
        'api-key-123',
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should cleanup client data on disconnect', async () => {
      // Setup: connect a client first
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });

      await gateway.handleConnection(mockSocket);

      // Now disconnect
      gateway.handleDisconnect(mockSocket);

      expect(gateway['clients'].has('socket-id-123')).toBe(false);
      const apiKeyClients = gateway['apiKeyClients'].get('api-key-id');
      if (apiKeyClients) {
        expect(apiKeyClients.has('socket-id-123')).toBe(false);
      }
    });
  });

  describe('handleSubscribe', () => {
    beforeEach(async () => {
      // Setup: connect a client first
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });
      await gateway.handleConnection(mockSocket);
    });

    it('should subscribe to specific job', () => {
      gateway.handleSubscribe(mockSocket, { jobId: 'job-123' });

      expect(mockSocket.join).toHaveBeenCalledWith('job:job-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribed', {
        jobId: 'job-123',
      });
    });

    it('should subscribe to all jobs for client', () => {
      gateway.handleSubscribe(mockSocket, {});

      expect(mockSocket.join).toHaveBeenCalledWith('client:client-id');
      expect(mockSocket.emit).toHaveBeenCalledWith('subscribed', {
        clientId: 'client-id',
      });
    });

    it('should emit error if not authenticated', () => {
      const unauthenticatedSocket = {
        id: 'unauthenticated-socket',
        emit: jest.fn(),
      };

      gateway.handleSubscribe(unauthenticatedSocket as any, {
        jobId: 'job-123',
      });

      expect(unauthenticatedSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Not authenticated',
      });
    });
  });

  describe('handleUnsubscribe', () => {
    beforeEach(async () => {
      // Setup: connect a client first
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });
      await gateway.handleConnection(mockSocket);
    });

    it('should unsubscribe from specific job', () => {
      gateway.handleUnsubscribe(mockSocket, { jobId: 'job-123' });

      expect(mockSocket.leave).toHaveBeenCalledWith('job:job-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribed', {
        jobId: 'job-123',
      });
    });

    it('should unsubscribe from all jobs', () => {
      gateway.handleUnsubscribe(mockSocket, {});

      expect(mockSocket.leave).toHaveBeenCalledWith('client:client-id');
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscribed', {
        clientId: 'client-id',
      });
    });
  });

  describe('handlePong', () => {
    beforeEach(async () => {
      mockSocket.handshake.query = { apiKey: 'valid-key' };
      mockApiKeysService.validateApiKey.mockResolvedValue({
        id: 'api-key-id',
        clientId: 'client-id',
        isActive: true,
      });
      await gateway.handleConnection(mockSocket);
    });

    it('should update last pong timestamp', () => {
      const originalLastPong =
        gateway['clients'].get('socket-id-123')!.lastPong;

      // Wait a bit
      setTimeout(() => {
        gateway.handlePong(mockSocket);
        const newLastPong = gateway['clients'].get('socket-id-123')!.lastPong;
        expect(newLastPong.getTime()).toBeGreaterThan(
          originalLastPong.getTime(),
        );
      }, 10);
    });
  });

  describe('emitJobEvent', () => {
    it('should emit job event to job room', () => {
      const event = {
        type: 'job.completed',
        jobId: 'job-123',
        status: JobStatus.COMPLETED,
        timestamp: new Date(),
        data: {
          completedAt: new Date(),
          artifacts: [],
          result: {},
        },
      };

      mockServer.to = jest.fn().mockReturnValue(mockServer);

      gateway.emitJobEvent(event);

      expect(mockServer.to).toHaveBeenCalledWith('job:job-123');
      expect(mockServer.emit).toHaveBeenCalledWith('job.event', event);
    });
  });

  describe('emitJobEventToClient', () => {
    it('should emit job event to client room', () => {
      const event = {
        type: 'job.completed',
        jobId: 'job-123',
        status: JobStatus.COMPLETED,
        timestamp: new Date(),
        data: {
          completedAt: new Date(),
          artifacts: [],
          result: {},
        },
      };

      mockServer.to = jest.fn().mockReturnValue(mockServer);

      gateway.emitJobEventToClient('client-id', event);

      expect(mockServer.to).toHaveBeenCalledWith('client:client-id');
      expect(mockServer.emit).toHaveBeenCalledWith('job.event', event);
    });
  });
});
