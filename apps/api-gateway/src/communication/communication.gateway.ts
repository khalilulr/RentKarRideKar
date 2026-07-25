import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
@Injectable()
export class CommunicationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(CommunicationGateway.name);
  private readonly internalUrl =
    process.env.COMMUNICATION_SERVICE_URL ||
    'http://communication-service:3003/communication';

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1] ||
        client.handshake.query?.token;
      if (!token) {
        this.logger.warn('Connection attempt without token');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      client.join(`user_${payload.userId}`);
      this.logger.log(
        `Client connected: ${client.id} (User: ${payload.userId}), joined private room: user_${payload.userId}`,
      );
    } catch (err: any) {
      this.logger.warn(`Auth failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('joinChat')
  handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    if (data?.roomId) {
      client.join(`chat_${data.roomId}`);
      this.logger.log(
        `Client ${client.id} joined chat room chat_${data.roomId}`,
      );
      return { status: 'success', joined: `chat_${data.roomId}` };
    }
  }

  @SubscribeMessage('joinBooking')
  handleJoinBooking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    if (data?.orderId) {
      client.join(`booking_${data.orderId}`);
      this.logger.log(
        `Client ${client.id} joined booking room booking_${data.orderId}`,
      );
      return { status: 'success', joined: `booking_${data.orderId}` };
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { roomId: string; content: string; contentType?: string },
  ) {
    const user = client.data.user;
    if (!user) {
      return { status: 'error', message: 'Unauthorized' };
    }

    try {
      // Proxy the message to the communication microservice DB via HTTP
      const response = await axios.post(
        `${this.internalUrl}/chat/rooms/${data.roomId}/messages`,
        {
          content: data.content,
          contentType: data.contentType || 'TEXT',
        },
        {
          headers: {
            'x-user-id': user.userId,
            'x-user-role': user.activePerspective || user.role || '',
            'content-type': 'application/json',
          },
        },
      );

      const savedMsg = response.data;
      const broadcastData = {
        id: savedMsg.messageId || Math.random().toString(),
        senderId: user.userId,
        content: data.content,
        contentType: data.contentType || 'TEXT',
        sentAt: savedMsg.sentAt || new Date().toISOString(),
      };

      // Broadcast to all clients in the room (including sender)
      this.server.to(`chat_${data.roomId}`).emit('newMessage', broadcastData);

      return { status: 'success', message: broadcastData };
    } catch (err: any) {
      this.logger.error(`Failed to send message: ${err.message}`);
      return { status: 'error', message: 'Failed to process message' };
    }
  }

  // Broadcaster helper for booking updates
  sendBookingUpdate(orderId: string, payload: any) {
    this.logger.log(`Broadcasting booking update for room booking_${orderId}`);
    this.server.to(`booking_${orderId}`).emit('bookingUpdate', payload);
  }

  // Broadcaster helper for direct user notifications (e.g., booking requests to owners)
  sendNotificationToUser(userId: string, event: string, payload: any) {
    this.logger.log(
      `Sending real-time notification to user_${userId} on event: ${event}`,
    );
    this.server.to(`user_${userId}`).emit(event, payload);
  }
}
