import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Inject,
  OnModuleInit,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, map, firstValueFrom, tap } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from '../auth/guards/vehicle_owner.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RedisService } from 'apps/common/src/redis/redis.service';
import {
  BookingServiceClient,
  BOOKING_SERVICE_NAME,
} from '../../../../libs/types/booking';
import { CommunicationGateway } from '../communication/communication.gateway';

@Controller()
export class BookingController implements OnModuleInit {
  private bookingService: BookingServiceClient;

  constructor(
    @Inject('BOOKING_SERVICE') private readonly client: ClientGrpc,
    private readonly redisService: RedisService,
    private readonly communicationGateway: CommunicationGateway,
  ) {}

  onModuleInit() {
    this.bookingService =
      this.client.getService<BookingServiceClient>(BOOKING_SERVICE_NAME);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Cart Endpoints
  // ─────────────────────────────────────────────────────────────

  @Post('cart/items')
  @UseGuards(JwtAuthGuard)
  addToCart(@CurrentUser() user: any, @Body() body: any): Observable<any> {
    return this.bookingService.addToCart({
      passengerId: user.userId,
      ...body,
    });
  }

  @Get('cart')
  @UseGuards(JwtAuthGuard)
  viewCart(
    @CurrentUser() user: any,
    @Query('promoCode') promoCode?: string,
  ): Observable<any> {
    return this.bookingService.viewCart({
      passengerId: user.userId,
      promoCode: promoCode || '',
    });
  }

  @Delete('cart/items/:cartItemId')
  @UseGuards(JwtAuthGuard)
  removeCartItem(
    @CurrentUser() user: any,
    @Param('cartItemId') cartItemId: string,
  ): Observable<any> {
    return this.bookingService.removeCartItem({
      passengerId: user.userId,
      cartItemId,
    });
  }

  @Delete('cart')
  @UseGuards(JwtAuthGuard)
  clearCart(@CurrentUser() user: any): Observable<any> {
    return this.bookingService.clearCart({
      passengerId: user.userId,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Order Endpoints
  // ─────────────────────────────────────────────────────────────

  @Post('orders')
  @UseGuards(JwtAuthGuard)
  createOrder(@CurrentUser() user: any, @Body() body: any): Observable<any> {
    return this.bookingService
      .createOrder({
        passengerId: user.userId,
        ...body,
      })
      .pipe(
        tap((order) => {
          try {
            if (order && order.vehicles && Array.isArray(order.vehicles)) {
              for (const v of order.vehicles) {
                if (v.owner && v.owner.id) {
                  this.communicationGateway.sendNotificationToUser(
                    v.owner.id,
                    'newBookingRequest',
                    {
                      orderId: order.orderId,
                      status: order.status,
                      visibleStatus: order.visibleStatus,
                      vehicle: v.vehicle,
                      price: v.price,
                      ownerResponseDeadline: v.ownerResponseDeadline,
                      createdAt: order.createdAt,
                    },
                  );
                }
              }
            }
          } catch (err: any) {
            console.error(
              '[BookingController] Failed to dispatch real-time booking request notification:',
              err.message,
            );
          }
        }),
      );
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  listOrders(
    @CurrentUser() user: any,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.bookingService.listOrders({
      userId: user.userId,
      role: role || '',
      status: status || '',
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get('my-trips')
  @UseGuards(JwtAuthGuard)
  getMyTrips(
    @CurrentUser() user: any,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.bookingService.listOrders({
      userId: user.userId,
      role: role || '',
      status: status || '',
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get('orders/:orderId')
  @UseGuards(JwtAuthGuard)
  getOrderDetails(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.getOrderDetails({
      orderId,
      userId: user.userId,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Owner Response Workflows (Secured with VehicleOwnerGuard)
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/vehicles/:vehicleId/accept')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  ownerAccept(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .ownerAccept({
        orderId,
        vehicleId,
        ownerId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/reject')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  ownerReject(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .ownerReject({
        orderId,
        vehicleId,
        ownerId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/remove-driver')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  removeDriver(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.ownerRemoveDriver({
      orderId,
      vehicleId,
      ownerId: user.userId,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Driver Response Workflows
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/vehicles/:vehicleId/driver-accept')
  @UseGuards(JwtAuthGuard)
  driverAccept(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .driverAccept({
        orderId,
        vehicleId,
        driverId: user.userId,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/driver-reject')
  @UseGuards(JwtAuthGuard)
  driverReject(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .driverReject({
        orderId,
        vehicleId,
        driverId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Get('orders/:orderId/vehicles/:vehicleId/driver-trip')
  @UseGuards(JwtAuthGuard)
  getDriverTrip(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .getDriverTrip({
        orderId,
        vehicleId,
        driverId: user.userId,
      })
      .pipe(
        map((res) => {
          if (res && res.passenger) {
            delete res.passenger.rating;
          }
          return res;
        }),
      );
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Trip Execution
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/vehicles/:vehicleId/arrive')
  @UseGuards(JwtAuthGuard)
  driverArrive(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .driverArrive({
        orderId,
        vehicleId,
        driverId: user.userId,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/verify-otp')
  @UseGuards(JwtAuthGuard)
  verifyOtp(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .verifyOtp({
        orderId,
        vehicleId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/complete')
  @UseGuards(JwtAuthGuard)
  completeVehicleTrip(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .completeVehicleTrip({
        orderId,
        vehicleId,
        driverId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Complete Entire Order (Internal System call)
  // ─────────────────────────────────────────────────────────────
  @Post('orders/:orderId/complete')
  completeOrder(@Param('orderId') orderId: string): Observable<any> {
    return this.bookingService
      .completeOrder({
        orderId,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId)));
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Cancellations
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelOrder(
    @Param('orderId') orderId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .cancelOrder({
        orderId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/vehicles/:vehicleId/owner-cancel')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  ownerCancelVehicle(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .ownerCancelVehicle({
        orderId,
        vehicleId,
        ownerId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Post('orders/:orderId/confirm-payment')
  @UseGuards(JwtAuthGuard)
  confirmPayment(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .confirmPayment({
        orderId,
      })
      .pipe(
        tap(() => this.broadcastBookingUpdate(orderId, user.userId)),
        map((res: any) => {
          if (res.chatRoomsJson) {
            try {
              res.chatRooms = JSON.parse(res.chatRoomsJson);
              delete res.chatRoomsJson;
            } catch (e) {}
          }
          return res;
        }),
      );
  }

  @Post('orders/:orderId/complete-payment')
  @UseGuards(JwtAuthGuard)
  completePayment(
    @Param('orderId') orderId: string,
    @Body() body: { paidAmount: number; transactionId: string },
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService
      .completePayment({
        orderId,
        passengerId: user.userId,
        paidAmount: body.paidAmount,
        transactionId: body.transactionId,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Live Location Tracking
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/location')
  @UseGuards(JwtAuthGuard)
  async updateLocation(
    @Param('orderId') orderId: string,
    @Body() body: { latitude: number; longitude: number },
    @CurrentUser() user: any,
  ) {
    const role = user.activePerspective || user.role;
    if (!role) {
      throw new BadRequestException('User role or perspective is required');
    }
    const key = `location:order:${orderId}:${role.toLowerCase()}`;
    const timestamp = new Date().toISOString();
    const value = JSON.stringify({
      latitude: body.latitude,
      longitude: body.longitude,
      updatedAt: timestamp,
    });

    // Store in Redis with 2 hours (7200s) TTL
    await this.redisService.set(key, value, 7200);

    return {
      success: true,
      message: 'Location updated successfully',
      data: {
        orderId,
        userId: user.userId,
        role,
        latitude: body.latitude,
        longitude: body.longitude,
        updatedAt: timestamp,
      },
    };
  }

  @Get('orders/:orderId/tracking')
  @UseGuards(JwtAuthGuard)
  async getTracking(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ) {
    const driverLocKey = `location:order:${orderId}:driver`;
    const passengerLocKey = `location:order:${orderId}:passenger`;

    const [driverLocRaw, passengerLocRaw] = await Promise.all([
      this.redisService.get(driverLocKey),
      this.redisService.get(passengerLocKey),
    ]);

    const driverLocation = driverLocRaw ? JSON.parse(driverLocRaw) : null;
    const passengerLocation = passengerLocRaw
      ? JSON.parse(passengerLocRaw)
      : null;

    let tripStatus = 'UNKNOWN';
    try {
      const orderDetails = await firstValueFrom(
        this.bookingService.getOrderDetails({ orderId, userId: user.userId }),
      );
      tripStatus = orderDetails?.status || 'UNKNOWN';
    } catch (err: any) {
      console.error(`Error fetching order status: ${err.message}`);
    }

    return {
      orderId,
      tripStatus,
      driverLocation,
      passengerLocation,
    };
  }

  @Post('orders/:orderId/vehicles/:vehicleId/assign-driver')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  assignDriver(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.bookingService
      .assignDriver({
        orderId,
        vehicleId,
        ownerId: user.userId,
        ...body,
      })
      .pipe(tap(() => this.broadcastBookingUpdate(orderId, user.userId)));
  }

  @Get('owner/earnings')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  getOwnerEarnings(
    @CurrentUser() user: any,
    @Query('period') period?: string,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ): Observable<any> {
    return this.bookingService.getOwnerEarnings({
      ownerId: user.userId,
      period: period || 'MONTHLY',
      year: year ? parseInt(year, 10) : new Date().getFullYear(),
      month: month ? parseInt(month, 10) : new Date().getMonth() + 1,
    });
  }

  @Get('owner/payouts')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  getPayoutHistory(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    return this.bookingService.getPayoutHistory({
      ownerId: user.userId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get('owner/earnings/statement')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  downloadEarningsStatement(
    @CurrentUser() user: any,
    @Query('year') year?: string,
  ): Observable<any> {
    return this.bookingService.downloadEarningsStatement({
      ownerId: user.userId,
      year: year ? parseInt(year, 10) : new Date().getFullYear(),
    });
  }

  @Get('driver/earnings')
  @UseGuards(JwtAuthGuard)
  getDriverEarnings(
    @CurrentUser() user: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    return this.bookingService.getDriverEarnings({
      driverId: user.userId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Get('driver/my-trips')
  @UseGuards(JwtAuthGuard)
  getDriverMyTrips(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.bookingService
      .getDriverMyTrips({
        driverId: user.userId,
        status: status || '',
        page: pageNum,
        limit: limitNum,
      })
      .pipe(
        map((res) => {
          if (res && res.data) {
            res.data = res.data.map((trip: any) => {
              if (trip.passenger) {
                delete trip.passenger.rating;
              }
              return trip;
            });
          }
          return res;
        }),
      );
  }

  @Post('orders/:orderId/disputes')
  @UseGuards(JwtAuthGuard)
  raiseDispute(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    const role = user.activePerspective || user.role;
    if (!role) {
      throw new BadRequestException('User role or perspective is required');
    }
    return this.bookingService.raiseDispute({
      orderId,
      userId: user.userId,
      raisedBy: role,
      ...body,
    });
  }

  @Get('orders/:orderId/disputes')
  @UseGuards(JwtAuthGuard)
  getDispute(
    @Param('orderId') orderId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.getDispute({
      orderId,
      userId: user.userId,
    });
  }

  @Get('admin/disputes')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminGetDisputes(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    return this.bookingService.adminGetDisputes({
      status: status || '',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Post('admin/disputes/resolve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminResolveDispute(@Body() body: any): Observable<any> {
    return this.bookingService.adminResolveDispute(body);
  }

  @Get('orders/:orderId/vehicles/:vehicleId/otp')
  @UseGuards(JwtAuthGuard)
  getOrderOtp(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.getOrderOtp({
      orderId,
      vehicleId,
      userId: user.userId,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/pay-balance')
  @UseGuards(JwtAuthGuard)
  payBalance(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.bookingService.payBalance({
      orderId,
      vehicleId,
      passengerId: user.userId,
      ...body,
    });
  }

  @Get('admin/analytics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminGetAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Observable<any> {
    return this.bookingService.adminGetAnalytics({
      from: from || '',
      to: to || '',
    });
  }

  @Get('orders/:orderId/payment-status')
  @UseGuards(JwtAuthGuard)
  getOrderPaymentStatus(@Param('orderId') orderId: string): Observable<any> {
    return this.bookingService.getOrderPaymentStatus({ orderId });
  }

  @Post('admin/platform-fee')
  @UseGuards(JwtAuthGuard, AdminGuard)
  setPlatformFeePercent(
    @Body()
    body: {
      percent: number;
      passengerShare?: number;
      ownerShare?: number;
    },
  ): Observable<any> {
    return this.bookingService.setPlatformFeePercent({
      percent: body.percent,
      passengerShare: body.passengerShare,
      ownerShare: body.ownerShare,
    });
  }

  @Get('admin/platform-fee')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getPlatformFeePercent(): Observable<any> {
    return this.bookingService.getPlatformFeePercent({});
  }

  @Post('booking/calculate-price')
  calculatePrice(
    @Body()
    body: {
      vehicleId?: string;
      seatingCapacity?: string;
      tripType?: string;
      totalDays?: number;
      pickupLat?: number;
      pickupLng?: number;
      dropLat?: number;
      dropLng?: number;
      pickupDatetime?: string;
      returnDatetime?: string;
      discount?: number;
    },
  ): Observable<any> {
    return this.bookingService.calculatePrice({
      vehicleId: body.vehicleId || '',
      seatingCapacity: body.seatingCapacity || '',
      tripType: body.tripType || '',
      totalDays: body.totalDays || 1,
      pickupLat: body.pickupLat || 0,
      pickupLng: body.pickupLng || 0,
      dropLat: body.dropLat || 0,
      dropLng: body.dropLng || 0,
      pickupDatetime: body.pickupDatetime || '',
      returnDatetime: body.returnDatetime || '',
      discount: body.discount || 0,
    });
  }

  private async broadcastBookingUpdate(orderId: string, userId: string = '') {
    try {
      const orderDetails = await firstValueFrom(
        this.bookingService.getOrderDetails({ orderId, userId }),
      );
      if (orderDetails) {
        this.communicationGateway.sendBookingUpdate(orderId, orderDetails);
      }
    } catch (err: any) {
      console.error(
        `[BookingController] Failed to broadcast booking update for ${orderId}:`,
        err.message,
      );
    }
  }
}
