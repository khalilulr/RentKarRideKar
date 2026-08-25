import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../entity/user.entity';
import { Session } from '../entity/session.entity';
import { CommonModule } from 'apps/common/src/common.module';
import { JwtService } from '../strategies/jwt/jwt.service';
import { RedisModule } from 'apps/common/src/redis/redis.module';

@Module({
  imports: [
    JwtModule.register({
      privateKey: fs.readFileSync(path.join(process.cwd(), 'secrets/private.pem')),
      publicKey: fs.readFileSync(path.join(process.cwd(), 'secrets/public.pem')),
      signOptions: {
        algorithm: 'RS256',
      },
    }),
    TypeOrmModule.forFeature([User, Session]),
    RedisModule.registerAsync(),
    CommonModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtService],
  exports: [AuthService, JwtService, JwtModule],
})
export class AuthModule {}
