import { IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class SendOtpDto {
    @IsPhoneNumber('IN', { message: 'Invalid mobile number' })
    @IsNotEmpty({ message: 'Mobile number is required' })
    mobile: string;
}