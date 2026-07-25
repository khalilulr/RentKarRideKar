import { IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class VerifyOtpDto {
  @IsPhoneNumber('IN', { message: 'Invalid mobile number' })
  @IsNotEmpty({ message: 'Mobile number is required' })
  mobile: string;

  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;
}
