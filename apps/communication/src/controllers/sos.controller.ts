import { Controller, Post, Get, Patch, Param, Body, Headers, BadRequestException } from '@nestjs/common';
import { CommunicationService } from '../communication.service';

@Controller('communication/sos')
export class SosController {
  constructor(private readonly commsService: CommunicationService) {}

  @Post()
  async triggerSos(
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') role: string,
    @Body('bookingId') bookingId: string,
    @Body('latitude') latitude: number,
    @Body('longitude') longitude: number,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    if (!bookingId) {
      throw new BadRequestException('bookingId is required');
    }
    return this.commsService.triggerSos(
      bookingId,
      userId,
      role || 'passenger',
      latitude,
      longitude,
    );
  }

  @Get(':sosId')
  async getSos(@Param('sosId') sosId: string) {
    return this.commsService.getSos(sosId);
  }

  @Patch(':sosId/resolve')
  async resolveSos(
    @Param('sosId') sosId: string,
    @Headers('x-user-id') userId: string,
    @Body('notes') notes?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('Missing x-user-id header');
    }
    return this.commsService.resolveSos(sosId, userId, notes);
  }
}
