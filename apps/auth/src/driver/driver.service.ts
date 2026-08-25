import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { User } from '../entity/user.entity';
import { TrustedDriver, TrustStatus } from '../entity/trusted-driver.entity';
import { Role } from '../enum/role.enum';

@Injectable()
export class DriverService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TrustedDriver)
    private readonly trustedDriverRepository: Repository<TrustedDriver>,
  ) {}

  async checkTrustedDriver(ownerId: string, driverId: string): Promise<boolean> {
    const trust = await this.trustedDriverRepository.findOne({
      where: { ownerId, driverId, status: TrustStatus.ACCEPTED },
    });
    return !!trust;
  }

  async searchDriver(query: string): Promise<User[]> {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }
    const qb = this.userRepository.createQueryBuilder('user');
    qb.where(':role = ANY(user.roles)', { role: Role.DRIVER });
    qb.andWhere('(user.mobile ILIKE :q OR user.name ILIKE :q)', {
      q: `%${query}%`,
    });
    return qb.getMany();
  }

  async inviteDriver(ownerId: string, driverId: string): Promise<TrustedDriver> {
    if (ownerId === driverId) {
      throw new BadRequestException('You cannot invite yourself as a trusted driver.');
    }

    const driver = await this.userRepository.findOne({ where: { id: driverId } });
    if (!driver) {
      throw new BadRequestException('Driver not found');
    }

    if (!driver.roles.includes(Role.DRIVER)) {
      throw new BadRequestException('Target user is not a driver');
    }

    const existing = await this.trustedDriverRepository.findOne({
      where: { ownerId, driverId },
    });

    if (existing) {
      if (existing.status === TrustStatus.ACCEPTED) {
        throw new BadRequestException('Driver is already in your trusted drivers list.');
      }
      if (existing.status === TrustStatus.PENDING) {
        throw new BadRequestException('An invitation to this driver is already pending.');
      }
      existing.status = TrustStatus.PENDING;
      return this.trustedDriverRepository.save(existing);
    }

    const invitation = this.trustedDriverRepository.create({
      ownerId,
      driverId,
      status: TrustStatus.PENDING,
    });

    return this.trustedDriverRepository.save(invitation);
  }

  async listInvitations(userId: string, type: 'sent' | 'received'): Promise<any[]> {
    const list = await this.trustedDriverRepository.find({
      where: type === 'sent' ? { ownerId: userId } : { driverId: userId },
      order: { createdAt: 'DESC' },
    });

    if (list.length === 0) return [];

    const targetIds = list.map((item) => (type === 'sent' ? item.driverId : item.ownerId));
    const users = await this.userRepository.find({
      where: { id: In(targetIds) },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return list.map((item) => {
      const targetUser = userMap.get(type === 'sent' ? item.driverId : item.ownerId);
      return {
        id: item.id,
        ownerId: item.ownerId,
        driverId: item.driverId,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        targetUser: targetUser
          ? {
              id: targetUser.id,
              name: targetUser.name,
              mobile: targetUser.mobile,
              profilePicture: targetUser.profilePicture,
              rating: targetUser.rating,
              email: targetUser.email,
            }
          : null,
      };
    });
  }

  async respondToInvitation(driverId: string, invitationId: string, status: TrustStatus): Promise<TrustedDriver> {
    if (status !== TrustStatus.ACCEPTED && status !== TrustStatus.REJECTED) {
      throw new BadRequestException('Invalid response status. Must be ACCEPTED or REJECTED.');
    }

    const invitation = await this.trustedDriverRepository.findOne({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new BadRequestException('Invitation not found');
    }

    if (invitation.driverId !== driverId) {
      throw new BadRequestException('This invitation was not sent to you.');
    }

    if (invitation.status !== TrustStatus.PENDING) {
      throw new BadRequestException('This invitation has already been processed.');
    }

    invitation.status = status;
    return this.trustedDriverRepository.save(invitation);
  }

  async getMyTrustedDrivers(ownerId: string): Promise<{ trustedDrivers: any[]; total: number }> {
    const list = await this.trustedDriverRepository.find({
      where: { ownerId, status: TrustStatus.ACCEPTED },
      order: { createdAt: 'DESC' },
    });
    if (list.length === 0) return { trustedDrivers: [], total: 0 };
    const driverIds = list.map((item) => item.driverId);
    const drivers = await this.userRepository.find({
      where: { id: In(driverIds) },
    });
    const driverMap = new Map(drivers.map((d) => [d.id, d]));
    const result = list.map((item) => {
      const d = driverMap.get(item.driverId);
      return {
        id: item.driverId,
        name: d?.name || 'Driver',
        mobile: d?.mobile || '',
        profilePicture: d?.profilePicture || '',
        licenseNumber: d?.driverLicenseNumber || '',
        rating: d?.rating || 0.0,
        totalTrips: 0,
        kycStatus: 'VERIFIED',
        addedAt: item.createdAt.toISOString(),
      };
    });
    return { trustedDrivers: result, total: result.length };
  }

  async removeTrustedDriver(ownerId: string, driverId: string): Promise<{ message: string }> {
    await this.trustedDriverRepository.delete({ ownerId, driverId });
    return { message: 'Driver removed from your trusted pool.' };
  }
}
