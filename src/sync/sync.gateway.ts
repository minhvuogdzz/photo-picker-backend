import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

interface SocketTokenPayload {
  readonly sub?: string;
  readonly deviceId?: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('register')
  async handleRegister(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; token?: string },
  ) {
    const handshakeToken: unknown = client.handshake.auth?.token;
    const token =
      data?.token ||
      (typeof handshakeToken === 'string' ? handshakeToken : undefined);
    if (!token) {
      client.disconnect(true);
      return { event: 'registered', data: { success: false } };
    }

    try {
      const payload = await this.jwtService.verifyAsync<SocketTokenPayload>(
        token,
        {
          secret:
            process.env.JWT_SECRET ||
            'super-secret-jwt-key-replace-in-production',
        },
      );
      const userId = payload.sub;
      const deviceId = payload.deviceId;
      if (!userId || !deviceId) {
        throw new Error('Missing socket identity');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { subscription: true },
      });
      const device = await this.prisma.device.findFirst({
        where: { userId, deviceFingerprint: deviceId },
      });
      const blocked =
        user?.role !== 'ADMIN' &&
        (!user?.subscription ||
          ['EXPIRED', 'INACTIVE', 'SUSPENDED', 'CANCELLED'].includes(
            user.subscription.status,
          ));

      if (!user || !device || blocked) {
        const invalidEvent =
          user?.subscription?.status === 'SUSPENDED'
            ? 'accountSuspended'
            : blocked
              ? 'subscriptionExpired'
              : 'forceLogout';
        client.emit(invalidEvent, {
          deviceId: 'all',
        });
        client.disconnect(true);
        return { event: 'registered', data: { success: false } };
      }

      await client.join(userId);
      console.log(
        `Client ${client.id} authenticated and joined room ${userId}`,
      );
      return { event: 'registered', data: { success: true } };
    } catch {
      console.warn(
        `Socket auth token verification failed for client ${client.id}`,
      );
      client.emit('forceLogout', { deviceId: 'all' });
      client.disconnect(true);
    }

    return { event: 'registered', data: { success: false } };
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(userId).emit(event, data);
  }

  broadcastEvent(event: string, data: unknown) {
    this.server.emit(event, data);
  }
}
