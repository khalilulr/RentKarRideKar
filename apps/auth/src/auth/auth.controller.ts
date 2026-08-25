import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { toGrpcUser } from '../mappers/user-grpc.mapper';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'SendOtp')
  async sendOtp(request: any): Promise<any> {
    return this.authService.sendOtp(request);
  }

  @GrpcMethod('AuthService', 'VerifyOtp')
  async verifyOtp(request: any): Promise<any> {
    const { mobile, otp, ipAddress, userAgent } = request;
    const result = await this.authService.verifyOtp({ mobile, otp }, ipAddress, userAgent);
    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(request: any): Promise<any> {
    const { refreshToken, ipAddress, userAgent } = request;
    const result = await this.authService.refreshToken(refreshToken, ipAddress, userAgent);
    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'Logout')
  async logout(request: any): Promise<any> {
    const { userId, jti, tokenExp, refreshToken } = request;
    await this.authService.logout(userId, jti, Number(tokenExp), refreshToken);
    return { message: 'Logged out successfully' };
  }

  @GrpcMethod('AuthService', 'LogoutAllDevices')
  async logoutAllDevices(request: any): Promise<any> {
    return this.authService.logoutAllDevices(request.userId);
  }

  @GrpcMethod('AuthService', 'LoginAdmin')
  async loginAdmin(request: any): Promise<any> {
    const { email, password, ipAddress, userAgent } = request;
    const result = await this.authService.loginAdmin(email, password, ipAddress, userAgent);
    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'CreateDemoAdmin')
  async createDemoAdmin(request: any): Promise<any> {
    const { email, password, ipAddress, userAgent } = request;
    const result = await this.authService.createDemoAdmin(email, password, ipAddress, userAgent);
    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }
}
