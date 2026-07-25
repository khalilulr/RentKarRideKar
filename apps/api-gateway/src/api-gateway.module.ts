import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { CommunicationGateway } from './communication/communication.gateway';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as path from 'path';
import * as fs from 'fs';
import { RedisModule } from 'apps/common/src/redis/redis.module';
import { AuthController } from './auth/auth.controller';
import { VerificationController } from './verification/verification.controller';
import { SearchAndCatalogController } from './search-and-catalog/search-and-catalog.controller';
import { BookingController } from './booking/booking.controller';
import { TripsController } from './booking/trips.controller';
import { TripsGateway } from './booking/trips.gateway';
import { RatingController } from './rating/rating.controller';
import { CommunicationController } from './communication/communication.controller';
import { AdminCommunicationController } from './communication/admin-communication.controller';
import { DiscountController } from './discount/discount.controller';
import {
  assertAuthServiceProtoExists,
  AUTH_SERVICE_PROTO_PATH,
} from '../../../libs/proto/auth-service.grpc-options';
import {
  assertVerificationServiceProtoExists,
  VERIFICATION_SERVICE_PROTO_PATH,
} from '../../../libs/proto/verification.grpc-options';
import {
  assertSearchAndCatalogServiceProtoExists,
  SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
} from '../../../libs/proto/search-and-catalog.grpc-options';
import {
  assertBookingServiceProtoExists,
  BOOKING_SERVICE_PROTO_PATH,
} from '../../../libs/proto/booking.grpc-options';
import {
  assertRatingServiceProtoExists,
  RATING_SERVICE_PROTO_PATH,
} from '../../../libs/proto/rating.grpc-options';
import {
  assertDiscountServiceProtoExists,
  DISCOUNT_SERVICE_PROTO_PATH,
} from '../../../libs/proto/discount.grpc-options';

import { CloudinaryModule } from './cloudinary/cloudinary.module';

assertAuthServiceProtoExists();
assertVerificationServiceProtoExists();
assertSearchAndCatalogServiceProtoExists();
assertBookingServiceProtoExists();
assertRatingServiceProtoExists();
assertDiscountServiceProtoExists();

const envFilePath =
  process.env.NODE_ENV?.trim() === 'production'
    ? '.env'
    : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    CloudinaryModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath,
    }),

    JwtModule.register({
      privateKey: fs.readFileSync(
        path.join(process.cwd(), 'secrets/private.pem'),
      ),
      publicKey: fs.readFileSync(
        path.join(process.cwd(), 'secrets/public.pem'),
      ),
      signOptions: { algorithm: 'RS256' },
    }),
    RedisModule.registerAsync(),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: AUTH_SERVICE_PROTO_PATH,
          url: 'auth-service:50051',
        },
      },
      {
        name: 'VERIFICATION_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'verification',
          protoPath: VERIFICATION_SERVICE_PROTO_PATH,
          url: 'verification-service:50052',
        },
      },
      {
        name: 'SEARCH_AND_CATALOG_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'searchAndCatalog',
          protoPath: SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
          url: 'search-and-catalog-service:50055',
        },
      },
      {
        name: 'BOOKING_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'booking',
          protoPath: BOOKING_SERVICE_PROTO_PATH,
          url: 'booking-service:50053',
        },
      },
      {
        name: 'RATING_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'rating',
          protoPath: RATING_SERVICE_PROTO_PATH,
          url: 'rating-service:50054',
        },
      },
      {
        name: 'DISCOUNT_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'discount',
          protoPath: DISCOUNT_SERVICE_PROTO_PATH,
          url: process.env.DISCOUNT_SERVICE_URL || 'discount-service:50057',
        },
      },
    ]),
  ],
  controllers: [
    ApiGatewayController,
    AuthController,
    VerificationController,
    SearchAndCatalogController,
    BookingController,
    TripsController,
    RatingController,
    AdminCommunicationController,
    CommunicationController,
    DiscountController,
  ],

  providers: [ApiGatewayService, CommunicationGateway, TripsGateway],
})
export class ApiGatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: any, res: any, next: any) => {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
          console.log(
            `[GATEWAY REQUEST] ${req.method} & ${req.originalUrl || req.url}  - Body:`,
            JSON.stringify(req.body),
          );
        } else {
          console.log(
            `[GATEWAY REQUEST] ${req.method} & ${req.originalUrl || req.url} - multipart (body logged in controller)`,
          );
        }
        next();
      })
      .forRoutes('*');
  }
}
