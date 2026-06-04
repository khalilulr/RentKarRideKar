import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from 'apps/common/src/redis/redis.module';

import { ChatRoom } from './entities/chat-room.entity';
import { Message } from './entities/message.entity';
import { CallSession } from './entities/call-session.entity';
import { SosEvent } from './entities/sos-event.entity';

import { CommunicationService } from './communication.service';
import { ChatController } from './controllers/chat.controller';
import { CallController } from './controllers/call.controller';
import { SosController } from './controllers/sos.controller';
import { CommunicationGrpcController } from './controllers/communication.grpc-controller';

const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath,
    }),
    RedisModule.registerAsync(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('COMMUNICATION_DB_HOST') || configService.get<string>('BOOKING_DB_HOST') || 'localhost',
        port: configService.get<number>('COMMUNICATION_DB_PORT') || configService.get<number>('BOOKING_DB_PORT') || 5432,
        username: configService.get<string>('COMMUNICATION_DB_USER') || configService.get<string>('BOOKING_DB_USER') || 'postgres',
        password: configService.get<string>('COMMUNICATION_DB_PASSWORD') || configService.get<string>('BOOKING_DB_PASSWORD') || 'ashif1234',
        database: configService.get<string>('COMMUNICATION_DB_NAME') || configService.get<string>('BOOKING_DB_NAME') || 'rkrk_booking_db',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([ChatRoom, Message, CallSession, SosEvent]),
  ],
  controllers: [
    ChatController,
    CallController,
    SosController,
    CommunicationGrpcController,
  ],
  providers: [CommunicationService],
})
export class CommunicationModule {}
