import { 
  Injectable, 
  InternalServerErrorException, 
  UnauthorizedException, 
  Logger 
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
    private readonly jwtService: JwtService
  ) {
    const templateId = this.configService.get<string>('MSG91_TEMPLATE_ID');
    if (!templateId) {
      throw new InternalServerErrorException('MSG91_TEMPLATE_ID is missing in .env');
    }
    this.templateId = templateId;
  }


   // ====================================================================
  // PRIVATE HELPER METHODS (DRY)
  // ====================================================================

  /**
   * Helper to generate Access and Refresh tokens for a user
   */
  private generateTokens(user: User): { accessToken: string; refreshToken: string } {
    const accessToken = this.jwtService.generateAccessToken({
      userId: user.id,
      Roles: user.roles,
      activePerspective: user.activePerspective,
      type: 'access'
    });

    const refreshToken = this.jwtService.generateRefreshToken({
      userId: user.id,
      type: 'refresh'
    });

    return { accessToken, refreshToken };
  }

  /**
   * Helper to hash the refresh token and save the session to the database
   */
  private async createAndSaveSession(user: User, refreshToken: string, ipAddress: string, userAgent: string): Promise<void> {
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10); 
    
    const session = this.sessionRepository.create({
      refreshTokenHash,
      ipAddress,
      userAgent,
      user
    });

    await this.sessionRepository.save(session);
  }
  

  // ====================================================================
  // PUBLIC METHODS
  // ====================================================================

  /**
   * Triggers the OTP sending process via MSG91
   */
  async sendOtp(sendOtpDto: SendOtpDto): Promise<{ message: string }> {
    try {
      await this.msg91Service.sendOtp(sendOtpDto.mobile, this.templateId);
      return { message: 'OTP sent successfully' };
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${sendOtpDto.mobile}`, error.stack);
      throw new InternalServerErrorException('Failed to send OTP. Please try again.');
    }
  }

  /**
   * Verifies OTP and handles User Registration/Login
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto, ipAddress: string, userAgent: string): Promise<{ user: User; refresh_token: string; access_token: string }> {
    const { mobile, otp } = verifyOtpDto;

    // 1. Verify OTP with MSG91
    const response = await this.msg91Service.verifyOtp(mobile, otp);

    if (response.type !== 'success') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // 2. Check if user exists or create a new one
    let user = await this.userRepository.findOne({ where: { mobile } });

    if (!user) {
      const newUser = this.userRepository.create({
        mobile,
        kycStatus: KycStatus.PENDING
      });
      user = await this.userRepository.save(newUser);
      this.logger.log(`New user registered: ${mobile}`);
    }

    // 3. Generate Tokens
    const { accessToken, refreshToken } = this.generateTokens(user);

    // 4. Store Session
    await this.createAndSaveSession(user, refreshToken, ipAddress, userAgent);

    return { user, refresh_token: refreshToken, access_token: accessToken };
  }

  /**
   * Refreshes the Access Token and rotates the Refresh Token
   */
  async refreshToken(refreshToken: string, ipAddress: string, userAgent: string) {
    let tokenPayload;
    
    // 1. Validate the JWT itself
    try {
      tokenPayload = this.jwtService.verifyToken(refreshToken);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (tokenPayload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // 2. Await the DB call to find the user
    const user = await this.userRepository.findOne({
      where: { id: tokenPayload.userId }
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // 3. Find active sessions for this user
    const activeSessions = await this.sessionRepository.find({
      where: { 
        user: { id: user.id }, 
        isRevoked: false 
      }
    });

    // 4. Compare bcrypt hashes to find the matching session
    let currentSession ;
    for (const session of activeSessions) {
      const isMatch = await bcrypt.compare(refreshToken, session.refreshTokenHash);
      if (isMatch) {
        currentSession = session;
        break;
      }
    }

    if (!currentSession) {
      throw new UnauthorizedException('Session expired or logged out');
    }

    // 5. Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);

    // 6. Token Rotation: Delete old session, save new one
    await this.sessionRepository.delete(currentSession.id);
    await this.createAndSaveSession(user, newRefreshToken, ipAddress, userAgent);

    return { 
      access_token: accessToken, 
      refresh_token: newRefreshToken, 
      user 
    };
  }

 
}