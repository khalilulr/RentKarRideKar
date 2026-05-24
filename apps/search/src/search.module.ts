import { Module } from '@nestjs/common';
import { SearchController } from './controller/search.controller';
import { SearchService } from './service/search.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './controller/Catalog.controller';
import { CatalogService } from './service/catalog.service';
import { VehicleEntity } from './entity/vehicle.entity';
import { VehicleBlockEntity } from './entity/vehicle-unavailability.entity';

const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    TypeOrmModule.forFeature([VehicleEntity, VehicleBlockEntity]),
    ConfigModule.forRoot({ isGlobal: true, envFilePath }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('CATALOG_DB_HOST'),
        port: configService.get<number>('CATALOG_DB_PORT'),
        username: configService.get<string>('CATALOG_DB_USER'),
        password: configService.get<string>('CATALOG_DB_PASSWORD'),
        database: configService.get<string>('CATALOG_DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
  ],
  controllers: [
    SearchController,
    CatalogController,
  ],

  providers: [
    SearchService,
    CatalogService,
  ],

  exports: [
    SearchService,
    CatalogService,
  ],
})
export class SearchModule { }
