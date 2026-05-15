import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { Msg91Service } from 'apps/common/src/msg91.service';
import { User } from './entity/user.entity';
import { Session } from './entity/session.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { KycStatus } from './enum/kycStatus.enum';
import { JwtService } from './strategies/jwt/jwt.service';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { Role } from './enum/role.enum';
import { RpcException } from '@nestjs/microservices';

type UpdateMeInput = {
  name?: string;
  profilePicture?: string;
  roles?: string[];
  activePerspective?: string;
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
    private readonly msg91Service: Msg91Service,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    // getOrThrow replaces the manual check + throw pattern
    this.templateId = this.configService.getOrThrow<string>('MSG91_TEMPLATE_ID');
  }

  // ====================================================================
  // PRIVATE HELPERS
  // ====================================================================

  private generateTokens(user: User): TokenPair {
    const accessToken = this.jwtService.generateAccessToken({
      userId: user.id,
      Roles: user.roles,
      activePerspective: user.activePerspective,
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
    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);

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
  private async findActiveSession(user: User, refreshToken: string): Promise<Session> {
    const activeSessions = await this.sessionRepository.find({
      where: { user: { id: user.id }, isRevoked: false },
    });

    for (const session of activeSessions) {
      const isMatch = await bcrypt.compare(refreshToken, session.refreshTokenHash);
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

  /**
   * Maps roles from REST/gRPC strings or legacy numeric proto enums.
   */
  private mapRole(role: unknown): Role {
    if (role === undefined || role === null) {
      return Role.PASSENGER;
    }
    if (typeof role === 'string') {
      const normalized = role.toUpperCase();
      if (normalized in Role) {
        return normalized as Role;
      }
      return Role.PASSENGER;
    }
    if (typeof role === 'number') {
      const mapping: Record<number, Role> = {
        0: Role.PASSENGER,
        1: Role.DRIVER,
        2: Role.ADMIN,
        3: Role.VEHICLE_OWNER,
      };
      return mapping[role] ?? Role.PASSENGER;
    }
    return Role.PASSENGER;
  }

  private normalizeRoles(roles: unknown): string[] | undefined {
    if (roles === undefined || roles === null) {
      return undefined;
    }
    if (Array.isArray(roles)) {
      return roles.length ? roles.map((r) => String(r)) : undefined;
    }
    return [String(roles)];
  }

  // ====================================================================
  // PUBLIC METHODS
  // ====================================================================

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string }> {
    try {
      await this.msg91Service.sendOtp(sendOtpDto.mobile, this.templateId);
      return { message: 'OTP sent successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to send OTP to ${sendOtpDto.mobile}`, error.stack);
      throw new InternalServerErrorException('Failed to send OTP. Please try again.');
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
        this.userRepository.create({ mobile, kycStatus: KycStatus.PENDING }),
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
    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);
    await this.sessionRepository.update(currentSession.id, { isRevoked: true });
    await this.createAndSaveSession(user, newRefreshToken, ipAddress, userAgent);

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
    const { name, profilePicture, roles, activePerspective } = updateMeDto;
    if (name !== undefined) user.name = name;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;

    const normalizedRoles = this.normalizeRoles(roles);
    if (normalizedRoles?.length) {
      const mappedRoles = normalizedRoles.map((r) => this.mapRole(r));

      user.roles = Array.from(
        new Set([
          ...user.roles,
          ...mappedRoles,
        ]),
      );
    }

    if (activePerspective !== undefined) {
  const mappedPerspective = this.mapRole(activePerspective);

  if (!user.roles.includes(mappedPerspective)) {
     throw new RpcException(
        `You do not have the ${mappedPerspective} role assigned.`
      );
  }

  user.activePerspective = mappedPerspective;
}

    const updatedUser = await this.userRepository.save(user);
    // Re-issue access token so claims (roles, perspective) are immediately up to date
    const accessToken = this.jwtService.generateAccessToken({
      userId: updatedUser.id,
      Roles: updatedUser.roles,
      activePerspective: updatedUser.activePerspective,
      type: 'access',
    });

    return { user: updatedUser, access_token: accessToken };
  }

  async switchPerspective(request: { userId: string; perspective: string }): Promise<{ user: User; access_token: string }> {
    // 1. Destructure the properties from the incoming request object
    const { userId, perspective } = request;

    // 2. Add a safeguard in case the frontend sends an empty body
    if (perspective === undefined || perspective === null) {
      throw new RpcException('Perspective is required');
    }

    const user = await this.findUserOrThrow(userId);

    // 3. Map the perspective (could be numeric from gRPC)
    const normalizedPerspective = this.mapRole(perspective);

    if (!user.roles.includes(normalizedPerspective)) {
      throw new RpcException(
        `You do not have the ${normalizedPerspective} role assigned.`
      );
    }

    user.activePerspective = normalizedPerspective;
    const updatedUser = await this.userRepository.save(user);

    // Issue new token with the updated perspective claim
    const accessToken = this.jwtService.generateAccessToken({
      userId: updatedUser.id,
      Roles: updatedUser.roles,
      activePerspective: updatedUser.activePerspective,
      type: 'access',
    });

    return { user: updatedUser, access_token: accessToken };
  }
}