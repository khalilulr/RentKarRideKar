import { Controller, Inject, UseInterceptors } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { ClientGrpc } from '@nestjs/microservices';

import { AuthService } from './auth.service';
import { toGrpcUser } from './mappers/user-grpc.mapper';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';
import { AuthServiceControllerMethods } from '../../../libs/types/auth-service';
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
  LoginAdminRequest,
  CreateDemoAdminRequest,
  CheckTrustedDriverRequest,
  CheckTrustedDriverResponse,
  SearchDriverRequest,
  SearchDriverResponse,
  InviteDriverRequest,
  TrustedDriverResponse,
  ListInvitationsRequest,
  ListInvitationsResponse,
  RespondToInvitationRequest,
} from '../../../libs/types/auth-service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller()
@AuthServiceControllerMethods()
// @UseInterceptors(TransformInterceptor)
export class AuthController implements AuthServiceController {
  constructor(private authService: AuthService) {}

  // ── Public methods ─────────────────────────────────────────────────────────

  @GrpcMethod('AuthService', 'SendOtp')
  async sendOtp(request: SendOtpRequest): Promise<MessageResponse> {
    return this.authService.sendOtp(request);
  }

  @GrpcMethod('AuthService', 'VerifyOtp')
  async verifyOtp(request: VerifyOtpRequest): Promise<AuthResponse> {
    const { mobile, otp, ipAddress, userAgent } = request;
    const result = await this.authService.verifyOtp(
      { mobile, otp },
      ipAddress,
      userAgent,
    );

    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'RefreshToken')
  async refreshToken(request: RefreshTokenRequest): Promise<AuthResponse> {
    const { refreshToken, ipAddress, userAgent } = request;
    const result = await this.authService.refreshToken(
      refreshToken,
      ipAddress,
      userAgent,
    );

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
  async logoutAllDevices(
    request: LogoutAllDevicesRequest,
  ): Promise<MessageResponse> {
    return this.authService.logoutAllDevices(request.userId);
  }

  @GrpcMethod('AuthService', 'GetMe')
  async getMe(request: GetMeRequest): Promise<GetMeResponse> {
    const user = await this.authService.getMe(request.userId);
    return { user: toGrpcUser(user) };
  }

  @GrpcMethod('AuthService', 'UpdateMe')
  async updateMe(request: UpdateMeRequest): Promise<UpdateMeResponse> {
    console.log(
      '[MICROSERVICE updateMe] raw request:',
      JSON.stringify(request),
    );
    const {
      userId,
      name,
      profileImage,
      roles,
      activePerspective,
      bankAccountNumber,
      bankAccountHolderName,
      bankName,
      bankIfscCode,
    } = request;
    console.log('[MICROSERVICE updateMe] roles:', roles, 'type:', typeof roles);

    const result = await this.authService.updateMe(userId, {
      name,
      profilePicture: profileImage,
      roles,
      activePerspective,
      bankAccountNumber,
      bankAccountHolderName,
      bankName,
      bankIfscCode,
    });
    return {
      message: 'User updated successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }

  @GrpcMethod('AuthService', 'SwitchPerspective')
  async switchPerspective(
    request: SwitchPerspectiveRequest,
  ): Promise<UpdateMeResponse> {
    const { userId, perspective } = request;
    const result = await this.authService.switchPerspective({
      userId,
      perspective,
    });

    return {
      message: 'Perspective switched successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }

  @GrpcMethod('AuthService', 'LoginAdmin')
  async loginAdmin(request: LoginAdminRequest): Promise<AuthResponse> {
    const { email, password, ipAddress, userAgent } = request;
    const result = await this.authService.loginAdmin(
      email,
      password,
      ipAddress,
      userAgent,
    );

    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'CreateDemoAdmin')
  async createDemoAdmin(
    request: CreateDemoAdminRequest,
  ): Promise<AuthResponse> {
    const { email, password, ipAddress, userAgent } = request;
    const result = await this.authService.createDemoAdmin(
      email,
      password,
      ipAddress,
      userAgent,
    );

    return {
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
    };
  }

  @GrpcMethod('AuthService', 'CheckTrustedDriver')
  async checkTrustedDriver(
    request: CheckTrustedDriverRequest,
  ): Promise<CheckTrustedDriverResponse> {
    const { ownerId, driverId } = request;
    const isTrusted = await this.authService.checkTrustedDriver(
      ownerId,
      driverId,
    );
    return { isTrusted };
  }

  @GrpcMethod('AuthService', 'SearchDriver')
  async searchDriver(
    request: SearchDriverRequest,
  ): Promise<SearchDriverResponse> {
    const drivers = await this.authService.searchDriver(request.query);
    return { drivers: drivers.map(toGrpcUser) };
  }

  @GrpcMethod('AuthService', 'InviteDriver')
  async inviteDriver(
    request: InviteDriverRequest,
  ): Promise<TrustedDriverResponse> {
    const { ownerId, driverId } = request;
    const res = await this.authService.inviteDriver(ownerId, driverId);
    return {
      id: res.id,
      ownerId: res.ownerId,
      driverId: res.driverId,
      status: res.status,
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
      targetUser: undefined,
    };
  }

  @GrpcMethod('AuthService', 'ListInvitations')
  async listInvitations(
    request: ListInvitationsRequest,
  ): Promise<ListInvitationsResponse> {
    const { userId, type } = request;
    const invitations = await this.authService.listInvitations(
      userId,
      type as any,
    );
    return {
      invitations: invitations.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        driverId: item.driverId,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        targetUser: item.targetUser
          ? {
              ...toGrpcUser(item.targetUser),
              email: item.targetUser.email || undefined,
            }
          : undefined,
      })),
    };
  }

  @GrpcMethod('AuthService', 'RespondToInvitation')
  async respondToInvitation(
    request: RespondToInvitationRequest,
  ): Promise<TrustedDriverResponse> {
    const { driverId, invitationId, status } = request;
    const res = await this.authService.respondToInvitation(
      driverId,
      invitationId,
      status as any,
    );
    return {
      id: res.id,
      ownerId: res.ownerId,
      driverId: res.driverId,
      status: res.status,
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
      targetUser: undefined,
    };
  }

  @GrpcMethod('AuthService', 'ListUsersByRole')
  async listUsersByRole(request: { role: string }): Promise<any> {
    const users = await this.authService.listUsersByRole(request.role);
    return { users: users.map(toGrpcUser) };
  }

  @GrpcMethod('AuthService', 'GetMyTrustedDrivers')
  async getMyTrustedDrivers(request: any): Promise<any> {
    const res = await this.authService.getMyTrustedDrivers(request.ownerId);
    return {
      trustedDrivers: res.trustedDrivers.map((d) => ({
        id: d.id,
        name: d.name,
        mobile: d.mobile,
        profilePicture: d.profilePicture,
        licenseNumber: d.licenseNumber,
        rating: d.rating,
        totalTrips: d.totalTrips,
        kycStatus: d.kycStatus,
        addedAt: d.addedAt,
      })),
      total: res.total,
    };
  }

  @GrpcMethod('AuthService', 'RemoveTrustedDriver')
  async removeTrustedDriver(request: any): Promise<any> {
    return this.authService.removeTrustedDriver(
      request.ownerId,
      request.driverId,
    );
  }

  @GrpcMethod('AuthService', 'SaveAddress')
  async saveAddress(request: any): Promise<any> {
    const res = await this.authService.saveAddress(
      request.userId,
      request.label,
      request.type,
      request.address,
      request.lat,
      request.lng,
    );
    return {
      addressId: res.id,
      label: res.label,
      type: res.type,
      address: res.address,
      lat: parseFloat(res.lat.toString()),
      lng: parseFloat(res.lng.toString()),
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
    };
  }

  @GrpcMethod('AuthService', 'GetAddresses')
  async getAddresses(request: any): Promise<any> {
    const list = await this.authService.getAddresses(request.userId);
    return {
      addresses: list.map((res) => ({
        addressId: res.id,
        label: res.label,
        type: res.type,
        address: res.address,
        lat: parseFloat(res.lat.toString()),
        lng: parseFloat(res.lng.toString()),
        createdAt: res.createdAt.toISOString(),
        updatedAt: res.updatedAt.toISOString(),
      })),
    };
  }

  @GrpcMethod('AuthService', 'UpdateAddress')
  async updateAddress(request: any): Promise<any> {
    const res = await this.authService.updateAddress(
      request.userId,
      request.addressId,
      request.label,
      request.address,
      request.lat,
      request.lng,
    );
    return {
      addressId: res.id,
      label: res.label,
      type: res.type,
      address: res.address,
      lat: parseFloat(res.lat.toString()),
      lng: parseFloat(res.lng.toString()),
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
    };
  }

  @GrpcMethod('AuthService', 'DeleteAddress')
  async deleteAddress(request: any): Promise<any> {
    return this.authService.deleteAddress(request.userId, request.addressId);
  }

  @GrpcMethod('AuthService', 'RegisterDeviceToken')
  async registerDeviceToken(request: any): Promise<any> {
    return this.authService.registerDeviceToken(
      request.userId,
      request.token,
      request.platform,
    );
  }

  @GrpcMethod('AuthService', 'RemoveDeviceToken')
  async removeDeviceToken(request: any): Promise<any> {
    return this.authService.removeDeviceToken(request.userId, request.token);
  }

  @GrpcMethod('AuthService', 'GetReferrals')
  async getReferrals(request: any): Promise<any> {
    return this.authService.getReferrals(request.userId);
  }

  @GrpcMethod('AuthService', 'ApplyReferral')
  async applyReferral(request: any): Promise<any> {
    return this.authService.applyReferral(request.userId, request.referralCode);
  }

  @GrpcMethod('AuthService', 'GetWallet')
  async getWallet(request: any): Promise<any> {
    return this.authService.getWallet(request.userId);
  }

  @GrpcMethod('AuthService', 'ValidateReferralCode')
  async validateReferralCode(request: any): Promise<any> {
    return this.authService.validateReferralCode(
      request.userId,
      request.referralCode,
    );
  }

  @GrpcMethod('AuthService', 'AdminGetUsers')
  async adminGetUsers(request: any): Promise<any> {
    const res = await this.authService.adminGetUsers(
      request.role,
      request.kycStatus,
      request.page,
      request.limit,
    );
    return {
      users: res.users.map(toGrpcUser),
      total: res.total,
    };
  }

  @GrpcMethod('AuthService', 'AdminUpdateUserStatus')
  async adminUpdateUserStatus(request: any): Promise<any> {
    return this.authService.adminUpdateUserStatus(
      request.userId,
      request.action,
      request.reason,
    );
  }
}
