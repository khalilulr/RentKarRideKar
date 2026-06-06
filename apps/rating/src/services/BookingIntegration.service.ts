import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as microservices from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { BookingServiceClient, BOOKING_SERVICE_NAME } from '../../../../libs/types/booking';

@Injectable()
export class BookingIntegrationService implements OnModuleInit {
  private bookingService: BookingServiceClient;

  constructor(
    @Inject('BOOKING_SERVICE')
    private readonly client: microservices.ClientGrpc,
  ) {}

  onModuleInit() {
    this.bookingService = this.client.getService<BookingServiceClient>(BOOKING_SERVICE_NAME);
  }

  async getBooking(bookingId: string): Promise<any | null> {
    try {
      const response = (await lastValueFrom(
        this.bookingService.getBooking({ bookingId }),
      )) as any;
      if (!response || !response.id) return null;

      return {
        id: response.id,
        passengerId: response.passengerId,
        status: response.status,
        paymentStatus: response.paymentStatus,
        advanceAmount: Number(response.advanceAmount),
        totalAmount: Number(response.totalAmount),
        createdAt: new Date(response.createdAt),
        tripStartDate: new Date(response.tripStartDate),
      };
    } catch (error) {
      return null;
    }
  }

  async getOrderVehicles(bookingId: string): Promise<any[]> {
    try {
      const response = (await lastValueFrom(
        this.bookingService.getOrderVehicles({ bookingId }),
      )) as any;
      if (!response || !response.vehicles) return [];

      return response.vehicles.map((v: any) => ({
        id: v.id,
        order_id: v.orderId,
        orderId: v.orderId,
        vehicle_id: v.vehicleId,
        vehicleId: v.vehicleId,
        owner_id: v.ownerId,
        ownerId: v.ownerId,
        status: v.status,
        price: Number(v.price),
        completed_at: v.completedAt ? new Date(v.completedAt) : null,
        completedAt: v.completedAt ? new Date(v.completedAt) : null,
      }));
    } catch (error) {
      return [];
    }
  }

  async updateBookingStatus(bookingId: string, status: string, visibleStatus: string): Promise<void> {
    try {
      await lastValueFrom(
        this.bookingService.updateBookingStatus({
          bookingId,
          status,
          visibleStatus,
        }),
      );
    } catch (error) {
      // Handle or ignore if expected
    }
  }
}
