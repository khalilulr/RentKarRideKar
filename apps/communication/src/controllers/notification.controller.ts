import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { CommunicationService } from '../communication.service';

@Controller('communication/notifications')
export class NotificationController {
  constructor(private readonly commsService: CommunicationService) {}

  @Post('admin/send')
  async sendAdminNotification(@Body() body: any) {
    const { userId, group, title, content, channel } = body;
    if (!userId && !group) {
      throw new BadRequestException('Either userId or group must be specified');
    }
    if (!title || !content || !channel) {
      throw new BadRequestException('title, content, and channel are required');
    }
    return this.commsService.sendAdminNotification({
      userId,
      group,
      title,
      content,
      channel,
    });
  }

  @Get()
  async getNotifications(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    const res = await this.commsService.getNotifications(userId);
    return res;
  }
}
