import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { CartService } from './cart/cart.service';
import { OrderService } from './order/order.service';
import { PricingService } from './pricing/pricing.service';
import { OrderGrpcService } from './order/services/order-grpc.service';

@Controller()
export class BookingController {
  constructor(
    private readonly cartService: CartService,
    private readonly orderService: OrderService,
    private readonly pricingService: PricingService,
    private readonly orderGrpcService: OrderGrpcService,
  ) {}

  private handleError(apiName: string, error: any) {
    console.error(`[Error in BookingController.${apiName}]:`, error);
    const message =
      error.response?.message || error.message || 'Internal server error';
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
      return await this.cartService.viewCart(
        request.passengerId,
        request.promoCode,
      );
    } catch (e) {
      this.handleError('ViewCart', e);
    }
  }

  @GrpcMethod('BookingService', 'RemoveCartItem')
  async removeCartItem(request: any) {
    try {
      return await this.cartService.removeCartItem(
        request.passengerId,
        request.cartItemId,
      );
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
      return await this.orderService.getOrderDetails(request.orderId, {
        userId: request.userId,
      });
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

  @GrpcMethod('BookingService', 'GetDriverTrip')
  async getDriverTrip(request: any) {
    try {
      return await this.orderService.getDriverTrip(
        request.orderId,
        request.vehicleId,
        request.driverId,
      );
    } catch (e) {
      this.handleError('GetDriverTrip', e);
    }
  }

  @GrpcMethod('BookingService', 'GetDriverMyTrips')
  async getDriverMyTrips(request: any) {
    try {
      return await this.orderService.getDriverMyTrips(
        request.driverId,
        request.status,
        request.page,
        request.limit,
      );
    } catch (e) {
      this.handleError('GetDriverMyTrips', e);
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
      return await this.orderService.verifyOtp(
        request.orderId,
        request.vehicleId,
        request,
      );
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
      return await this.orderService.passengerCancelOrder(
        request.orderId,
        request,
      );
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

  @GrpcMethod('BookingService', 'GetOrderVehicle')
  async getOrderVehicle(request: any) {
    try {
      return await this.orderService.getOrderVehicle(request.id);
    } catch (e) {
      this.handleError('GetOrderVehicle', e);
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

  @GrpcMethod('BookingService', 'AssignDriver')
  async assignDriver(request: any) {
    try {
      return await this.orderService.assignDriver(
        request.orderId,
        request.vehicleId,
        request,
      );
    } catch (e) {
      this.handleError('AssignDriver', e);
    }
  }

  @GrpcMethod('BookingService', 'GetOwnerEarnings')
  async getOwnerEarnings(request: any) {
    try {
      return await this.orderService.getOwnerEarnings(
        request.ownerId,
        request.period,
        request.year,
        request.month,
      );
    } catch (e) {
      this.handleError('GetOwnerEarnings', e);
    }
  }

  @GrpcMethod('BookingService', 'GetPayoutHistory')
  async getPayoutHistory(request: any) {
    try {
      return await this.orderService.getPayoutHistory(
        request.ownerId,
        request.page,
        request.limit,
      );
    } catch (e) {
      this.handleError('GetPayoutHistory', e);
    }
  }

  @GrpcMethod('BookingService', 'DownloadEarningsStatement')
  async downloadEarningsStatement(request: any) {
    try {
      return await this.orderService.downloadEarningsStatement(
        request.ownerId,
        request.year,
      );
    } catch (e) {
      this.handleError('DownloadEarningsStatement', e);
    }
  }

  @GrpcMethod('BookingService', 'GetDriverEarnings')
  async getDriverEarnings(request: any) {
    try {
      return await this.orderService.getDriverEarnings(
        request.driverId,
        request.page,
        request.limit,
      );
    } catch (e) {
      this.handleError('GetDriverEarnings', e);
    }
  }

  @GrpcMethod('BookingService', 'RaiseDispute')
  async raiseDispute(request: any) {
    try {
      return await this.orderService.raiseDispute(request);
    } catch (e) {
      this.handleError('RaiseDispute', e);
    }
  }

  @GrpcMethod('BookingService', 'GetDispute')
  async getDispute(request: any) {
    try {
      return await this.orderService.getDispute(
        request.orderId,
        request.userId,
      );
    } catch (e) {
      this.handleError('GetDispute', e);
    }
  }

  @GrpcMethod('BookingService', 'AdminGetDisputes')
  async adminGetDisputes(request: any) {
    try {
      return await this.orderService.adminGetDisputes(
        request.status,
        request.page,
        request.limit,
      );
    } catch (e) {
      this.handleError('AdminGetDisputes', e);
    }
  }

  @GrpcMethod('BookingService', 'AdminResolveDispute')
  async adminResolveDispute(request: any) {
    try {
      return await this.orderService.adminResolveDispute(request);
    } catch (e) {
      this.handleError('AdminResolveDispute', e);
    }
  }

  @GrpcMethod('BookingService', 'GetOrderOtp')
  async getOrderOtp(request: any) {
    try {
      return await this.orderService.getOrderOtp(
        request.orderId,
        request.vehicleId,
        request.userId,
      );
    } catch (e) {
      this.handleError('GetOrderOtp', e);
    }
  }

  @GrpcMethod('BookingService', 'PayBalance')
  async payBalance(request: any) {
    try {
      return await this.orderService.payBalance(
        request.orderId,
        request.vehicleId,
        request.passengerId,
        request,
      );
    } catch (e) {
      this.handleError('PayBalance', e);
    }
  }

  @GrpcMethod('BookingService', 'CompletePayment')
  async completePayment(request: any) {
    try {
      return await this.orderService.completePayment(
        request.orderId,
        request.passengerId,
        request.paidAmount,
        request.transactionId,
      );
    } catch (e) {
      this.handleError('CompletePayment', e);
    }
  }

  @GrpcMethod('BookingService', 'StartTrip')
  async startTrip(request: any) {
    try {
      return await this.orderService.startTrip(
        request.orderVehicleId,
        request.driverId,
      );
    } catch (e) {
      this.handleError('StartTrip', e);
    }
  }

  @GrpcMethod('BookingService', 'AdminGetAnalytics')
  async adminGetAnalytics(request: any) {
    try {
      return await this.orderService.adminGetAnalytics(
        request.from,
        request.to,
      );
    } catch (e) {
      this.handleError('AdminGetAnalytics', e);
    }
  }

  @GrpcMethod('BookingService', 'GetOrderPaymentStatus')
  async getOrderPaymentStatus(request: any) {
    try {
      return await this.orderService.getOrderPaymentStatus(request.orderId);
    } catch (e) {
      this.handleError('GetOrderPaymentStatus', e);
    }
  }

  @GrpcMethod('BookingService', 'SetPlatformFeePercent')
  async setPlatformFeePercent(request: any) {
    try {
      await this.pricingService.setPlatformFeePercent(request.percent);
      if (
        request.passengerShare !== undefined &&
        request.passengerShare !== null
      ) {
        await this.pricingService.setPassengerSharePercent(
          request.passengerShare,
        );
      }
      if (request.ownerShare !== undefined && request.ownerShare !== null) {
        await this.pricingService.setOwnerSharePercent(request.ownerShare);
      }
      const passengerShare =
        await this.pricingService.getPassengerSharePercent();
      const ownerShare = await this.pricingService.getOwnerSharePercent();
      return {
        success: true,
        percent: request.percent,
        passengerShare,
        ownerShare,
        message: 'Platform fee percentage updated successfully.',
      };
    } catch (e) {
      this.handleError('SetPlatformFeePercent', e);
    }
  }

  @GrpcMethod('BookingService', 'GetPlatformFeePercent')
  async getPlatformFeePercent(request: any) {
    try {
      const percent = await this.pricingService.getPlatformFeePercent();
      const passengerShare =
        await this.pricingService.getPassengerSharePercent();
      const ownerShare = await this.pricingService.getOwnerSharePercent();
      return { percent, passengerShare, ownerShare };
    } catch (e) {
      this.handleError('GetPlatformFeePercent', e);
    }
  }

  @GrpcMethod('BookingService', 'CalculatePrice')
  async calculatePrice(request: any) {
    try {
      let vehicle: any = null;
      if (request.vehicleId) {
        const vehicleRes = await this.orderGrpcService.getVehicleById(
          request.vehicleId,
        );
        vehicle = vehicleRes?.vehicle;
      }
      return await this.pricingService.calculatePricing(
        request.totalDays || 1,
        vehicle,
        request.pickupLat,
        request.pickupLng,
        request.dropLat,
        request.dropLng,
        request.returnDatetime,
        request.pickupDatetime,
        request.discount || 0,
        request.tripType,
        request.seatingCapacity,
      );
    } catch (e) {
      this.handleError('CalculatePrice', e);
    }
  }
}
