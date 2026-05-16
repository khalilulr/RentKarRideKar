import { Role as GrpcRole, User as GrpcUser } from '../../../../libs/types/auth-service';
import { User } from '../entity/user.entity';
import { Role } from '../enum/role.enum';

function roleToGrpc(role: Role): GrpcRole {
  return GrpcRole[role as keyof typeof GrpcRole] ?? GrpcRole.PASSENGER;
}

export function toGrpcUser(user: User): GrpcUser {
  return {
    id: user.id,
    mobile: user.mobile,
    name: user.name ?? '',
    roles: (user.roles ?? []).map(roleToGrpc),
    activePerspective: roleToGrpc(user.activePerspective),
    isActive: user.isActive,
    profilePicture: user.profilePicture ?? '',
    createdAt: user.createdAt?.toString() ?? '',
    updatedAt: user.updatedAt?.toString() ?? '',
  };
}
