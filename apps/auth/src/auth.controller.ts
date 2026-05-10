import { 
  Body, 
  Controller, 
  Post, 
  UseInterceptors, 
  HttpCode, 
  HttpStatus 
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';

@Controller('auth')
@UseInterceptors(TransformInterceptor) // Best practice: Apply to the whole class once
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Request an OTP to be sent to a mobile number.
   * Uses 200 OK because we are triggering an action, not creating a persistent resource yet.
   */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    const result = await this.authService.sendOtp(sendOtpDto);
    return {
      message: 'OTP sent successfully',
      result,
    };
  }

  /**
   * Verify the OTP and establish a session.
   * Returns Access & Refresh tokens.
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    const result = await this.authService.verifyOtp(verifyOtpDto);
    return {
      message: 'OTP verified successfully',
      result, // contains tokens and user profile
    };
  }
}