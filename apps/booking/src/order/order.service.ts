import { Injectable } from '@nestjs/common';
import { OrderCreationService } from './services/order-creation.service';
import { OrderQueryService } from './services/order-query.service';
import { OrderPaymentService } from './services/order-payment.service';
import { OrderOwnerService } from './services/order-owner.service';
import { OrderDriverService } from './services/order-driver.service';
import { OrderPassengerService } from './services/order-passenger.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderCreationService: OrderCreationService,
    private readonly orderQueryService: OrderQueryService,
    private readonly orderPaymentService: OrderPaymentService,
    private readonly orderOwnerService: OrderOwnerService,
    private readonly orderDriverService: OrderDriverService,
    private readonly orderPassengerService: OrderPassengerService,
  ) {}

  async createOrder(passengerId: string, body: any) {
    return this.orderCreationService.createOrder(passengerId, body);
  }

  async listOrders(
    user: any,
    roleQuery?: string,
    statusQuery?: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    return this.orderQueryService.listOrders(
      user,
      roleQuery,
      statusQuery,
      pageQuery,
      limitQuery,
    );
  }

  async getOrderDetails(orderId: string, user: any) {
    return this.orderQueryService.getOrderDetails(orderId, user);
  }

  async initiateAdvancePayment(orderId: string, passengerId: string) {
    return this.orderPaymentService.initiateAdvancePayment(orderId, passengerId);
  }

  async confirmAdvancePayment(webhookBody: any, razorpaySignature: string) {
    return this.orderPaymentService.confirmAdvancePayment(webhookBody, razorpaySignature);
  }

  async confirmPayment(orderId: string) {
    return this.orderPaymentService.confirmPayment(orderId);
  }

  async ownerAccept(orderId: string, vehicleId: string, body: any, ownerId: string) {
    return this.orderOwnerService.ownerAccept(orderId, vehicleId, body, ownerId);
  }

  async ownerReject(orderId: string, vehicleId: string, body: any, ownerId: string) {
    return this.orderOwnerService.ownerReject(orderId, vehicleId, body, ownerId);
  }

  async assignDriver(orderId: string, vehicleId: string, body: any) {
    return this.orderOwnerService.assignDriver(orderId, vehicleId, body);
  }

  async ownerRemoveDriver(orderId: string, vehicleId: string, user: any) {
    return this.orderOwnerService.ownerRemoveDriver(orderId, vehicleId, user);
  }

  async getBooking(orderId: string) {
    return this.orderQueryService.getBooking(orderId);
  }

  async getOrderVehicles(orderId: string) {
    return this.orderQueryService.getOrderVehicles(orderId);
  }

  async updateBookingStatus(orderId: string, status: string, visibleStatus: string) {
    return this.orderQueryService.updateBookingStatus(orderId, status, visibleStatus);
  }
  async ownerCancelVehicle(orderId: string, vehicleId: string, body: any, ownerId: string) {
    return this.orderOwnerService.ownerCancelVehicle(orderId, vehicleId, body, ownerId);
  }

  async driverAccept(orderId: string, vehicleId: string, driverId: string) {
    return this.orderDriverService.driverAccept(orderId, vehicleId, driverId);
  }
  
  async driverReject(orderId: string, vehicleId: string, body: any, ownerId: string) {
    return this.orderDriverService.driverReject(orderId, vehicleId, body, ownerId);
  }
  
  async arrive(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.arrive(orderId, vehicleId, body);
  }

  async verifyOtp(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.verifyOtp(orderId, vehicleId, body);
  }

  async completeVehicleTrip(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.completeVehicleTrip(orderId, vehicleId, body);
  }
  
  async completeOrder(orderId: string) {
    return this.orderDriverService.completeOrder(orderId);
  }
  
  async passengerCancelOrder(orderId: string, body: any) {
    return this.orderPassengerService.passengerCancelOrder(orderId, body);
  }

}
