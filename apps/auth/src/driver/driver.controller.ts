import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { DriverService } from './driver.service';
import { toGrpcUser } from '../mappers/user-grpc.mapper';

@Controller()
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @GrpcMethod('AuthService', 'CheckTrustedDriver')
  async checkTrustedDriver(request: any): Promise<any> {
    const isTrusted = await this.driverService.checkTrustedDriver(request.ownerId, request.driverId);
    return { isTrusted };
  }

  @GrpcMethod('AuthService', 'SearchDriver')
  async searchDriver(request: any): Promise<any> {
    const drivers = await this.driverService.searchDriver(request.query);
    return { drivers: drivers.map(toGrpcUser) };
  }

  @GrpcMethod('AuthService', 'InviteDriver')
  async inviteDriver(request: any): Promise<any> {
    const res = await this.driverService.inviteDriver(request.ownerId, request.driverId);
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
  async listInvitations(request: any): Promise<any> {
    const invitations = await this.driverService.listInvitations(request.userId, request.type);
    return {
      invitations: invitations.map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        driverId: item.driverId,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        targetUser: item.targetUser ? {
          ...toGrpcUser(item.targetUser as any),
          email: item.targetUser.email || undefined,
        } : undefined,
      })),
    };
  }

  @GrpcMethod('AuthService', 'RespondToInvitation')
  async respondToInvitation(request: any): Promise<any> {
    const res = await this.driverService.respondToInvitation(request.driverId, request.invitationId, request.status);
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

  @GrpcMethod('AuthService', 'GetMyTrustedDrivers')
  async getMyTrustedDrivers(request: any): Promise<any> {
    const res = await this.driverService.getMyTrustedDrivers(request.ownerId);
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
    return this.driverService.removeTrustedDriver(request.ownerId, request.driverId);
  }
}
