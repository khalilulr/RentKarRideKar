import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: /^\/trips\/[a-fA-F0-9-]+$/,
  cors: {
    origin: '*',
  },
})
@Injectable()
export class TripsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TripsGateway.name);

  @WebSocketServer()
  server: Namespace;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.split(' ')[1] ||
        client.handshake.query?.token;

      if (!token) {
        this.logger.warn(
          `[TripsGateway] Connection attempt without token on namespace: ${client.nsp.name}`,
        );
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      client.data.user = payload;
      this.logger.log(
        `[TripsGateway] Client connected: ${client.id} to namespace: ${client.nsp.name} (User: ${payload.userId})`,
      );
    } catch (err: any) {
      this.logger.warn(
        `[TripsGateway] Auth failed on namespace ${client.nsp.name}: ${err.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `[TripsGateway] Client disconnected: ${client.id} from ${client.nsp.name}`,
    );
  }

  @SubscribeMessage('driverLocation')
  handleDriverLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lat: number; lng: number },
  ) {
    // Relay location payload to all other clients connected to the same dynamic trip namespace (the rider)
    client.broadcast.emit('locationUpdate', {
      type: 'DRIVER_LOCATION',
      lat: Number(data.lat),
      lng: Number(data.lng),
    });
    this.logger.debug(
      `[TripsGateway] Relayed location ping on ${client.nsp.name}: ${data.lat}, ${data.lng}`,
    );
  }

  // Emits a trip started event to all clients on a dynamic trip namespace
  broadcastTripStarted(
    tripId: string,
    orderId: string,
    polyline: string,
    etaMinutes: number,
  ) {
    const namespaces = [`/trips/${tripId}`];
    if (orderId && orderId !== tripId) {
      namespaces.push(`/trips/${orderId}`);
    }

    for (const nspName of namespaces) {
      this.logger.log(
        `[TripsGateway] Broadcasting TRIP_STARTED to namespace: ${nspName}`,
      );
      const nsp = this.server.server.of(nspName);
      if (nsp) {
        nsp.emit('locationUpdate', {
          type: 'TRIP_STARTED',
          polyline,
          etaMinutes,
        });
        nsp.emit('tripStarted', {
          type: 'TRIP_STARTED',
          polyline,
          etaMinutes,
        });
      }
    }
  }

  // Disconnects all clients connected to a trip namespace upon completion or cancellation
  closeTripNamespace(tripId: string, orderId?: string) {
    const namespaces = [`/trips/${tripId}`];
    if (orderId && orderId !== tripId) {
      namespaces.push(`/trips/${orderId}`);
    }

    for (const nspName of namespaces) {
      this.logger.log(`[TripsGateway] Closing trip namespace: ${nspName}`);
      const nsp = this.server.server.of(nspName);
      if (nsp) {
        nsp.disconnectSockets(true);
      }
    }
  }

  broadcastDriverLocation(
    tripId: string,
    orderId: string,
    lat: number,
    lng: number,
  ) {
    const namespaces = [`/trips/${tripId}`];
    if (orderId && orderId !== tripId) {
      namespaces.push(`/trips/${orderId}`);
    }

    for (const nspName of namespaces) {
      const nsp = this.server.server.of(nspName);
      if (nsp) {
        nsp.emit('locationUpdate', {
          type: 'DRIVER_LOCATION',
          lat: Number(lat),
          lng: Number(lng),
        });
      }
    }
  }
}
