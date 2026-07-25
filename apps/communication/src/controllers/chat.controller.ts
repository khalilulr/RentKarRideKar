import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { CommunicationService } from '../communication.service';

@Controller('communication/chat')
export class ChatController {
  constructor(private readonly commsService: CommunicationService) {}

  @Get('rooms')
  async listRooms(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') role: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    return this.commsService.listRooms(userId, role || '');
  }

  @Get('rooms/:roomId/messages')
  async getMessages(
    @Param('roomId') roomId: string,
    @Headers('x-user-id') userId: string,
    @Query('limit') limit?: string,
    @Query('before') beforeMessageId?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    const limitNum = limit ? parseInt(limit, 10) : 50;
    return this.commsService.getMessages(
      roomId,
      userId,
      limitNum,
      beforeMessageId,
    );
  }

  @Post('rooms/:roomId/messages')
  async sendMessage(
    @Param('roomId') roomId: string,
    @Headers('x-user-id') userId: string,
    @Body('content') content: string,
    @Body('contentType') contentType?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    if (!content) {
      throw new BadRequestException('Message content is required');
    }
    return this.commsService.sendMessage(
      roomId,
      userId,
      content,
      contentType || 'text',
    );
  }

  @Patch('rooms/:roomId/messages/read')
  async markAsRead(
    @Param('roomId') roomId: string,
    @Headers('x-user-id') userId: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    return this.commsService.markAsRead(roomId, userId);
  }
}
