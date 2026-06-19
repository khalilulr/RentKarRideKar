import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CommunicationService } from '../communication.service';
import { COMMUNICATION_SERVICE_NAME } from '../../../../libs/types/communication';

@Controller()
export class CommunicationGrpcController {
  constructor(private readonly commsService: CommunicationService) {}

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'OpenChatRooms')
  async openChatRooms(data: { bookingId: string; passengerId: string; driverId: string; ownerId: string }) {
    return this.commsService.openChatRooms(
      data.bookingId,
      data.passengerId,
      data.driverId,
      data.ownerId,
    );
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'ActivateCallProxy')
  async activateCallProxy(data: { bookingId: string; passengerId: string; driverId: string; ownerId: string }) {
    return this.commsService.activateCallProxy(
      data.bookingId,
      data.passengerId,
      data.driverId,
      data.ownerId,
    );
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'DeactivateCallProxy')
  async deactivateCallProxy(data: { bookingId: string; reason: string }) {
    return this.commsService.deactivateCallProxy(data.bookingId, data.reason);
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'CloseChatRooms')
  async closeChatRooms(data: { bookingId: string }) {
    return this.commsService.closeChatRooms(data.bookingId);
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'ArchiveChatRooms')
  async archiveChatRooms(data: { bookingId: string }) {
    return this.commsService.archiveChatRooms(data.bookingId);
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'VerifyChatAccess')
  async verifyChatAccess(data: { roomId: string; userId: string }) {
    return this.commsService.verifyChatAccess(data.roomId, data.userId);
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'SendNotification')
  async sendNotification(data: {
    userId: string;
    title: string;
    content: string;
    channel: string;
    delayMinutes: number;
    externalId?: string;
  }) {
    return this.commsService.sendNotification(
      data.userId,
      data.title,
      data.content,
      data.channel,
      data.delayMinutes,
      data.externalId,
    );
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'CancelNotification')
  async cancelNotification(data: { externalId: string }) {
    return this.commsService.cancelNotification(data.externalId);
  }

  @GrpcMethod(COMMUNICATION_SERVICE_NAME, 'GetNotifications')
  async getNotifications(data: { userId: string }) {
    const res = await this.commsService.getNotifications(data.userId);
    return {
      notifications: res.notifications.map((n: any) => ({
        id: n.id,
        userId: n.userId,
        title: n.title,
        content: n.content,
        channel: n.channel,
        status: n.status,
        scheduledAt: n.scheduledAt ? n.scheduledAt.toISOString() : '',
        sentAt: n.sentAt ? n.sentAt.toISOString() : '',
        createdAt: n.createdAt ? n.createdAt.toISOString() : '',
        externalId: n.externalId || '',
      })),
    };
  }
}
