import { IsString } from 'class-validator';
import { access } from 'fs';

export class LogoutDTO {
  @IsString()
  accessToken: string;

  @IsString()
  refreshToken: string;
}
