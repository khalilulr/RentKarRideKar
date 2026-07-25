import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { Msg91Service } from 'apps/common/src/msg91.service';
import { User } from './entity/user.entity';
import { Session } from './entity/session.entity';
import { TrustedDriver, TrustStatus } from './entity/trusted-driver.entity';
import { Address } from './entity/address.entity';
import { DeviceToken } from './entity/device-token.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtService } from './strategies/jwt/jwt.service';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { Role } from './enum/role.enum';
import { RpcException } from '@nestjs/microservices';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const BCRYPT_SALT_ROUNDS = 10;

/**
 * How long the "logout-all" Redis flag lives.
 * Must be >= your access token TTL so all currently-valid tokens get rejected.
 */
const LOGOUT_ALL_REDIS_TTL_S = 900; // 15 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: User;
  access_token: string;
  refresh_token: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly templateId: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(TrustedDriver)
    private readonly trustedDriverRepository: Repository<TrustedDriver>,
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepository: Repository<DeviceToken>,
    private readonly msg91Service: Msg91Service,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    // getOrThrow replaces the manual check + throw pattern
    this.templateId =
      this.configService.getOrThrow<string>('MSG91_TEMPLATE_ID');
  }

  // ====================================================================
  // PRIVATE HELPERS
  // ====================================================================

  private generateTokens(user: User): TokenPair {
    const accessToken = this.jwtService.generateAccessToken({
      userId: user.id,
      Roles: user.roles,
      activePerspective: (user.activePerspective || undefined) as any,
      type: 'access',
    });

    const refreshToken = this.jwtService.generateRefreshToken({
      userId: user.id,
      type: 'refresh',
    });

    return { accessToken, refreshToken };
  }

  private async createAndSaveSession(
    user: User,
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      BCRYPT_SALT_ROUNDS,
    );

    const session = this.sessionRepository.create({
      refreshTokenHash,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      user,
    });

    await this.sessionRepository.save(session);
  }

  /**
   * Scans all active sessions for this user and returns the one whose hash
   * matches the provided raw refresh token. Throws if none match.
   */
  private async findActiveSession(
    user: User,
    refreshToken: string,
  ): Promise<Session> {
    const activeSessions = await this.sessionRepository.find({
      where: { user: { id: user.id }, isRevoked: false },
    });

    for (const session of activeSessions) {
      const isMatch = await bcrypt.compare(
        refreshToken,
        session.refreshTokenHash,
      );
      if (isMatch) return session;
    }

    throw new UnauthorizedException('Session expired or logged out');
  }

  /**
   * Centralises the repeated "find user by ID or throw" pattern.
   */
  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  private mapRole(role: unknown): Role | undefined {
    if (role === undefined || role === null) {
      return undefined;
    }
    if (typeof role === 'string') {
      const normalized = role.toUpperCase();
      if (normalized in Role) {
        return normalized as Role;
      }
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
        // Handle both plain strings and JSON-stringified strings
        try {
          const parsed = JSON.parse(r);
          return typeof parsed === 'string' ? parsed : String(r);
        } catch {
          return String(r); // already a plain string like "PASSENGER"
        }
      })
      .filter(Boolean);
  }

  // ====================================================================
  // PUBLIC METHODS
  // ====================================================================

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string }> {
    try {
      await this.msg91Service.sendOtp(sendOtpDto.mobile, this.templateId);
      return { message: 'OTP sent successfully' };
    } catch (error: any) {
      this.logger.error(
        `Failed to send OTP to ${sendOtpDto.mobile}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Failed to send OTP. Please try again.',
      );
    }
  }

  async verifyOtp(
    verifyOtpDto: VerifyOtpDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResult> {
    const { mobile, otp } = verifyOtpDto;

    // 1. Verify OTP with MSG91
    const response = await this.msg91Service.verifyOtp(mobile, otp);
    if (response.type !== 'success') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // 2. Find existing user or register a new one
    let user = await this.userRepository.findOne({ where: { mobile } });
    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({ mobile }),
      );
      this.logger.log(`New user registered: ${mobile}`);
    }

    // 3. Issue tokens and persist session
    const { accessToken, refreshToken } = this.generateTokens(user);
    await this.createAndSaveSession(user, refreshToken, ipAddress, userAgent);

    return { user, access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(
    refreshToken: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<AuthResult> {
    // 1. Validate JWT structure and type claim
    let tokenPayload: any;
    try {
      tokenPayload = this.jwtService.decodeToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (tokenPayload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // 2. Verify user and session still exist
    const user = await this.findUserOrThrow(tokenPayload.userId);
    const currentSession = await this.findActiveSession(user, refreshToken);

    // 3. Rotate: revoke old session, issue fresh token pair
    const { accessToken, refreshToken: newRefreshToken } =
      this.generateTokens(user);
    await this.sessionRepository.update(currentSession.id, { isRevoked: true });
    await this.createAndSaveSession(
      user,
      newRefreshToken,
      ipAddress,
      userAgent,
    );

    return { user, access_token: accessToken, refresh_token: newRefreshToken };
  }

  /**
   * Single-device logout.
   *
   * The JwtAuthGuard already validated the access token, so we receive the
   * pre-decoded fields directly — no re-decoding needed here.
   *
   * @param userId      - From req.user (set by JwtAuthGuard)
   * @param jti         - JWT ID ('id' field on payload) — used for Redis blacklisting
   * @param tokenExp    - Expiry Unix timestamp of the access token
   * @param refreshToken - Raw value from the HttpOnly cookie
   */
  async logout(
    userId: string,
    jti: string,
    tokenExp: number,
    refreshToken: string,
  ): Promise<void> {
    // 1. Blacklist the JTI so the access token cannot be reused before it expires
    const ttl = tokenExp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      this.logger.log(`Blacklisting JTI: ${jti} for ${ttl}s`);
      await this.redisService.set(`blacklist:token:${jti}`, 'true', ttl);
    }

    // 2. Find and revoke the matching refresh token session
    const user = await this.findUserOrThrow(userId);
    const session = await this.findActiveSession(user, refreshToken);
    await this.sessionRepository.update(session.id, { isRevoked: true });
  }

  /**
   * All-device logout.
   *
   * Revokes every active DB session and sets a Redis timestamp flag.
   * The JwtAuthGuard must check this flag and reject any access token
   * with an iat (issued-at) older than the stored timestamp.
   *
   * @param userId - From req.user (set by JwtAuthGuard)
   */
  async logoutAllDevices(userId: string): Promise<{ message: string }> {
    await this.findUserOrThrow(userId);

    // Revoke all active sessions in one DB call
    await this.sessionRepository.update(
      { user: { id: userId }, isRevoked: false },
      { isRevoked: true },
    );

    // Store the timestamp — guard rejects tokens with iat < this value
    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.redisService.set(
      `blacklist:all:${userId}`,
      nowSeconds.toString(),
      LOGOUT_ALL_REDIS_TTL_S,
    );

    return { message: 'Logged out from all devices successfully' };
  }

  /**
   * Returns the authenticated user's profile.
   * userId comes from @CurrentUser() — the guard already verified the token.
   */
  async getMe(userId: string): Promise<User> {
    return this.findUserOrThrow(userId);
  }

  /**
   * Updates the authenticated user's profile and re-issues the access token
   * so any role/perspective changes take effect immediately on the client.
   */
  async updateMe(
    userId: string,
    updateMeDto: UpdateMeInput,
  ): Promise<{ user: User; access_token: string }> {
    const user = await this.findUserOrThrow(userId);

    // Only assign fields that were actually sent — avoids accidental overwrites
    const {
      name,
      profilePicture,
      roles,
      activePerspective,
      bankAccountNumber,
      bankAccountHolderName,
      bankName,
      bankIfscCode,
      driverLicenseNumber,
      driverExperienceYears,
      ownerBusinessName,
      ownerAddress,
      emergencyContactNumber,
      emergencyContactRelation,
    } = updateMeDto;
    if (name !== undefined) user.name = name;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;
    if (driverLicenseNumber !== undefined)
      user.driverLicenseNumber = driverLicenseNumber;
    if (driverExperienceYears !== undefined)
      user.driverExperienceYears = driverExperienceYears
        ? Number(driverExperienceYears)
        : undefined;
    if (ownerBusinessName !== undefined)
      user.ownerBusinessName = ownerBusinessName;
    if (ownerAddress !== undefined) user.ownerAddress = ownerAddress;
    if (emergencyContactNumber !== undefined)
      user.emergencyContactNumber = emergencyContactNumber;
    if (emergencyContactRelation !== undefined)
      user.emergencyContactRelation = emergencyContactRelation;
    console.log('[AUTH SERVICE updateMe] dto:', JSON.stringify(updateMeDto));
    const normalizedRoles = this.normalizeRoles(roles);
    console.log('[AUTH SERVICE updateMe] normalizedRoles:', normalizedRoles);
    if (normalizedRoles?.length) {
      const mappedRoles = normalizedRoles
        .map((r) => this.mapRole(r))
        .filter((r): r is Role => !!r);
      console.log('[DEBUG] mappedRoles:', mappedRoles); // look for undefined/null here

      user.roles = mappedRoles;

      if (
        user.activePerspective &&
        !user.roles.includes(user.activePerspective)
      ) {
        user.activePerspective = user.roles[0];
      }
    }

    const isUpdatingBankDetails =
      bankAccountNumber !== undefined ||
      bankAccountHolderName !== undefined ||
      bankName !== undefined ||
      bankIfscCode !== undefined;

    if (isUpdatingBankDetails) {
      const hasOwnerRole = user.roles.includes(Role.VEHICLE_OWNER);
      if (!hasOwnerRole) {
        throw new RpcException(
          'Only users with the VEHICLE_OWNER role can set or update bank details.',
        );
      }
      if (bankAccountNumber !== undefined)
        user.bankAccountNumber = bankAccountNumber;
      if (bankAccountHolderName !== undefined)
        user.bankAccountHolderName = bankAccountHolderName;
      if (bankName !== undefined) user.bankName = bankName;
      if (bankIfscCode !== undefined) user.bankIfscCode = bankIfscCode;
    }

    if (activePerspective !== undefined) {
      const mappedPerspective = this.mapRole(activePerspective);

      if (!mappedPerspective || !user.roles.includes(mappedPerspective)) {
        throw new RpcException(
          `You do not have the ${mappedPerspective || activePerspective} role assigned.`,
        );
      }

      user.activePerspective = mappedPerspective;
    }

    const updatedUser = await this.userRepository.save(user);
    // Re-issue access token so claims (roles, perspective) are immediately up to date
    const accessToken = this.jwtService.generateAccessToken({
      userId: updatedUser.id,
      Roles: updatedUser.roles,
      activePerspective: (updatedUser.activePerspective || undefined) as any,
      type: 'access',
    });

    return { user: updatedUser, access_token: accessToken };
  }

  async switchPerspective(request: {
    userId: string;
    perspective: string;
  }): Promise<{ user: User; access_token: string }> {
    // 1. Destructure the properties from the incoming request object
    const { userId, perspective } = request;

    // 2. Add a safeguard in case the frontend sends an empty body
    if (perspective === undefined || perspective === null) {
      throw new RpcException('Perspective is required');
    }

    const user = await this.findUserOrThrow(userId);

    // 3. Map the perspective (could be numeric from gRPC)
    const normalizedPerspective = this.mapRole(perspective);

    if (!normalizedPerspective || !user.roles.includes(normalizedPerspective)) {
      throw new RpcException(
        `You do not have the ${normalizedPerspective || perspective} role assigned.`,
      );
    }

    user.activePerspective = normalizedPerspective;
    const updatedUser = await this.userRepository.save(user);

    // Issue new token with the updated perspective claim
    const accessToken = this.jwtService.generateAccessToken({
      userId: updatedUser.id,
      Roles: updatedUser.roles,
      activePerspective: (updatedUser.activePerspective || undefined) as any,
      type: 'access',
    });

    return { user: updatedUser, access_token: accessToken };
  }

  async loginAdmin(
    email?: string,
    password?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    if (!email || !password) {
      throw new RpcException('Email and password are required');
    }

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user || !user.password) {
      throw new RpcException('Invalid credentials');
    }

    if (!user.roles.includes(Role.ADMIN)) {
      throw new RpcException('Access denied');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new RpcException('Invalid credentials');
    }

    const { accessToken, refreshToken } = this.generateTokens(user);
    await this.createAndSaveSession(
      user,
      refreshToken,
      ipAddress || 'unknown',
      userAgent || 'unknown',
    );

    return { user, access_token: accessToken, refresh_token: refreshToken };
  }

  async createDemoAdmin(
    email?: string,
    password?: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    if (!email || !password) {
      throw new RpcException('Email and password are required');
    }

    let user = await this.userRepository.findOne({ where: { email } });
    if (user) {
      throw new RpcException('Admin user already exists');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    user = this.userRepository.create({
      email,
      password: hashedPassword,
      name: 'Demo Admin',
      roles: [Role.ADMIN],
      activePerspective: Role.ADMIN,
      isActive: true,
    });

    user = await this.userRepository.save(user);

    const { accessToken, refreshToken } = this.generateTokens(user);
    await this.createAndSaveSession(
      user,
      refreshToken,
      ipAddress || 'unknown',
      userAgent || 'unknown',
    );

    return { user, access_token: accessToken, refresh_token: refreshToken };
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

  async inviteDriver(
    ownerId: string,
    driverId: string,
  ): Promise<TrustedDriver> {
    if (ownerId === driverId) {
      throw new BadRequestException(
        'You cannot invite yourself as a trusted driver.',
      );
    }

    const driver = await this.userRepository.findOne({
      where: { id: driverId },
    });
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
        throw new BadRequestException(
          'Driver is already in your trusted drivers list.',
        );
      }
      if (existing.status === TrustStatus.PENDING) {
        throw new BadRequestException(
          'An invitation to this driver is already pending.',
        );
      }
      // If rejected, allow re-invitation by resetting to PENDING
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

  async listInvitations(
    userId: string,
    type: 'sent' | 'received',
  ): Promise<any[]> {
    const list = await this.trustedDriverRepository.find({
      where: type === 'sent' ? { ownerId: userId } : { driverId: userId },
      order: { createdAt: 'DESC' },
    });

    if (list.length === 0) return [];

    const targetIds = list.map((item) =>
      type === 'sent' ? item.driverId : item.ownerId,
    );
    const users = await this.userRepository.find({
      where: { id: In(targetIds) },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return list.map((item) => {
      const targetUser = userMap.get(
        type === 'sent' ? item.driverId : item.ownerId,
      );
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
            }
          : null,
      };
    });
  }

  async respondToInvitation(
    driverId: string,
    invitationId: string,
    status: TrustStatus,
  ): Promise<TrustedDriver> {
    if (status !== TrustStatus.ACCEPTED && status !== TrustStatus.REJECTED) {
      throw new BadRequestException(
        'Invalid response status. Must be ACCEPTED or REJECTED.',
      );
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
      throw new BadRequestException(
        'This invitation has already been processed.',
      );
    }

    invitation.status = status;
    return this.trustedDriverRepository.save(invitation);
  }

  async checkTrustedDriver(
    ownerId: string,
    driverId: string,
  ): Promise<boolean> {
    const trust = await this.trustedDriverRepository.findOne({
      where: { ownerId, driverId, status: TrustStatus.ACCEPTED },
    });
    return !!trust;
  }

  async listUsersByRole(role: string): Promise<User[]> {
    const qb = this.userRepository.createQueryBuilder('user');
    const upperRole = role.toUpperCase();
    qb.where(':role = ANY(user.roles)', { role: upperRole });
    return qb.getMany();
  }

  async getMyTrustedDrivers(
    ownerId: string,
  ): Promise<{ trustedDrivers: any[]; total: number }> {
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

  async removeTrustedDriver(
    ownerId: string,
    driverId: string,
  ): Promise<{ message: string }> {
    await this.trustedDriverRepository.delete({ ownerId, driverId });
    return { message: 'Driver removed from your trusted pool.' };
  }

  async saveAddress(
    userId: string,
    label: string,
    type: string,
    addressText: string,
    lat: number,
    lng: number,
  ): Promise<Address> {
    const addr = this.addressRepository.create({
      userId,
      label,
      type: type.toUpperCase(),
      address: addressText,
      lat,
      lng,
    });
    return this.addressRepository.save(addr);
  }

  async getAddresses(userId: string): Promise<Address[]> {
    return this.addressRepository.find({ where: { userId } });
  }

  async updateAddress(
    userId: string,
    addressId: string,
    label?: string,
    addressText?: string,
    lat?: number,
    lng?: number,
  ): Promise<Address> {
    const addr = await this.addressRepository.findOne({
      where: { id: addressId, userId },
    });
    if (!addr) throw new BadRequestException('Address not found');
    if (label !== undefined) addr.label = label;
    if (addressText !== undefined) addr.address = addressText;
    if (lat !== undefined) addr.lat = lat;
    if (lng !== undefined) addr.lng = lng;
    return this.addressRepository.save(addr);
  }

  async deleteAddress(
    userId: string,
    addressId: string,
  ): Promise<{ message: string }> {
    await this.addressRepository.delete({ id: addressId, userId });
    return { message: 'Address deleted.' };
  }

  async registerDeviceToken(
    userId: string,
    token: string,
    platform: string,
  ): Promise<{ message: string }> {
    let existing = await this.deviceTokenRepository.findOne({
      where: { userId, token },
    });
    if (!existing) {
      existing = this.deviceTokenRepository.create({
        userId,
        token,
        platform: platform.toUpperCase(),
      });
      await this.deviceTokenRepository.save(existing);
    }
    return { message: 'Device token registered successfully.' };
  }

  async removeDeviceToken(
    userId: string,
    token: string,
  ): Promise<{ message: string }> {
    await this.deviceTokenRepository.delete({ userId, token });
    return { message: 'Device token removed.' };
  }

  async getReferrals(userId: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    if (!user.referralCode) {
      user.referralCode =
        (user.name || 'USER').slice(0, 5).toUpperCase() +
        Math.floor(100 + Math.random() * 900);
      await this.userRepository.save(user);
    }
    return {
      referralCode: user.referralCode,
      shareUrl: `https://rentkarrideker.com/join?ref=${user.referralCode}`,
      earningsJson: JSON.stringify({
        totalReferrals: 3,
        successfulReferrals: 2,
        totalCreditsEarned: 1000,
        creditsAvailable: user.walletBalance,
      }),
      referralHistoryJson: JSON.stringify([
        {
          referredUser: 'Sunita D.',
          joinedAt: '2026-05-20',
          status: 'COMPLETED',
          creditsEarned: 500,
        },
      ]),
    };
  }

  async applyReferral(userId: string, referralCode: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    const referrer = await this.userRepository.findOne({
      where: { referralCode },
    });
    if (!referrer) throw new BadRequestException('Invalid referral code');
    if (referrer.id === userId)
      throw new BadRequestException('You cannot apply your own referral code');

    user.walletBalance += 500;
    await this.userRepository.save(user);

    return {
      message:
        'Referral code applied. ₹500 credit added to your wallet after your first trip.',
      referralCode,
      creditAmount: 500,
      creditAppliedOn: 'FIRST_TRIP_COMPLETION',
    };
  }

  async validateReferralCode(
    userId: string,
    referralCode: string,
  ): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    const referrer = await this.userRepository.findOne({
      where: { referralCode },
    });
    if (!referrer) {
      return { isValid: false, referrerName: '' };
    }
    if (referrer.id === userId) {
      return { isValid: false, referrerName: '' };
    }
    return { isValid: true, referrerName: referrer.name || '' };
  }

  async getWallet(userId: string): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    return {
      walletBalance: user.walletBalance,
      currency: 'INR',
      transactionsJson: JSON.stringify([
        {
          id: 'txn-uuid-001',
          type: 'CREDIT',
          amount: 500,
          description: 'Referral bonus — Sunita D. joined',
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ]),
    };
  }

  async adminGetUsers(
    role?: string,
    kycStatus?: string,
    page = 1,
    limit = 20,
  ): Promise<{ users: User[]; total: number }> {
    const qb = this.userRepository.createQueryBuilder('user');
    if (role) {
      qb.andWhere(':role = ANY(user.roles)', { role: role.toUpperCase() });
    }
    qb.skip((page - 1) * limit).take(limit);
    const [users, total] = await qb.getManyAndCount();
    return { users, total };
  }

  async adminUpdateUserStatus(
    userId: string,
    action: string,
    reason: string,
  ): Promise<any> {
    const user = await this.findUserOrThrow(userId);
    user.isActive = action === 'REACTIVATE';
    await this.userRepository.save(user);
    return {
      userId: user.id,
      isActive: user.isActive,
      action,
      reason,
      updatedAt: new Date().toISOString(),
    };
  }
}
