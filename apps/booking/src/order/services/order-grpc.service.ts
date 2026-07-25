import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  SearchAndCatalogServiceClient,
  SEARCH_AND_CATALOG_SERVICE_NAME,
} from 'libs/types/search-and-catalog';
import { AuthServiceClient, AUTH_SERVICE_NAME } from 'libs/types/auth-service';
import {
  CommunicationServiceClient,
  COMMUNICATION_SERVICE_NAME,
} from 'libs/types/communication';
import {
  DiscountServiceClient,
  DISCOUNT_SERVICE_NAME,
} from 'libs/types/discount';

@Injectable()
export class OrderGrpcService implements OnModuleInit {
  private searchAndCatalogService: SearchAndCatalogServiceClient;
  private authService: AuthServiceClient;
  private communicationService: CommunicationServiceClient;
  private discountService: DiscountServiceClient;

  constructor(
    @Inject('SEARCH_AND_CATALOG_SERVICE')
    private readonly searchClient: ClientGrpc,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientGrpc,
    @Inject('COMMUNICATION_SERVICE')
    private readonly communicationClient: ClientGrpc,
    @Inject('DISCOUNT_SERVICE') private readonly discountClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.searchAndCatalogService =
      this.clientGetService<SearchAndCatalogServiceClient>(
        this.searchClient,
        SEARCH_AND_CATALOG_SERVICE_NAME,
      );
    this.authService = this.clientGetService<AuthServiceClient>(
      this.authClient,
      AUTH_SERVICE_NAME,
    );
    this.communicationService =
      this.clientGetService<CommunicationServiceClient>(
        this.communicationClient,
        COMMUNICATION_SERVICE_NAME,
      );
    this.discountService = this.clientGetService<DiscountServiceClient>(
      this.discountClient,
      DISCOUNT_SERVICE_NAME,
    );
  }

  private clientGetService<T extends object>(
    client: ClientGrpc,
    name: string,
  ): T {
    try {
      return client.getService<T>(name);
    } catch (e) {
      return {} as T;
    }
  }

  async isVehicleAvailable(
    vehicleId: string,
    startDate: string,
    endDate: string,
  ) {
    try {
      if (
        this.searchAndCatalogService &&
        typeof this.searchAndCatalogService.isVehicleAvailable === 'function'
      ) {
        return await lastValueFrom(
          this.searchAndCatalogService.isVehicleAvailable({
            vehicleId,
            startDate,
            endDate,
          }),
        );
      }
    } catch (e) {
      console.error(
        '[SearchCatalogService] Failed to check vehicle availability:',
        e,
      );
    }
    return { isAvailable: true };
  }

  async getVehicleById(vehicleId: string) {
    try {
      if (
        this.searchAndCatalogService &&
        typeof this.searchAndCatalogService.getVehicleById === 'function'
      ) {
        return await lastValueFrom(
          this.searchAndCatalogService.getVehicleById({ id: vehicleId }),
        );
      }
    } catch (e) {
      console.error(
        '[SearchCatalogService] Failed to fetch vehicle details:',
        e,
      );
    }
    return null;
  }

  async getMe(userId: string) {
    try {
      if (this.authService && typeof this.authService.getMe === 'function') {
        return await lastValueFrom(this.authService.getMe({ userId }));
      }
    } catch (e) {
      console.error('[AuthService] Failed to get user profile details:', e);
    }
    return null;
  }

  async checkTrustedDriver(
    ownerId: string,
    driverId: string,
  ): Promise<boolean> {
    try {
      if (
        this.authService &&
        typeof this.authService.checkTrustedDriver === 'function'
      ) {
        const response = await lastValueFrom(
          this.authService.checkTrustedDriver({ ownerId, driverId }),
        );
        return response ? response.isTrusted : false;
      }
    } catch (e) {
      console.error('[AuthService] Failed to check trusted driver status:', e);
    }
    return false;
  }

  async triggerOpenChatRooms(
    bookingId: string,
    passengerId: string,
    driverId: string,
    ownerId: string,
  ) {
    try {
      if (
        this.communicationService &&
        typeof this.communicationService.openChatRooms === 'function'
      ) {
        const response = await lastValueFrom(
          this.communicationService.openChatRooms({
            bookingId,
            passengerId,
            driverId,
            ownerId,
          }),
        );
        if (response && response.passengerDriverRoomId) {
          return response;
        }
      }
    } catch (e: any) {
      console.error(
        '[CommunicationService] Failed to open chat rooms via gRPC:',
        e?.message,
      );
    }

    return {
      passengerDriverRoomId: null,
      passengerOwnerRoomId: null,
      success: false,
    };
  }

  async triggerDeactivateProxy(bookingId: string, reason: string) {
    try {
      if (
        this.communicationService &&
        typeof this.communicationService.deactivateCallProxy === 'function'
      ) {
        await lastValueFrom(
          this.communicationService.deactivateCallProxy({ bookingId, reason }),
        );
      }
    } catch (e: any) {
      console.error(
        '[CommunicationService] Failed to deactivate proxy via gRPC:',
        e?.message,
      );
    }
  }

  async closeChatRooms(bookingId: string) {
    try {
      if (
        this.communicationService &&
        typeof this.communicationService.closeChatRooms === 'function'
      ) {
        await lastValueFrom(
          this.communicationService.closeChatRooms({ bookingId }),
        );
      }
    } catch (e: any) {
      console.error(
        '[CommunicationService] Failed to close chat rooms:',
        e?.message,
      );
    }
  }

  async sendNotification(
    userId: string,
    title: string,
    content: string,
    channel: string,
    delayMinutes = 0,
    externalId?: string,
  ) {
    try {
      if (
        this.communicationService &&
        typeof this.communicationService.sendNotification === 'function'
      ) {
        await lastValueFrom(
          this.communicationService.sendNotification({
            userId,
            title,
            content,
            channel,
            delayMinutes,
            externalId: externalId || '',
          }),
        );
      }
    } catch (e: any) {
      console.error(
        '[CommunicationService] Failed to send notification via gRPC:',
        e?.message,
      );
    }
  }

  async cancelNotification(externalId: string) {
    try {
      if (
        this.communicationService &&
        typeof this.communicationService.cancelNotification === 'function'
      ) {
        await lastValueFrom(
          this.communicationService.cancelNotification({ externalId }),
        );
      }
    } catch (e: any) {
      console.error(
        '[CommunicationService] Failed to cancel notification via gRPC:',
        e?.message,
      );
    }
  }

  async validateCode(code: string, userId: string, originalPrice: number) {
    try {
      if (
        this.discountService &&
        typeof this.discountService.validateCode === 'function'
      ) {
        return await lastValueFrom(
          this.discountService.validateCode({ code, userId, originalPrice }),
        );
      }
    } catch (e: any) {
      console.error(
        '[DiscountService] Failed to validate offer code:',
        e?.message,
      );
    }
    return {
      isValid: false,
      discountedPrice: originalPrice,
      discountAmount: 0,
      message: 'Discount service unavailable.',
    };
  }

  async recordOfferUsage(
    userId: string,
    code: string,
    bookingId: string,
    discountAmount: number,
  ) {
    try {
      if (
        this.discountService &&
        typeof this.discountService.recordOfferUsage === 'function'
      ) {
        await lastValueFrom(
          this.discountService.recordOfferUsage({
            userId,
            code,
            bookingId,
            discountAmount,
          }),
        );
      }
    } catch (e: any) {
      console.error(
        '[DiscountService] Failed to record offer usage:',
        e?.message,
      );
    }
  }
}
