import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DiscountController } from './discount.controller';
import { OfferService } from './services/Offer.service';
import { OfferRepository } from './repositories/Offer.repository';
import { OfferHistoryRepository } from './repositories/OfferHistory.repository';
import { Offer } from './entities/Offer.entity';
import { OfferHistory } from './entities/OfferHistory.entity';

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
        password: configService.get<string>('DISCOUNT_DB_PASSWORD') || 'ashif1234',
        database: configService.get<string>('DISCOUNT_DB_NAME') || 'rkrk_discount_db',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    TypeOrmModule.forFeature([Offer, OfferHistory]),
  ],
  controllers: [DiscountController],
  providers: [
    OfferService,
    OfferRepository,
    OfferHistoryRepository,
  ],
})
export class DiscountModule {}
