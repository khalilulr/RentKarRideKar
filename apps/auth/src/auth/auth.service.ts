import { Injectable, InternalServerErrorException, UnauthorizedException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { RpcException } from '@nestjs/microservices';

import { Msg91Service } from 'apps/common/src/msg91.service';
import { User } from '../entity/user.entity';
import { Session } from '../entity/session.entity';
import { JwtService } from '../strategies/jwt/jwt.service';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { Role } from '../enum/role.enum';
import { SendOtpDto } from '../dto/send-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';

const BCRYPT_SALT_ROUNDS = 10;
const LOGOUT_ALL_REDIS_TTL_S = 900; // 15 minutes

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult {
  user: User;
  access_token: string;
  refresh_token: string;
}

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
    this.templateId = this.configService.getOrThrow<string>('MSG91_TEMPLATE_ID');
  }

  generateTokens(user: User): TokenPair {
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
    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_SALT_ROUNDS);
    const session = this.sessionRepository.create({
      refreshTokenHash,
      ipAddress: ipAddress || 'unknown',
      userAgent: userAgent || 'unknown',
      user,
    });
    await this.sessionRepository.save(session);
  }

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

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User no longer exists');
    return user;
  }

  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string }> {
    try {
      await this.msg91Service.sendOtp(sendOtpDto.mobile, this.templateId);
      return { message: 'OTP sent successfully' };
    } catch (error: any) {
      this.logger.error(`Failed to send OTP to ${sendOtpDto.mobile}`, error.stack);
      throw new InternalServerErrorException('Failed to send OTP. Please try again.');
    }
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto, ipAddress: string, userAgent: string): Promise<AuthResult> {
    const { mobile, otp } = verifyOtpDto;

    const response = await this.msg91Service.verifyOtp(mobile, otp);
    if (response.type !== 'success') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    let user = await this.userRepository.findOne({ where: { mobile } });
    if (!user) {
      user = await this.userRepository.save(this.userRepository.create({ mobile }));
      this.logger.log(`New user registered: ${mobile}`);
    }

    const { accessToken, refreshToken } = this.generateTokens(user);
    await this.createAndSaveSession(user, refreshToken, ipAddress, userAgent);

    return { user, access_token: accessToken, refresh_token: refreshToken };
  }

  async refreshToken(refreshToken: string, ipAddress: string, userAgent: string): Promise<AuthResult> {
    let tokenPayload: any;
    try {
      tokenPayload = this.jwtService.decodeToken(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (tokenPayload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.findUserOrThrow(tokenPayload.userId);
    const currentSession = await this.findActiveSession(user, refreshToken);

    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);
    await this.sessionRepository.update(currentSession.id, { isRevoked: true });
    await this.createAndSaveSession(user, newRefreshToken, ipAddress, userAgent);

    return { user, access_token: accessToken, refresh_token: newRefreshToken };
  }

  async logout(userId: string, jti: string, tokenExp: number, refreshToken: string): Promise<void> {
    const ttl = tokenExp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      this.logger.log(`Blacklisting JTI: ${jti} for ${ttl}s`);
      await this.redisService.set(`blacklist:token:${jti}`, 'true', ttl);
    }

    const user = await this.findUserOrThrow(userId);
    const session = await this.findActiveSession(user, refreshToken);
    await this.sessionRepository.update(session.id, { isRevoked: true });
  }

  async logoutAllDevices(userId: string): Promise<{ message: string }> {
    await this.findUserOrThrow(userId);

    await this.sessionRepository.update(
      { user: { id: userId }, isRevoked: false },
      { isRevoked: true },
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.redisService.set(
      `blacklist:all:${userId}`,
      nowSeconds.toString(),
      LOGOUT_ALL_REDIS_TTL_S,
    );

    return { message: 'Logged out from all devices successfully' };
  }

  async loginAdmin(email?: string, password?: string, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
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
    await this.createAndSaveSession(user, refreshToken, ipAddress || 'unknown', userAgent || 'unknown');

    return { user, access_token: accessToken, refresh_token: refreshToken };
  }

  async createDemoAdmin(email?: string, password?: string, ipAddress?: string, userAgent?: string): Promise<AuthResult> {
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
    await this.createAndSaveSession(user, refreshToken, ipAddress || 'unknown', userAgent || 'unknown');

    return { user, access_token: accessToken, refresh_token: refreshToken };
  }
}
