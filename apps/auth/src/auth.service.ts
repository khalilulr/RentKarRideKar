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
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { KycStatus } from './enum/kycStatus.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly templateId: string;

  constructor(
    @InjectRepository(User) 
    private readonly userRepository: Repository<User>,
    private readonly msg91Service: Msg91Service,
    private readonly configService: ConfigService,
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
  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ user: User; isNewUser: boolean }> {
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
      // By default, roles and kycStatus are handled by Entity defaults
      const newUser = this.userRepository.create({ 
        mobile,
        kycStatus: KycStatus.PENDING // Passengers are verified once mobile is OTP-checked
      });
      
      user = await this.userRepository.save(newUser);
      this.logger.log(`New user registered: ${mobile}`);
    }

    // 4. Return the user (In next step, you will generate a JWT here)
    return { user, isNewUser };
  }
}