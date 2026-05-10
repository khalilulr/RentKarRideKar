import { 
  Injectable, 
  InternalServerErrorException, 
  UnauthorizedException, 
  Logger 
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Msg91Service } from 'apps/common/src/msg91.service';
import { User } from './entity/user.entity';
import { Session } from './entity/session.entity';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { KycStatus } from './enum/kycStatus.enum';
import { JwtService } from './strategies/jwt/jwt.service';
import * as bcrypt from 'bcrypt';

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
    let templateId = this.configService.get<string>('MSG91_TEMPLATE_ID');
    if (!templateId) {
      throw new InternalServerErrorException('MSG91_TEMPLATE_ID is missing in .env');
    }
    this.templateId = templateId;
  }

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

    // MSG91 returns type: 'success' if verified
    if (response.type !== 'success') {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // 2. Check if user exists
    let user = await this.userRepository.findOne({ where: { mobile } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // 3. Create new user if they don't exist
      const newUser = this.userRepository.create({
        mobile,
        kycStatus: KycStatus.PENDING
      });

      user = await this.userRepository.save(newUser);
      this.logger.log(`New user registered: ${mobile}`);
    }

    const access_payload = {
      userId: user.id,
      Roles: user.roles,
      activePerspective: user.activePerspective,
      type: "access"
    };

    const refresh_payload = {
      userId: user.id,
      type: "refresh"
    };

    const accessToken: string = this.jwtService.generateAccessToken(access_payload);
    const refreshToken: string = this.jwtService.generateRefreshToken(refresh_payload);

    // 4. Store Session in Database
    // In a real app, you should hash the refreshToken before storing it.
    const refreshTokenHash =  bcrypt.hashSync(refreshToken, 12); // Use bcrypt to hash the refresh token
    // For now, we follow the user's field name 'refreshTokenHash'.
    const session = this.sessionRepository.create({
      refreshTokenHash,
      ipAddress,
      userAgent,
      user
    });

    await this.sessionRepository.save(session);

    return { user, refresh_token: refreshToken, access_token: accessToken };
  }


}

