import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'apps/common/src/redis/redis.service';

@Injectable()
export class PricingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async getPlatformFeePercent(): Promise<number> {
    const cached = await this.redisService.get('config:platform_fee_percent');
    if (cached !== null && cached !== undefined) {
      return parseFloat(cached);
    }
    return parseFloat(
      this.configService.get<string>('PLATFORM_FEE_PERCENT') || '0.15',
    );
  }

  async setPlatformFeePercent(percent: number): Promise<void> {
    await this.redisService.set(
      'config:platform_fee_percent',
      percent.toString(),
    );
  }

  async getPassengerSharePercent(): Promise<number> {
    const cached = await this.redisService.get(
      'config:passenger_share_percent',
    );
    if (cached !== null && cached !== undefined) {
      return parseFloat(cached);
    }
    return parseFloat(
      this.configService.get<string>('PASSENGER_SHARE_PERCENT') || '0.40',
    );
  }

  async setPassengerSharePercent(percent: number): Promise<void> {
    await this.redisService.set(
      'config:passenger_share_percent',
      percent.toString(),
    );
  }

  async getOwnerSharePercent(): Promise<number> {
    const cached = await this.redisService.get('config:owner_share_percent');
    if (cached !== null && cached !== undefined) {
      return parseFloat(cached);
    }
    return parseFloat(
      this.configService.get<string>('OWNER_SHARE_PERCENT') || '0.60',
    );
  }

  async setOwnerSharePercent(percent: number): Promise<void> {
    await this.redisService.set(
      'config:owner_share_percent',
      percent.toString(),
    );
  }

  getDistanceInKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async calculatePricing(
    totalDays: number,
    vehicle?: any,
    pickupLat?: number,
    pickupLng?: number,
    dropLat?: number,
    dropLng?: number,
    returnDatetime?: string,
    pickupDatetime?: string,
    discount = 0,
    tripType?: string,
    seatingCapacity?: any,
  ) {
    const platformPercent = await this.getPlatformFeePercent();
    const advancePercent = parseFloat(
      this.configService.get<string>('ADVANCE_PAYMENT_PERCENT') || '0.25',
    );

    // Seating capacity determination
    let seater = 5;
    const capacityVal =
      seatingCapacity !== undefined && seatingCapacity !== null
        ? seatingCapacity
        : vehicle?.seatingCapacity;
    if (capacityVal !== undefined && capacityVal !== null) {
      const capStr = String(capacityVal).toUpperCase();
      if (capStr === 'FOUR_FIVE' || capStr === '5') {
        seater = 5;
      } else if (capStr === 'SIX_SEVEN' || capStr === '7') {
        seater = 7;
      } else if (capStr === 'EIGHT_PLUS' || capStr === '10') {
        seater = 10;
      } else if (capStr === '15') {
        seater = 15;
      } else {
        const parsed = parseInt(capStr, 10);
        if (!isNaN(parsed)) {
          if (parsed <= 5) seater = 5;
          else if (parsed <= 7) seater = 7;
          else if (parsed <= 10) seater = 10;
          else seater = 15;
        }
      }
    }

    const typeStr = (tripType || '').toUpperCase();
    const isLocalOrInCity =
      typeStr.includes('IN_CITY') ||
      typeStr.includes('INCITY') ||
      typeStr.includes('CITY') ||
      typeStr.includes('LOCAL') ||
      typeStr === 'IC';
    // FIX: previously ONE_WAY and ROUND_TRIP both fell into a single "outstation"
    // branch and were priced identically. Distinguish them explicitly.
    const isRoundTrip = typeStr.includes('ROUND');
    const isOneWay = typeStr.includes('ONE');
    const isOutstation = !isLocalOrInCity;

    // FIX: normalize/derive rental days. If the client sends stale totalDays
    // (e.g. "1") but pickup/return datetimes span multiple days, trust the dates.
    let days = Math.max(1, Math.floor(Number(totalDays)) || 1);
    if (isRoundTrip && pickupDatetime && returnDatetime) {
      const startMs = new Date(pickupDatetime).getTime();
      const endMs = new Date(returnDatetime).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        const derivedDays = Math.ceil(
          (endMs - startMs) / (24 * 60 * 60 * 1000),
        );
        days = Math.max(days, derivedDays);
      }
    }
    if (isOneWay) {
      // A one-way transfer is a single-day, single-leg trip.
      days = 1;
    }

    let distance = 0;
    if (pickupLat && pickupLng && dropLat && dropLng) {
      distance = this.getDistanceInKm(
        Number(pickupLat),
        Number(pickupLng),
        Number(dropLat),
        Number(dropLng),
      );
    }

    let basePrice = 0;
    let nightStayCharge = 0;

    // Define base rental price/day based on capacity
    let perDayRate = 1000;
    if (seater === 7) {
      perDayRate = 1500;
    } else if (seater === 10) {
      perDayRate = 2000;
    } else if (seater === 15) {
      perDayRate = 3000;
    }

    if (isOutstation) {
      let perKmRate = 12;
      if (seater === 7) perKmRate = 14;
      else if (seater === 10) perKmRate = 20;
      else if (seater === 15) perKmRate = 25;

      // FIX: charge round-trip distance (2x) only for round trips. One-way
      // charges a single leg, optionally scaled by a configurable driver-return
      // multiplier (e.g. 1.3–1.5 if the driver deadheads back empty).
      const oneWayMultiplier = parseFloat(
        this.configService.get<string>('ONE_WAY_KM_MULTIPLIER') || '1',
      );
      const distanceCharge = isRoundTrip
        ? 2 * distance * perKmRate
        : distance * perKmRate * oneWayMultiplier;

      const baseVehicleRent = perDayRate * days;

      // Night stay applies only to multi-day round trips.
      const nights = isRoundTrip ? Math.max(0, days - 1) : 0;
      nightStayCharge = nights * 1000;

      basePrice = distanceCharge + baseVehicleRent + nightStayCharge;
    } else {
      // In-city: 10/km flat rate and base price/day
      const perKmRate = 10;
      basePrice = perDayRate * days + perKmRate * distance;
    }

    const basePriceRounded = Math.round(basePrice);
    const gst = 0;
    const passengerSharePercent = await this.getPassengerSharePercent();
    const ownerSharePercent = await this.getOwnerSharePercent();

    const totalPlatformFee = Math.round(basePriceRounded * platformPercent);
    const platformFee = Math.round(totalPlatformFee * passengerSharePercent); // Passenger's share added to bill
    const driverPlatformFee = totalPlatformFee - platformFee; // Driver/owner's share deducted from settlement
    const total = basePriceRounded + platformFee - discount;

    const advanceAmount = Math.round(total * advancePercent);
    const balanceAmount = total - advanceAmount;

    return {
      basePrice: basePriceRounded,
      gst,
      platformFee, // added to passenger's bill
      totalPlatformFee,
      driverPlatformFee,
      discount,
      total,
      advancePercentage: advancePercent * 100,
      advanceAmount,
      balanceAmount,
      currency: 'INR',
      seater,
      totalDays: days,
      tripType: isLocalOrInCity
        ? 'IN_CITY'
        : isRoundTrip
          ? 'ROUND_TRIP'
          : 'ONE_WAY',
      distanceKm: Math.round(distance * 100) / 100,
      ...(isOutstation ? { nightStayCharge } : {}),
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
