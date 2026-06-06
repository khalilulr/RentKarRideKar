import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JwtModule } from '@nestjs/jwt';
import * as path from 'path';
import * as fs from 'fs';

import { RedisModule } from 'apps/common/src/redis/redis.module';
import { Cart } from './cart/entities/cart.entity';
import { CartItem } from './cart/entities/cart-item.entity';
import { Order } from './order/entities/order.entity';
import { OrderVehicle } from './order/entities/order-vehicle.entity';
import { OrderTimeline } from './order/entities/order-timeline.entity';
import { CartService } from './cart/cart.service';
import { OrderService } from './order/order.service';
import { PricingService } from './pricing/pricing.service';



import {
  assertAuthServiceProtoExists,
  AUTH_SERVICE_PROTO_PATH,
} from '../../../libs/proto/auth-service.grpc-options';
import {
  assertSearchAndCatalogServiceProtoExists,
  SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
} from '../../../libs/proto/search-and-catalog.grpc-options';
import {
  assertCommunicationServiceProtoExists,
  COMMUNICATION_SERVICE_PROTO_PATH,
} from '../../../libs/proto/communication.grpc-options';
import {
  assertDiscountServiceProtoExists,
  DISCOUNT_SERVICE_PROTO_PATH,
} from '../../../libs/proto/discount.grpc-options';

import { OrderGrpcService } from './order/services/order-grpc.service';
import { OrderCreationService } from './order/services/order-creation.service';
import { OrderQueryService } from './order/services/order-query.service';
import { OrderPaymentService } from './order/services/order-payment.service';
import { OrderOwnerService } from './order/services/order-owner.service';
import { OrderDriverService } from './order/services/order-driver.service';
import { OrderPassengerService } from './order/services/order-passenger.service';

assertAuthServiceProtoExists();
assertSearchAndCatalogServiceProtoExists();
assertCommunicationServiceProtoExists();
assertDiscountServiceProtoExists();

const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath,
    }),
    JwtModule.register({
      privateKey: fs.readFileSync(path.join(process.cwd(), 'secrets/private.pem')),
      publicKey: fs.readFileSync(path.join(process.cwd(), 'secrets/public.pem')),
      signOptions: { algorithm: 'RS256' },
    }),
    RedisModule.registerAsync(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('BOOKING_DB_HOST') || 'localhost',
        port: configService.get<number>('BOOKING_DB_PORT') || 5436,
        username: configService.get<string>('BOOKING_DB_USER') || 'postgres',
        password: configService.get<string>('BOOKING_DB_PASSWORD') || 'ashif1234',
        database: configService.get<string>('BOOKING_DB_NAME') || 'rkrk_booking_db',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([Cart, CartItem, Order, OrderVehicle, OrderTimeline]),
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
        name: 'SEARCH_AND_CATALOG_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'searchAndCatalog',
          protoPath: SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
          url: 'search-and-catalog-service:50055',
        },
      },
      {
        name: 'COMMUNICATION_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'communication',
          protoPath: COMMUNICATION_SERVICE_PROTO_PATH,
          url: 'communication-service:50054',
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
  controllers: [BookingController],
  providers: [
    BookingService,
    CartService,
    OrderService,
    PricingService,
    OrderGrpcService,
    OrderCreationService,
    OrderQueryService,
    OrderPaymentService,
    OrderOwnerService,
    OrderDriverService,
    OrderPassengerService,
  ],
})
export class BookingModule {}
