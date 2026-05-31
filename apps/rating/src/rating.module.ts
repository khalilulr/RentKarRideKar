import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RatingController } from './rating.controller';
import { ReviewService } from './services/Review.service';
import { CancellationService } from './services/Cancellation.service';
import { ReputationService } from './services/Reputation.service';
import { BookingIntegrationService } from './services/BookingIntegration.service';
import { RevealReviewsJobService } from './services/RevealReviewsJob.service';
import { ReviewRepository } from './repositories/Review.repository';
import { CancellationRepository } from './repositories/Cancellation.repository';
import { ReputationRepository } from './repositories/Reputation.repository';
import { Review } from './entities/Review.entity';
import { Cancellation } from './entities/Cancellation.entity';
import { ReputationCache } from './entities/ReputationCache.entity';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BOOKING_SERVICE_PROTO_PATH } from '../../../libs/proto/booking.grpc-options';

const envFilePath =
  process.env.NODE_ENV?.trim() === 'production'
    ? '.env'
    : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath,
    }),
    // 1. Default Connection (Rating DB)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('RATING_DB_HOST') || 'localhost',
        port: configService.get<number>('RATING_DB_PORT') || 5437,
        username: configService.get<string>('RATING_DB_USER') || 'postgres',
        password: configService.get<string>('RATING_DB_PASSWORD') || 'ashif1234',
        database: configService.get<string>('RATING_DB_NAME') || 'rkrk_rating_db',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    // 2. Named Connection replaced by gRPC client for Booking service
    ClientsModule.register([
      {
        name: 'BOOKING_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'booking',
          protoPath: BOOKING_SERVICE_PROTO_PATH,
          url: process.env.BOOKING_SERVICE_URL || 'booking-service:50053',
        },
      },
    ]),
    TypeOrmModule.forFeature([Review, Cancellation, ReputationCache]),
  ],
  controllers: [RatingController],
  providers: [
    ReviewService,
    CancellationService,
    ReputationService,
    BookingIntegrationService,
    RevealReviewsJobService,
    ReviewRepository,
    CancellationRepository,
    ReputationRepository,
  ],
})
export class RatingModule {}
