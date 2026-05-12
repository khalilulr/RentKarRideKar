import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  Ip,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response, Request } from 'express';

import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { UpdateMeDto } from './dto/update-me.dto';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { Role } from './enum/role.enum';

// ─── Cookie helpers ──────────────────────────────────────────────────────────

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const REFRESH_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('auth')
@UseInterceptors(TransformInterceptor)
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // ── Public routes ──────────────────────────────────────────────────────────

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(sendOtpDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtp(verifyOtpDto, ip, userAgent);

    res.cookie('refreshToken', result.refresh_token, REFRESH_COOKIE_OPTIONS);

    return {
      user: result.user,
      accessToken: result.access_token,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Refresh token is missing');

    const result = await this.authService.refreshToken(refreshToken, ip, userAgent);

    res.cookie('refreshToken', result.refresh_token, REFRESH_COOKIE_OPTIONS);

    return {
      user: result.user,
      accessToken: result.access_token,
    };
  }

  // ── Protected routes ───────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) throw new UnauthorizedException('Refresh token is missing');

    // req.user is set by JwtAuthGuard from the decoded JWT payload
    // 'id' is the JTI (jwtid), 'exp' is the expiry Unix timestamp
    const { userId, id: jti, exp: tokenExp } = req.user;

    await this.authService.logout(userId, jti, tokenExp, refreshToken);

    res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);

    return { message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutFromAllDevices(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Use userId from decoded payload, NOT the raw token
    const { userId } = req.user;

    await this.authService.logoutAllDevices(userId);

    res.clearCookie('refreshToken', REFRESH_COOKIE_CLEAR_OPTIONS);

    return { message: 'Logged out from all devices successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@CurrentUser('userId') userId: string) {
    const user = await this.authService.getMe(userId);
    return { user };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(
    @CurrentUser('userId') userId: string,
    @Body() updateMeDto: UpdateMeDto,
  ) {
    const result = await this.authService.updateMe(userId, updateMeDto);
    return {
      message: 'User updated successfully',
      user: result.user,
      accessToken: result.access_token,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('switch-perspective')
  async switchPerspective(
    @CurrentUser('userId') userId: string,
    @Body() { perspective }: { perspective: Role },
  ) {
    const result = await this.authService.switchPerspective(userId, perspective);
    return {
      message: 'Perspective switched successfully',
      user: result.user,
      accessToken: result.access_token,
    };
  }
}