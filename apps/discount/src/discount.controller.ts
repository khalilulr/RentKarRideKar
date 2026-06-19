import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { OfferService } from './services/Offer.service';

@Controller()
export class DiscountController {
  constructor(private readonly offerService: OfferService) {}

  @GrpcMethod('DiscountService', 'CreateOffer')
  async createOffer(request: any) {
    const offer = await this.offerService.createOffer(request);
    return {
      success: true,
      offer: {
        id: offer.id,
        code: offer.code,
        type: offer.type,
        value: Number(offer.value),
        isActive: offer.isActive,
        conditions: {
          firstBookingOnly: offer.firstBookingOnly,
          minBookingAmount: Number(offer.minBookingAmount),
        },
        description: offer.description || '',
        usageCount: 0,
      },
    };
  }

  @GrpcMethod('DiscountService', 'ToggleOffer')
  async toggleOffer(request: any) {
    const offer = await this.offerService.toggleOffer(request.id, request.isActive);
    return {
      success: true,
      offer: {
        id: offer.id,
        code: offer.code,
        type: offer.type,
        value: Number(offer.value),
        isActive: offer.isActive,
        conditions: {
          firstBookingOnly: offer.firstBookingOnly,
          minBookingAmount: Number(offer.minBookingAmount),
        },
        description: offer.description || '',
        usageCount: offer.usageCount || 0,
      },
    };
  }

  @GrpcMethod('DiscountService', 'ListOffers')
  async listOffers(request: any) {
    const filter = request.filter || 'all';
    const offers = await this.offerService.listOffers(filter);
    const mapped = offers.map(offer => ({
      id: offer.id,
      code: offer.code,
      type: offer.type,
      value: Number(offer.value),
      isActive: offer.isActive,
      conditions: {
        firstBookingOnly: offer.firstBookingOnly,
        minBookingAmount: Number(offer.minBookingAmount),
      },
      description: offer.description || '',
      usageCount: offer.usageCount || 0,
    }));
    return { offers: mapped };
  }

  @GrpcMethod('DiscountService', 'ValidateCode')
  async validateCode(request: any) {
    const res = await this.offerService.validateCode(
      request.code,
      request.userId,
      request.originalPrice,
    );
    return res;
  }

  @GrpcMethod('DiscountService', 'CheckEligibility')
  async checkEligibility(request: any) {
    const offers = await this.offerService.checkEligibility(
      request.userId,
      request.originalPrice,
    );
    const mapped = offers.map(offer => ({
      id: offer.id,
      code: offer.code,
      type: offer.type,
      value: Number(offer.value),
      isActive: offer.isActive,
      conditions: {
        firstBookingOnly: offer.firstBookingOnly,
        minBookingAmount: Number(offer.minBookingAmount),
      },
      description: offer.description || '',
      usageCount: 0,
    }));
    return { eligibleOffers: mapped };
  }

  @GrpcMethod('DiscountService', 'GetOfferHistory')
  async getOfferHistory(request: any) {
    const history = await this.offerService.getOfferHistory(request.userId);
    const mapped = history.map(item => ({
      id: item.id,
      offerCode: item.offerCode,
      bookingId: item.bookingId,
      discountAmount: Number(item.discountAmount),
      usedAt: item.usedAt.toISOString(),
    }));
    return { history: mapped };
  }

  @GrpcMethod('DiscountService', 'RecordOfferUsage')
  async recordOfferUsage(request: any) {
    const success = await this.offerService.recordOfferUsage(
      request.userId,
      request.code,
      request.bookingId,
      request.discountAmount,
    );
    return { success };
  }
}
