import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { OfferRepository } from '../repositories/Offer.repository';
import { OfferHistoryRepository } from '../repositories/OfferHistory.repository';
import { Offer } from '../entities/Offer.entity';
import { OfferHistory } from '../entities/OfferHistory.entity';
import {
  AuthServiceClient,
  AUTH_SERVICE_NAME,
} from '../../../../libs/types/auth-service';

@Injectable()
export class OfferService implements OnModuleInit {
  private authService: AuthServiceClient;

  constructor(
    private readonly offerRepo: OfferRepository,
    private readonly offerHistoryRepo: OfferHistoryRepository,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.authService =
      this.authClient.getService<AuthServiceClient>(AUTH_SERVICE_NAME);
  }

  async createOffer(offerData: {
    code: string;
    type: string;
    value: number;
    conditions?: { firstBookingOnly?: boolean; minBookingAmount?: number };
    description?: string;
  }): Promise<Offer> {
    const { code, type, value, conditions, description } = offerData;
    return this.offerRepo.create({
      code,
      type,
      value,
      firstBookingOnly: conditions?.firstBookingOnly || false,
      minBookingAmount: conditions?.minBookingAmount || 0,
      description,
      isActive: true,
    });
  }

  async toggleOffer(
    id: string,
    isActive: boolean,
  ): Promise<Offer & { usageCount: number }> {
    const offer = await this.offerRepo.findById(id);
    if (!offer) {
      throw new Error('Offer not found');
    }
    offer.isActive = isActive;
    const saved = await this.offerRepo.save(offer);
    const usageCount = await this.offerHistoryRepo.countByOfferCode(saved.code);
    return {
      ...saved,
      usageCount,
    };
  }

  async listOffers(
    filter: 'active' | 'inactive' | 'all',
  ): Promise<(Offer & { usageCount: number })[]> {
    const offers = await this.offerRepo.findAll(filter);
    const usageCounts = await this.offerHistoryRepo.getUsageCounts();
    return offers.map((offer) => {
      const codeKey = offer.code.toLowerCase();
      return {
        ...offer,
        usageCount: usageCounts[codeKey] || 0,
      } as Offer & { usageCount: number };
    });
  }

  async validateCode(
    code: string,
    userId: string,
    originalPrice: number,
  ): Promise<{
    isValid: boolean;
    discountedPrice: number;
    discountAmount: number;
    message: string;
  }> {
    const offer = await this.offerRepo.findByCode(code);
    if (!offer || !offer.isActive) {
      return {
        isValid: false,
        discountedPrice: originalPrice,
        discountAmount: 0,
        message: 'Invalid or expired offer code.',
      };
    }

    // Check minimum booking amount condition
    const minBookingAmount = Number(offer.minBookingAmount);
    if (originalPrice < minBookingAmount) {
      return {
        isValid: false,
        discountedPrice: originalPrice,
        discountAmount: 0,
        message: `Min booking amount of Rs. ${minBookingAmount} is required for this offer.`,
      };
    }

    // Check first booking condition
    if (offer.firstBookingOnly) {
      const historyCount = await this.offerHistoryRepo.countByUserId(userId);
      if (historyCount > 0) {
        return {
          isValid: false,
          discountedPrice: originalPrice,
          discountAmount: 0,
          message: 'This offer is only valid for your first booking.',
        };
      }
    }

    // Calculate discount amount
    const val = Number(offer.value);
    let discountAmount = 0;
    if (offer.type === 'percentage') {
      discountAmount = Math.round(originalPrice * (val / 100));
    } else {
      // flat discount
      discountAmount = Math.min(val, originalPrice);
    }

    const discountedPrice = Math.max(0, originalPrice - discountAmount);

    return {
      isValid: true,
      discountedPrice,
      discountAmount,
      message: 'Code applied successfully!',
    };
  }

  async checkEligibility(
    userId: string,
    originalPrice: number,
  ): Promise<Offer[]> {
    const activeOffers = await this.offerRepo.findAll('active');
    const eligibleOffers: Offer[] = [];

    const historyCount = await this.offerHistoryRepo.countByUserId(userId);

    for (const offer of activeOffers) {
      const minBookingAmount = Number(offer.minBookingAmount);
      if (originalPrice < minBookingAmount) {
        continue;
      }

      if (offer.firstBookingOnly && historyCount > 0) {
        continue;
      }

      eligibleOffers.push(offer);
    }

    return eligibleOffers;
  }

  async getOfferHistory(userId: string): Promise<OfferHistory[]> {
    return this.offerHistoryRepo.findByUserId(userId);
  }

  async recordOfferUsage(
    userId: string,
    code: string,
    bookingId: string,
    discountAmount: number,
  ): Promise<boolean> {
    await this.offerHistoryRepo.recordUsage({
      userId,
      offerCode: code,
      bookingId,
      discountAmount,
    });
    return true;
  }

  async applyReferral(
    referralCode: string,
    userId: string,
  ): Promise<{
    success: boolean;
    message: string;
    discountAmount: number;
  }> {
    try {
      if (
        this.authService &&
        typeof this.authService.validateReferralCode === 'function'
      ) {
        const response = await lastValueFrom(
          this.authService.validateReferralCode({ referralCode, userId }),
        );
        if (response && response.isValid) {
          return {
            success: true,
            message: 'Referral applied successfully',
            discountAmount: 50,
          };
        }
      }
    } catch (e: any) {
      console.error(
        '[OfferService] Failed to validate referral code via gRPC:',
        e?.message,
      );
    }

    return {
      success: false,
      message: 'Invalid referral code',
      discountAmount: 0,
    };
  }
}
