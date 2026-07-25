import {
  Role as GrpcRole,
  User as GrpcUser,
} from '../../../../libs/types/auth-service';
import { User } from '../entity/user.entity';
import { Role } from '../enum/role.enum';

function roleToGrpc(role: Role): GrpcRole | undefined {
  return GrpcRole[role as keyof typeof GrpcRole];
}

export function toGrpcUser(user: User): GrpcUser {
  const isOwner = (user.roles ?? []).includes(Role.VEHICLE_OWNER);
  return {
    id: user.id,
    mobile: user.mobile ?? '',
    name: user.name ?? '',
    roles: (user.roles ?? [])
      .map(roleToGrpc)
      .filter((r): r is GrpcRole => r !== undefined),
    activePerspective: user.activePerspective
      ? roleToGrpc(user.activePerspective)
      : (undefined as any),
    isActive: user.isActive,
    profilePicture: user.profilePicture ?? '',
    email: user.email ?? undefined,
    createdAt: user.createdAt?.toString() ?? '',
    updatedAt: user.updatedAt?.toString() ?? '',
    bankAccountNumber: isOwner ? user.bankAccountNumber : undefined,
    bankAccountHolderName: isOwner ? user.bankAccountHolderName : undefined,
    bankName: isOwner ? user.bankName : undefined,
    bankIfscCode: isOwner ? user.bankIfscCode : undefined,
    emergencyContactNumber: user.emergencyContactNumber ?? undefined,
    emergencyContactRelation: user.emergencyContactRelation ?? undefined,
  };
}
