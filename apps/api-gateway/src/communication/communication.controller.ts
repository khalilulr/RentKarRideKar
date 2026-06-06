import { Controller, All, Req, Res, UseGuards, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import axios from 'axios';

@Controller('communication')
export class CommunicationController {
  private readonly internalUrl = 'http://localhost:3003/communication';

  @All('call/webhook/twilio')
  async handleTwilioWebhook(@Req() req: Request, @Res() res: Response) {
    try {
      const response = await axios({
        method: req.method,
        url: `${this.internalUrl}/call/webhook/twilio`,
        data: req.body,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          ...(req.headers['x-twilio-signature'] ? { 'x-twilio-signature': req.headers['x-twilio-signature'] } : {}),
        },
      });
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || { message: 'Internal Twilio Webhook proxy error' };
      return res.status(status).json(data);
    }
  }

  @All('*')
  @UseGuards(JwtAuthGuard)
  async proxyRequest(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: any,
  ) {
    const targetPath = req.params[0] || '';
    const targetUrl = `${this.internalUrl}/${targetPath}`;

    try {
      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        params: req.query,
        headers: {
          'x-user-id': user.userId,
          'x-user-role': user.activePerspective || user.role || '',
          'content-type': req.headers['content-type'] || 'application/json',
        },
      });
      return res.status(response.status).json(response.data);
    } catch (error: any) {
      const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const data = error.response?.data || { message: 'Internal proxy error' };
      return res.status(status).json(data);
    }
  }
}
