import { IsNotEmpty, IsString } from 'class-validator';

export class SessionDTO {
  @IsString()
  @IsNotEmpty()
  refreshTokenHash: string;

  @IsString()
  @IsNotEmpty()
  ipAddress: string;

  @IsString()
  @IsNotEmpty()
  userAgent: string;
}
