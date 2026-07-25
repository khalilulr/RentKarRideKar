import { Test, TestingModule } from '@nestjs/testing';
import { SearchController } from './controller/search.controller';
import { SearchService } from './service/search.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VehicleEntity } from './entity/vehicle.entity';
import { CatalogService } from './service/catalog.service';
import { RedisService } from 'apps/common/src/redis/redis.service';

describe('SearchController', () => {
  let searchController: SearchController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        SearchService,
        {
          provide: getRepositoryToken(VehicleEntity),
          useValue: {},
        },
        {
          provide: CatalogService,
          useValue: {},
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    searchController = app.get<SearchController>(SearchController);
  });

  it('should be defined', () => {
    expect(searchController).toBeDefined();
  });
});
