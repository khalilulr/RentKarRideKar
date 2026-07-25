import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { DiscountController } from './discount.controller';
import { OfferService } from './services/Offer.service';
import { OfferRepository } from './repositories/Offer.repository';
import { OfferHistoryRepository } from './repositories/OfferHistory.repository';
import { Offer } from './entities/Offer.entity';
import { OfferHistory } from './entities/OfferHistory.entity';
import { AUTH_SERVICE_PROTO_PATH } from '../../../libs/proto/auth-service.grpc-options';

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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DISCOUNT_DB_HOST') || 'localhost',
        port: configService.get<number>('DISCOUNT_DB_PORT') || 5439,
        username: configService.get<string>('DISCOUNT_DB_USER') || 'postgres',
        password:
          configService.get<string>('DISCOUNT_DB_PASSWORD') || 'ashif1234',
        database:
          configService.get<string>('DISCOUNT_DB_NAME') || 'rkrk_discount_db',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([Offer, OfferHistory]),
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
    ]),
  ],
  controllers: [DiscountController],
  providers: [OfferService, OfferRepository, OfferHistoryRepository],
})
export class DiscountModule {}
