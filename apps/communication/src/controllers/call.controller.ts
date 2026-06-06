import { Controller, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { CommunicationService } from '../communication.service';

@Controller('communication/call')
export class CallController {
  constructor(private readonly commsService: CommunicationService) {}

  @Post('initiate')
  async initiateCall(
    @Headers('x-user-id') userId: string,
    @Body('bookingId') bookingId: string,
    @Body('callTo') callTo: string, // 'driver' | 'owner'
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    if (!bookingId) {
      throw new BadRequestException('bookingId is required');
    }
    if (!callTo) {
      throw new BadRequestException('callTo is required ("driver" or "owner")');
    }
    return this.commsService.initiateCall(bookingId, userId, callTo);
  }

  @Post('end')
  async endCall(@Body('callSessionId') callSessionId: string) {
    if (!callSessionId) {
      throw new BadRequestException('callSessionId is required');
    }
    return this.commsService.endCall(callSessionId);
  }

  @Post('webhook/twilio')
  async handleTwilioWebhook(@Body() body: any) {
    return this.commsService.handleTwilioWebhook(body);
  }
}
