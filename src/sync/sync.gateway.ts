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

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class SyncGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

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
    const token = data?.token || (client.handshake.auth?.token as string);
    if (!token) {
      if (data?.userId) {
        client.join(data.userId);
        return { event: 'registered', data: { success: true } };
      }
      return { event: 'registered', data: { success: false } };
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production',
      });
      const userId = payload.sub || payload.userId || data?.userId;
      if (userId) {
        client.join(userId);
        console.log(`Client ${client.id} authenticated and joined room ${userId}`);
        return { event: 'registered', data: { success: true } };
      }
    } catch (e) {
      console.warn(`Socket auth token verification failed for client ${client.id}`);
      if (data?.userId) {
        client.join(data.userId);
        return { event: 'registered', data: { success: true } };
      }
    }

    return { event: 'registered', data: { success: false } };
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(userId).emit(event, data);
  }
}
