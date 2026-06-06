import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CartService } from './cart/cart.service';
import { OrderService } from './order/order.service';

@Controller()
export class BookingController {
  constructor(
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
  ) {}

  private handleError(apiName: string, error: any) {
    console.error(`[Error in BookingController.${apiName}]:`, error);
    const message = error.response?.message || error.message || 'Internal server error';
    throw new RpcException(message);
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Cart Endpoints
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'AddToCart')
  async addToCart(request: any) {
    try {
      return await this.cartService.addToCart(request.passengerId, request);
    } catch (e) {
      this.handleError('AddToCart', e);
    }
  }

  @GrpcMethod('BookingService', 'ViewCart')
  async viewCart(request: any) {
    try {
      return await this.cartService.viewCart(request.passengerId, request.promoCode);
    } catch (e) {
      this.handleError('ViewCart', e);
    }
  }

  @GrpcMethod('BookingService', 'RemoveCartItem')
  async removeCartItem(request: any) {
    try {
      return await this.cartService.removeCartItem(request.passengerId, request.cartItemId);
    } catch (e) {
      this.handleError('RemoveCartItem', e);
    }
  }

  @GrpcMethod('BookingService', 'ClearCart')
  async clearCart(request: any) {
    try {
      return await this.cartService.clearCart(request.passengerId);
    } catch (e) {
      this.handleError('ClearCart', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Order Endpoints
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'CreateOrder')
  async createOrder(request: any) {
    try {
      return await this.orderService.createOrder(request.passengerId, request);
    } catch (e) {
      this.handleError('CreateOrder', e);
    }
  }

  @GrpcMethod('BookingService', 'ListOrders')
  async listOrders(request: any) {
    try {
      return await this.orderService.listOrders(
        { userId: request.userId },
        request.role,
        request.status,
        request.page,
        request.limit,
      );
    } catch (e) {
      this.handleError('ListOrders', e);
    }
  }

  @GrpcMethod('BookingService', 'GetOrderDetails')
  async getOrderDetails(request: any) {
    try {
      return await this.orderService.getOrderDetails(request.orderId, { userId: request.userId });
    } catch (e) {
      this.handleError('GetOrderDetails', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Owner Responses
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'OwnerAccept')
  async ownerAccept(request: any) {
    try {
      return await this.orderService.ownerAccept(
        request.orderId,
        request.vehicleId,
        request,
        request.ownerId,
      );
    } catch (e) {
      this.handleError('OwnerAccept', e);
    }
  }

  @GrpcMethod('BookingService', 'OwnerReject')
  async ownerReject(request: any) {
    try {
      return await this.orderService.ownerReject(
        request.orderId,
        request.vehicleId,
        request,
        request.ownerId,
      );
    } catch (e) {
      this.handleError('OwnerReject', e);
    }
  }

  @GrpcMethod('BookingService', 'OwnerRemoveDriver')
  async ownerRemoveDriver(request: any) {
    try {
      return await this.orderService.ownerRemoveDriver(
        request.orderId,
        request.vehicleId,
        { userId: request.ownerId },
      );
    } catch (e) {
      this.handleError('OwnerRemoveDriver', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Driver Responses
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'DriverAccept')
  async driverAccept(request: any) {
    try {
      return await this.orderService.driverAccept(
        request.orderId,
        request.vehicleId,
        request.driverId,
      );
    } catch (e) {
      this.handleError('DriverAccept', e);
    }
  }

  @GrpcMethod('BookingService', 'DriverReject')
  async driverReject(request: any) {
    try {
      return await this.orderService.driverReject(
        request.orderId,
        request.vehicleId,
        request,
        request.driverId,
      );
    } catch (e) {
      this.handleError('DriverReject', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 5. Trip Execution
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'DriverArrive')
  async driverArrive(request: any) {
    try {
      return await this.orderService.arrive(
        request.orderId,
        request.vehicleId,
        request,
      );
    } catch (e) {
      this.handleError('DriverArrive', e);
    }
  }

  @GrpcMethod('BookingService', 'VerifyOtp')
  async verifyOtp(request: any) {
    try {
      return await this.orderService.verifyOtp(request.orderId, request.vehicleId, request);
    } catch (e) {
      this.handleError('VerifyOtp', e);
    }
  }

  @GrpcMethod('BookingService', 'CompleteVehicleTrip')
  async completeVehicleTrip(request: any) {
    try {
      return await this.orderService.completeVehicleTrip(
        request.orderId,
        request.vehicleId,
        request,
      );
    } catch (e) {
      this.handleError('CompleteVehicleTrip', e);
    }
  }

  @GrpcMethod('BookingService', 'CompleteOrder')
  async completeOrder(request: any) {
    try {
      return await this.orderService.completeOrder(request.orderId);
    } catch (e) {
      this.handleError('CompleteOrder', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 6. Cancellations
  // ─────────────────────────────────────────────────────────────

  @GrpcMethod('BookingService', 'CancelOrder')
  async cancelOrder(request: any) {
    try {
      return await this.orderService.passengerCancelOrder(request.orderId, request);
    } catch (e) {
      this.handleError('CancelOrder', e);
    }
  }

  @GrpcMethod('BookingService', 'OwnerCancelVehicle')
  async ownerCancelVehicle(request: any) {
    try {
      return await this.orderService.ownerCancelVehicle(
        request.orderId,
        request.vehicleId,
        request,
        request.ownerId,
      );
    } catch (e) {
      this.handleError('OwnerCancelVehicle', e);
    }
  }

  @GrpcMethod('BookingService', 'GetBooking')
  async getBooking(request: any) {
    try {
      return await this.orderService.getBooking(request.bookingId);
    } catch (e) {
      this.handleError('GetBooking', e);
    }
  }

  @GrpcMethod('BookingService', 'GetOrderVehicles')
  async getOrderVehicles(request: any) {
    try {
      return await this.orderService.getOrderVehicles(request.bookingId);
    } catch (e) {
      this.handleError('GetOrderVehicles', e);
    }
  }

  @GrpcMethod('BookingService', 'UpdateBookingStatus')
  async updateBookingStatus(request: any) {
    try {
      return await this.orderService.updateBookingStatus(
        request.bookingId,
        request.status,
        request.visibleStatus,
      );
    } catch (e) {
      this.handleError('UpdateBookingStatus', e);
    }
  }

    @GrpcMethod('BookingService', 'ConfirmPayment')
    async confirmPayment(request: any) {
      try {
        return await this.orderService.confirmPayment(request.orderId);
      } catch (e) {
        this.handleError('ConfirmPayment', e);
      }
    }
  }