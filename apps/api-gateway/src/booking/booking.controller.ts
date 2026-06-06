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
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, map } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from '../auth/guards/vehicle_owner.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  BookingServiceClient,
  BOOKING_SERVICE_NAME,
} from '../../../../libs/types/booking';

@Controller()
export class BookingController implements OnModuleInit {
  private bookingService: BookingServiceClient;

  constructor(
    @Inject('BOOKING_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.bookingService = this.client.getService<BookingServiceClient>(
      BOOKING_SERVICE_NAME,
    );
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
  viewCart(@CurrentUser() user: any): Observable<any> {
    return this.bookingService.viewCart({
      passengerId: user.userId,
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
    return this.bookingService.createOrder({
      passengerId: user.userId,
      ...body,
    });
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
      role: role || 'PASSENGER',
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
    return this.bookingService.ownerAccept({
      orderId,
      vehicleId,
      ownerId: user.userId,
      ...body,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/reject')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  ownerReject(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.ownerReject({
      orderId,
      vehicleId,
      ownerId: user.userId,
      ...body,
    });
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
    return this.bookingService.driverAccept({
      orderId,
      vehicleId,
      driverId: user.userId,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/driver-reject')
  @UseGuards(JwtAuthGuard)
  driverReject(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.driverReject({
      orderId,
      vehicleId,
      driverId: user.userId,
      ...body,
    });
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
    return this.bookingService.driverArrive({
      orderId,
      vehicleId,
      driverId: user.userId,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/verify-otp')
  @UseGuards(JwtAuthGuard)
  verifyOtp(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.bookingService.verifyOtp({
      orderId,
      vehicleId,
      ...body,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/complete')
  @UseGuards(JwtAuthGuard)
  completeVehicleTrip(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.completeVehicleTrip({
      orderId,
      vehicleId,
      driverId: user.userId,
      ...body,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Complete Entire Order (Internal System call)
  // ─────────────────────────────────────────────────────────────
  @Post('orders/:orderId/complete')
  completeOrder(@Param('orderId') orderId: string): Observable<any> {
    return this.bookingService.completeOrder({
      orderId,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Cancellations
  // ─────────────────────────────────────────────────────────────

  @Post('orders/:orderId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelOrder(
    @Param('orderId') orderId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.bookingService.cancelOrder({
      orderId,
      ...body,
    });
  }

  @Post('orders/:orderId/vehicles/:vehicleId/owner-cancel')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  ownerCancelVehicle(
    @Param('orderId') orderId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.bookingService.ownerCancelVehicle({
      orderId,
      vehicleId,
      ownerId: user.userId,
      ...body,
    });
  }

  @Post('orders/:orderId/confirm-payment')
  @UseGuards(JwtAuthGuard)
  confirmPayment(
    @Param('orderId') orderId: string,
  ): Observable<any> {
    return this.bookingService.confirmPayment({
      orderId,
    }).pipe(
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
}
