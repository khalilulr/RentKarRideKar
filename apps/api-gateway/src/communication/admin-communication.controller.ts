import {
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import axios from 'axios';

@Controller('communication/admin')
export class AdminCommunicationController {
  private readonly internalUrl =
    process.env.COMMUNICATION_SERVICE_URL ||
    'http://communication-service:3003/communication';

  @Post('send-notification')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async sendAdminNotification(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await axios.post(
        `${this.internalUrl}/notifications/admin/send`,
        req.body,
      );
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || {
        message: 'Failed to send admin notification',
      };
      return res.status(status).json(data);
    }
  }
}
