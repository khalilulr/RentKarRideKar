import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { Session } from './entity/session.entity';
import { TrustedDriver } from './entity/trusted-driver.entity';
import { Address } from './entity/address.entity';
import { DeviceToken } from './entity/device-token.entity';

import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { DriverModule } from './driver/driver.module';
import { UserModule } from './user/user.module';

const envFilePath =
  process.env.NODE_ENV?.trim() === 'production'
    ? '.env'
    : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('AUTH_DB_HOST'),
        port: configService.get<number>('AUTH_DB_PORT'),
        username: configService.get<string>('AUTH_DB_USER'),
        password: configService.get<string>('AUTH_DB_PASSWORD'),
        database: configService.get<string>('AUTH_DB_NAME'),
        entities: [User, Session, TrustedDriver, Address, DeviceToken],
        synchronize: true, // Auto-creates tables (DEVELOPMENT ONLY!)
      }),
    }),
    AuthModule,
    AdminModule,
    DriverModule,
    UserModule,
  ],
})
export class AppModule {}
