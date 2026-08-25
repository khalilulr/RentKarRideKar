import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { UserService } from './user.service';
import { toGrpcUser } from '../mappers/user-grpc.mapper';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @GrpcMethod('AuthService', 'GetMe')
  async getMe(request: any): Promise<any> {
    const user = await this.userService.getMe(request.userId);
    return { user: toGrpcUser(user) };
  }

  @GrpcMethod('AuthService', 'UpdateMe')
  async updateMe(request: any): Promise<any> {
    const {
      userId, name, profileImage, roles, activePerspective, bankAccountNumber,
      bankAccountHolderName, bankName, bankIfscCode,
    } = request;

    const result = await this.userService.updateMe(userId, {
      name, profilePicture: profileImage, roles, activePerspective,
      bankAccountNumber, bankAccountHolderName, bankName, bankIfscCode,
    });
    return {
      message: 'User updated successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }

  @GrpcMethod('AuthService', 'SwitchPerspective')
  async switchPerspective(request: any): Promise<any> {
    const result = await this.userService.switchPerspective(request);
    return {
      message: 'Perspective switched successfully',
      user: toGrpcUser(result.user),
      accessToken: result.access_token,
    };
  }

  @GrpcMethod('AuthService', 'SaveAddress')
  async saveAddress(request: any): Promise<any> {
    const res = await this.userService.saveAddress(request.userId, request.label, request.type, request.address, request.lat, request.lng);
    return {
      addressId: res.id, label: res.label, type: res.type, address: res.address,
      lat: parseFloat(res.lat.toString()), lng: parseFloat(res.lng.toString()),
      createdAt: res.createdAt.toISOString(), updatedAt: res.updatedAt.toISOString(),
    };
  }

  @GrpcMethod('AuthService', 'GetAddresses')
  async getAddresses(request: any): Promise<any> {
    const list = await this.userService.getAddresses(request.userId);
    return {
      addresses: list.map((res) => ({
        addressId: res.id, label: res.label, type: res.type, address: res.address,
        lat: parseFloat(res.lat.toString()), lng: parseFloat(res.lng.toString()),
        createdAt: res.createdAt.toISOString(), updatedAt: res.updatedAt.toISOString(),
      })),
    };
  }

  @GrpcMethod('AuthService', 'UpdateAddress')
  async updateAddress(request: any): Promise<any> {
    const res = await this.userService.updateAddress(request.userId, request.addressId, request.label, request.address, request.lat, request.lng);
    return {
      addressId: res.id, label: res.label, type: res.type, address: res.address,
      lat: parseFloat(res.lat.toString()), lng: parseFloat(res.lng.toString()),
      createdAt: res.createdAt.toISOString(), updatedAt: res.updatedAt.toISOString(),
    };
  }

  @GrpcMethod('AuthService', 'DeleteAddress')
  async deleteAddress(request: any): Promise<any> {
    return this.userService.deleteAddress(request.userId, request.addressId);
  }

  @GrpcMethod('AuthService', 'RegisterDeviceToken')
  async registerDeviceToken(request: any): Promise<any> {
    return this.userService.registerDeviceToken(request.userId, request.token, request.platform);
  }

  @GrpcMethod('AuthService', 'RemoveDeviceToken')
  async removeDeviceToken(request: any): Promise<any> {
    return this.userService.removeDeviceToken(request.userId, request.token);
  }

  @GrpcMethod('AuthService', 'GetReferrals')
  async getReferrals(request: any): Promise<any> {
    return this.userService.getReferrals(request.userId);
  }

  @GrpcMethod('AuthService', 'ApplyReferral')
  async applyReferral(request: any): Promise<any> {
    return this.userService.applyReferral(request.userId, request.referralCode);
  }

  @GrpcMethod('AuthService', 'GetWallet')
  async getWallet(request: any): Promise<any> {
    return this.userService.getWallet(request.userId);
  }

  @GrpcMethod('AuthService', 'ValidateReferralCode')
  async validateReferralCode(request: any): Promise<any> {
    return this.userService.validateReferralCode(request.userId, request.referralCode);
  }
}
