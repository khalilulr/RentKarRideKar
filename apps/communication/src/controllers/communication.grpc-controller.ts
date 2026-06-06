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
}
