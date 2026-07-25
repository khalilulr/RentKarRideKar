import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;
  let redisServiceMock: any;
  let configServiceMock: any;

  beforeEach(async () => {
    redisServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: RedisService, useValue: redisServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
  });

  it('should calculate pricing with default 15% platform fee, 40% passenger share, 60% driver share, and 0 GST', async () => {
    // Mock Redis returning null so it falls back to defaults
    redisServiceMock.get.mockResolvedValue(null);
    configServiceMock.get.mockReturnValue(null);

    const result = await service.calculatePricing(
      1, // totalDays
      { seatingCapacity: 5 }, // vehicle (perDayRate = 1000)
      undefined,
      undefined,
      undefined,
      undefined, // lat/lng
      undefined,
      undefined, // pickup/return datetime
      0, // discount
      'IN_CITY', // tripType (In-city base = perDayRate * days = 1000)
    );

    // Assertions:
    // Base Price = 1000
    // GST = 0
    // Total Platform Fee = 15% of 1000 = 150
    // Passenger share = 40% of 150 = 60 (this is the platformFee field)
    // Driver share = 150 - 60 = 90 (driverPlatformFee field)
    // Total = Base Price (1000) + Passenger share (60) - discount (0) = 1060
    expect(result.basePrice).toBe(1000);
    expect(result.gst).toBe(0);
    expect(result.totalPlatformFee).toBe(150);
    expect(result.platformFee).toBe(60);
    expect(result.driverPlatformFee).toBe(90);
    expect(result.total).toBe(1060);
    expect(result.advanceAmount).toBe(Math.round(1060 * 0.25));
    expect(result.balanceAmount).toBe(1060 - Math.round(1060 * 0.25));
  });

  it('should use custom configuration from Redis (20% fee, 40/60 split)', async () => {
    // Configured for 20% platform fee, 40% passenger share, 60% driver share
    redisServiceMock.get.mockImplementation(async (key: string) => {
      if (key === 'config:platform_fee_percent') return '0.20';
      if (key === 'config:passenger_share_percent') return '0.40';
      if (key === 'config:owner_share_percent') return '0.60';
      return null;
    });

    const result = await service.calculatePricing(
      1,
      { seatingCapacity: 5 },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      'IN_CITY',
    );

    // Base Price = 1000
    // GST = 0
    // Total Platform Fee = 20% of 1000 = 200
    // Passenger share = 40% of 200 = 80
    // Driver share = 200 - 80 = 120
    // Total = 1000 + 80 = 1080
    expect(result.basePrice).toBe(1000);
    expect(result.gst).toBe(0);
    expect(result.totalPlatformFee).toBe(200);
    expect(result.platformFee).toBe(80);
    expect(result.driverPlatformFee).toBe(120);
    expect(result.total).toBe(1080);
  });
});
