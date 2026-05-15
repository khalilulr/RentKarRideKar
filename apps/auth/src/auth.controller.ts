import {
  Controller,
  Inject,
  UseInterceptors,
} from '@nestjs/common';
import {  GrpcMethod } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';

import { AuthService } from './auth.service';
import { toGrpcUser } from './mappers/user-grpc.mapper';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';
import { AuthServiceControllerMethods } from '../../../libs/types/auth-service'
import type {
  AuthServiceController,
  SendOtpRequest,
  VerifyOtpRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllDevicesRequest,
  GetMeRequest,
  UpdateMeRequest,
  SwitchPerspectiveRequest,
  AuthResponse,
  MessageResponse,
  GetMeResponse,
  UpdateMeResponse,
} from '../../../libs/types/auth-service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller()
@AuthServiceControllerMethods()
// @UseInterceptors(TransformInterceptor)
export class AuthController implements AuthServiceController {
  constructor(
    private  authService: AuthService) { }

  // ── Public methods ─────────────────────────────────────────────────────────

  @GrpcMethod('AuthService', 'SendOtp')
  async sendOtp(request: SendOtpRequest): Promise<MessageResponse> {
    return this.authService.sendOtp(request);
  }

  @GrpcMethod('AuthService', 'VerifyOtp')
  async verifyOtp(request: VerifyOtpRequest): Promise<AuthResponse> {
    const { mobile, otp, ipAddress, userAgent } = request;
    const result = await this.authService.verifyOtp({ mobile, otp }, ipAddress, userAgent);

    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    const { refreshToken, ipAddress, userAgent } = request;
    const result = await this.authService.refreshToken(refreshToken, ipAddress, userAgent);

    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  // ── Protected methods ──────────────────────────────────────────────────────

  @GrpcMethod('AuthService', 'Logout')
  async logout(request: LogoutRequest): Promise<MessageResponse> {
    const { userId, jti, tokenExp, refreshToken } = request;
    await this.authService.logout(userId, jti, Number(tokenExp), refreshToken);
    return { message: 'Logged out successfully' };
  }

  @GrpcMethod('AuthService', 'LogoutAllDevices')
  async logoutAllDevices(request: LogoutAllDevicesRequest): Promise<MessageResponse> {
    return this.authService.logoutAllDevices(request.userId);
  }

  @GrpcMethod('AuthService', 'GetMe')
  async getMe(request: GetMeRequest): Promise<GetMeResponse> {
    const user = await this.authService.getMe(request.userId);
    return { user: toGrpcUser(user) };
  }

  @GrpcMethod('AuthService', 'UpdateMe')
  async updateMe(request: UpdateMeRequest): Promise<UpdateMeResponse> {
    const { userId, name, profileImage, roles, activePerspective } = request;
    const result = await this.authService.updateMe(userId, {
      name,
      profilePicture: profileImage,
      roles,
      activePerspective,
    });


    return {
      message: 'User updated successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }

  @GrpcMethod('AuthService', 'SwitchPerspective')
  async switchPerspective(request: SwitchPerspectiveRequest): Promise<UpdateMeResponse> {
    const { userId, perspective } = request;
    const result = await this.authService.switchPerspective({ userId, perspective });

    return {
      message: 'Perspective switched successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }
}