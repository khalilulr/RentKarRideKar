import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Res,
  Ip,
  Headers,
  Req,
  UnauthorizedException
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';
import type { Response, Request } from 'express';

@Controller('auth')
@UseInterceptors(TransformInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    const result = await this.authService.sendOtp(sendOtpDto);
    return {
      message: 'OTP sent successfully',
      result,
    };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.authService.verifyOtp(verifyOtpDto, ip, userAgent);

    // Set Refresh Token as an HTTP-Only Cookie
    res.cookie('refreshToken', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      user: result.user,
      accessToken: result.access_token,
    };
  }

  /**
   * Refresh Token Endpoint
   * Reads the HTTP-Only cookie and issues a new Access & Refresh Token pair
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response
  ) {
    // Note: Ensure you have `cookie-parser` installed and configured in your main.ts
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is missing');
    }

    const result = await this.authService.refreshToken(refreshToken, ip, userAgent);

    // Set the new rotated Refresh Token
    res.cookie('refreshToken', result.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      user: result.user,
      accessToken: result.access_token,
    };
  }
}