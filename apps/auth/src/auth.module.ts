import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { Session } from './entity/session.entity';
import { CommonModule } from 'apps/common/src/common.module';
import { JwtService } from './strategies/jwt/jwt.service';
import { JwtModule } from '@nestjs/jwt';
import * as fs from 'fs';
import * as path from 'path';
import { RedisModule } from 'apps/common/src/redis/redis.module';
const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;


@Module({
  imports: [
    JwtModule.register({
      privateKey: fs.readFileSync(
        path.join(process.cwd(), 'secrets/private.pem'),
      ),
      publicKey: fs.readFileSync(
        path.join(process.cwd(), 'secrets/public.pem'),
      ),
      signOptions: {
        algorithm: 'RS256',
      },
    }),
    TypeOrmModule.forFeature([User, Session]),
    ConfigModule.forRoot({ isGlobal: true, envFilePath }),
    RedisModule.registerAsync(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('AUTH_DB_HOST'), // 'Auth_db' in docker
        port: configService.get<number>('AUTH_DB_PORT'), // 5432
        username: configService.get<string>('AUTH_DB_USER'),
        password: configService.get<string>('AUTH_DB_PASSWORD'),
        database: configService.get<string>('AUTH_DB_NAME'),
        autoLoadEntities: true, // Automatically finds your @Entity() files
        synchronize: true, // Auto-creates tables (DEVELOPMENT ONLY!)
      }),
    }),
    CommonModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtService],
})
export class AuthModule { }
