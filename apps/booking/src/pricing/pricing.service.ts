import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PricingService {
  constructor(private readonly configService: ConfigService) {}

  calculatePricing(totalDays: number) {
    const platformPercent = parseFloat(
      this.configService.get<string>('PLATFORM_FEE_PERCENT') || '0.03',
    );
    const advancePercent = parseFloat(
      this.configService.get<string>('ADVANCE_PAYMENT_PERCENT') || '0.25',
    );
    
    const DRIVER_DAILY_FEE = 300;
    const BASE_DAILY_FARE = 2160;
    const GST_FEE_PERCENT = 0.024; // 2.4%

    const baseFare = BASE_DAILY_FARE * totalDays;
    const driverFees = DRIVER_DAILY_FEE * totalDays;
    const platformFee = Math.round((baseFare + driverFees) * platformPercent);
    const gst = Math.round((baseFare + driverFees) * GST_FEE_PERCENT);

    const total = baseFare + driverFees + platformFee + gst;
    const advanceRequired = Math.round(total * advancePercent);
    const yourEarnings = Math.round(total * (1 - platformPercent));

    return {
      total,
      breakdown: {
        baseFare,
        driverFees,
        platformFee,
        gst,
      },
      advanceRequired,
      yourEarnings,
    };
  }

  getCartExpiryDurationMs(): number {
    const hours = parseFloat(
      this.configService.get<string>('CART_EXPIRY_HOURS') || '2',
    );
    return hours * 60 * 60 * 1000;
  }

  getOwnerResponseDeadlineMs(): number {
    const minutes = parseFloat(
      this.configService.get<string>('OWNER_RESPONSE_TIMEOUT_MINUTES') || '30',
    );
    return minutes * 60 * 1000;
  }
}
