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
  Req
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';
import type { Response } from 'express';
import { User } from './entity/user.entity';

@Controller('auth')
@UseInterceptors(TransformInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  /**
   * Request an OTP to be sent to a mobile number.
   * Uses 200 OK because we are triggering an action, not creating a persistent resource yet.
   */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    const result = await this.authService.sendOtp(sendOtpDto);
    return {
      message: 'OTP sent successfully',
      result,
    };
  }

  /**
   * Verify the OTP and establish a session.
   * Returns Access & Refresh tokens.
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response
  ) {
    const result: {
      user: User;
      refresh_token: string;
      access_token: string;
    } = await this.authService.verifyOtp(verifyOtpDto, ip, userAgent);

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