import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AdminService } from './admin.service';
import { toGrpcUser } from '../mappers/user-grpc.mapper';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @GrpcMethod('AuthService', 'AdminGetUsers')
  async adminGetUsers(request: any): Promise<any> {
    const res = await this.adminService.adminGetUsers(
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
    return this.adminService.adminUpdateUserStatus(
      request.userId,
      request.action,
      request.reason,
    );
  }

  @GrpcMethod('AuthService', 'ListUsersByRole')
  async listUsersByRole(request: { role: string }): Promise<any> {
    const users = await this.adminService.listUsersByRole(request.role);
    return { users: users.map(toGrpcUser) };
  }
}
