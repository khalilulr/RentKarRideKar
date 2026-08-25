import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { User } from '../entity/user.entity';
import { Address } from '../entity/address.entity';
import { DeviceToken } from '../entity/device-token.entity';
import { Role } from '../enum/role.enum';
import { AuthService } from '../auth/auth.service';

type UpdateMeInput = {
  name?: string;
  profilePicture?: string;
  roles?: string[];
  activePerspective?: string;
  bankAccountNumber?: string;
  bankAccountHolderName?: string;
  bankName?: string;
  bankIfscCode?: string;
  driverLicenseNumber?: string;
  driverExperienceYears?: number | string;
  ownerBusinessName?: string;
  ownerAddress?: string;
  emergencyContactNumber?: string;
  emergencyContactRelation?: string;
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly authService: AuthService,
  ) {}

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  private mapRole(role: unknown): Role | undefined {
    if (role === undefined || role === null) return undefined;
    if (typeof role === 'string') {
      const normalized = role.toUpperCase();
      if (normalized in Role) return normalized as Role;
      return undefined;
    }
    if (typeof role === 'number') {
      const mapping: Record<number, Role> = {
        0: Role.PASSENGER,
        1: Role.DRIVER,
        2: Role.ADMIN,
        3: Role.VEHICLE_OWNER,
      };
      return mapping[role];
    }
    return undefined;
  }

  private normalizeRoles(roles: string[] | undefined): string[] | undefined {
    if (!roles?.length) return undefined;
    return roles
      .map((r) => {
        try {
          const parsed = JSON.parse(r);
          return typeof parsed === 'string' ? parsed : String(r);
        } catch {
          return String(r);
        }
      })
      .filter(Boolean);
  }

  async getMe(userId: string): Promise<User> {
    return this.findUserOrThrow(userId);
  }

  async updateMe(userId: string, updateMeDto: UpdateMeInput): Promise<{ user: User; access_token: string }> {
    const user = await this.findUserOrThrow(userId);
    const {
      name, profilePicture, roles, activePerspective, bankAccountNumber,
      bankAccountHolderName, bankName, bankIfscCode, driverLicenseNumber,
      driverExperienceYears, ownerBusinessName, ownerAddress,
      emergencyContactNumber, emergencyContactRelation,
    } = updateMeDto;

    if (name !== undefined) user.name = name;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (driverLicenseNumber !== undefined) user.driverLicenseNumber = driverLicenseNumber;
    if (driverExperienceYears !== undefined) user.driverExperienceYears = driverExperienceYears ? Number(driverExperienceYears) : undefined;
    if (ownerBusinessName !== undefined) user.ownerBusinessName = ownerBusinessName;
    if (ownerAddress !== undefined) user.ownerAddress = ownerAddress;
    if (emergencyContactNumber !== undefined) user.emergencyContactNumber = emergencyContactNumber;
    if (emergencyContactRelation !== undefined) user.emergencyContactRelation = emergencyContactRelation;

    const normalizedRoles = this.normalizeRoles(roles);
    if (normalizedRoles?.length) {
      const mappedRoles = normalizedRoles.map((r) => this.mapRole(r)).filter((r): r is Role => !!r);
      user.roles = mappedRoles;
      if (user.activePerspective && !user.roles.includes(user.activePerspective)) {
        user.activePerspective = user.roles[0];
      }
    }

    const isUpdatingBankDetails = bankAccountNumber !== undefined || bankAccountHolderName !== undefined || bankName !== undefined || bankIfscCode !== undefined;
    if (isUpdatingBankDetails) {
      const hasOwnerRole = user.roles.includes(Role.VEHICLE_OWNER);
      if (!hasOwnerRole) {
        throw new RpcException('Only users with the VEHICLE_OWNER role can set or update bank details.');
      }
      if (bankAccountNumber !== undefined) user.bankAccountNumber = bankAccountNumber;
      if (bankAccountHolderName !== undefined) user.bankAccountHolderName = bankAccountHolderName;
      if (bankName !== undefined) user.bankName = bankName;
      if (bankIfscCode !== undefined) user.bankIfscCode = bankIfscCode;
    }

    if (activePerspective !== undefined) {
      const mappedPerspective = this.mapRole(activePerspective);
      if (!mappedPerspective || !user.roles.includes(mappedPerspective)) {
        throw new RpcException(`You do not have the ${mappedPerspective || activePerspective} role assigned.`);
      }
      user.activePerspective = mappedPerspective;
    }

    const updatedUser = await this.userRepository.save(user);
    const { accessToken } = this.authService.generateTokens(updatedUser);

    return { user: updatedUser, access_token: accessToken };
  }

  async switchPerspective(request: { userId: string; perspective: string }): Promise<{ user: User; access_token: string }> {
    const { userId, perspective } = request;
    if (perspective === undefined || perspective === null) {
      throw new RpcException('Perspective is required');
    }
    const user = await this.findUserOrThrow(userId);
    const normalizedPerspective = this.mapRole(perspective);
    if (!normalizedPerspective || !user.roles.includes(normalizedPerspective)) {
      throw new RpcException(`You do not have the ${normalizedPerspective || perspective} role assigned.`);
    }
    user.activePerspective = normalizedPerspective;
    const updatedUser = await this.userRepository.save(user);
    const { accessToken } = this.authService.generateTokens(updatedUser);
    return { user: updatedUser, access_token: accessToken };
  }

  async saveAddress(userId: string, label: string, type: string, addressText: string, lat: number, lng: number): Promise<Address> {
    const addr = this.addressRepository.create({ userId, label, type: type.toUpperCase(), address: addressText, lat, lng });
    return this.addressRepository.save(addr);
  }

  async getAddresses(userId: string): Promise<Address[]> {
    return this.addressRepository.find({ where: { userId } });
  }

  async updateAddress(userId: string, addressId: string, label?: string, addressText?: string, lat?: number, lng?: number): Promise<Address> {
    const addr = await this.addressRepository.findOne({ where: { id: addressId, userId } });
    if (!addr) throw new BadRequestException('Address not found');
    if (label !== undefined) addr.label = label;
    if (addressText !== undefined) addr.address = addressText;
    if (lat !== undefined) addr.lat = lat;
    if (lng !== undefined) addr.lng = lng;
    return this.addressRepository.save(addr);
  }

  async deleteAddress(userId: string, addressId: string): Promise<{ message: string }> {
    await this.addressRepository.delete({ id: addressId, userId });
    return { message: 'Address deleted.' };
  }

  async registerDeviceToken(userId: string, token: string, platform: string): Promise<{ message: string }> {
    let existing = await this.deviceTokenRepository.findOne({ where: { userId, token } });
    if (!existing) {
      existing = this.deviceTokenRepository.create({ userId, token, platform: platform.toUpperCase() });
      await this.deviceTokenRepository.save(existing);
    }
    return { message: 'Device token registered successfully.' };
  }

  async removeDeviceToken(userId: string, token: string): Promise<{ message: string }> {
    await this.deviceTokenRepository.delete({ userId, token });
    return { message: 'Device token removed.' };
  }

  async getReferrals(userId: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    if (!user.referralCode) {
      user.referralCode = (user.name || 'USER').slice(0, 5).toUpperCase() + Math.floor(100 + Math.random() * 900);
      await this.userRepository.save(user);
    }
    return {
      referralCode: user.referralCode,
      shareUrl: `https://rentkarrideker.com/join?ref=${user.referralCode}`,
      earningsJson: JSON.stringify({ totalReferrals: 3, successfulReferrals: 2, totalCreditsEarned: 1000, creditsAvailable: user.walletBalance }),
      referralHistoryJson: JSON.stringify([{ referredUser: 'Sunita D.', joinedAt: '2026-05-20', status: 'COMPLETED', creditsEarned: 500 }]),
    };
  }

  async applyReferral(userId: string, referralCode: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    const referrer = await this.userRepository.findOne({ where: { referralCode } });
    if (!referrer) throw new BadRequestException('Invalid referral code');
    if (referrer.id === userId) throw new BadRequestException('You cannot apply your own referral code');
    user.walletBalance += 500;
    await this.userRepository.save(user);
    return {
      message: 'Referral code applied. ₹500 credit added to your wallet after your first trip.',
      referralCode,
      creditAmount: 500,
      creditAppliedOn: 'FIRST_TRIP_COMPLETION',
    };
  }

  async validateReferralCode(userId: string, referralCode: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    const referrer = await this.userRepository.findOne({ where: { referralCode } });
    if (!referrer || referrer.id === userId) {
      return { isValid: false, referrerName: '' };
    }
    return { isValid: true, referrerName: referrer.name || '' };
  }

  async getWallet(userId: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    return {
      walletBalance: user.walletBalance,
      currency: 'INR',
      transactionsJson: JSON.stringify([{ id: 'txn-uuid-001', type: 'CREDIT', amount: 500, description: 'Referral bonus — Sunita D. joined', createdAt: '2026-06-01T10:00:00.000Z' }]),
    };
  }
}
