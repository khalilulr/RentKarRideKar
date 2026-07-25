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
    return this.orderPaymentService.initiateAdvancePayment(
      orderId,
      passengerId,
    );
  }

  async confirmAdvancePayment(webhookBody: any, razorpaySignature: string) {
    return this.orderPaymentService.confirmAdvancePayment(
      webhookBody,
      razorpaySignature,
    );
  }

  async confirmPayment(orderId: string) {
    return this.orderPaymentService.confirmPayment(orderId);
  }

  async ownerAccept(
    orderId: string,
    vehicleId: string,
    body: any,
    ownerId: string,
  ) {
    return this.orderOwnerService.ownerAccept(
      orderId,
      vehicleId,
      body,
      ownerId,
    );
  }

  async ownerReject(
    orderId: string,
    vehicleId: string,
    body: any,
    ownerId: string,
  ) {
    return this.orderOwnerService.ownerReject(
      orderId,
      vehicleId,
      body,
      ownerId,
    );
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

  async getOrderVehicle(id: string) {
    return this.orderQueryService.getOrderVehicle(id);
  }

  async updateBookingStatus(
    orderId: string,
    status: string,
    visibleStatus: string,
  ) {
    return this.orderQueryService.updateBookingStatus(
      orderId,
      status,
      visibleStatus,
    );
  }
  async ownerCancelVehicle(
    orderId: string,
    vehicleId: string,
    body: any,
    ownerId: string,
  ) {
    return this.orderOwnerService.ownerCancelVehicle(
      orderId,
      vehicleId,
      body,
      ownerId,
    );
  }

  async driverAccept(orderId: string, vehicleId: string, driverId: string) {
    return this.orderDriverService.driverAccept(orderId, vehicleId, driverId);
  }

  async driverReject(
    orderId: string,
    vehicleId: string,
    body: any,
    ownerId: string,
  ) {
    return this.orderDriverService.driverReject(
      orderId,
      vehicleId,
      body,
      ownerId,
    );
  }

  async arrive(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.arrive(orderId, vehicleId, body);
  }

  async verifyOtp(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.verifyOtp(orderId, vehicleId, body);
  }

  async completeVehicleTrip(orderId: string, vehicleId: string, body: any) {
    return this.orderDriverService.completeVehicleTrip(
      orderId,
      vehicleId,
      body,
    );
  }

  async completeOrder(orderId: string) {
    return this.orderDriverService.completeOrder(orderId);
  }

  async passengerCancelOrder(orderId: string, body: any) {
    return this.orderPassengerService.passengerCancelOrder(orderId, body);
  }

  async getOwnerEarnings(
    ownerId: string,
    period: string,
    year: number,
    month: number,
  ) {
    return this.orderQueryService.getOwnerEarnings(
      ownerId,
      period,
      year,
      month,
    );
  }

  async getPayoutHistory(ownerId: string, page: number, limit: number) {
    return this.orderQueryService.getPayoutHistory(ownerId, page, limit);
  }

  async downloadEarningsStatement(ownerId: string, year: number) {
    return this.orderQueryService.downloadEarningsStatement(ownerId, year);
  }

  async getDriverEarnings(driverId: string, page: number, limit: number) {
    return this.orderQueryService.getDriverEarnings(driverId, page, limit);
  }

  async getDriverTrip(orderId: string, vehicleId: string, driverId: string) {
    return this.orderQueryService.getDriverTrip(orderId, vehicleId, driverId);
  }

  async getDriverMyTrips(
    driverId: string,
    status: string,
    page: number,
    limit: number,
  ) {
    return this.orderQueryService.getDriverMyTrips(
      driverId,
      status,
      page,
      limit,
    );
  }

  async raiseDispute(body: any) {
    return this.orderQueryService.raiseDispute(body);
  }

  async getDispute(orderId: string, userId: string) {
    return this.orderQueryService.getDispute(orderId, userId);
  }

  async adminGetDisputes(status: string, page: number, limit: number) {
    return this.orderQueryService.adminGetDisputes(status, page, limit);
  }

  async adminResolveDispute(body: any) {
    return this.orderQueryService.adminResolveDispute(body);
  }

  async getOrderOtp(orderId: string, vehicleId: string, userId: string) {
    return this.orderQueryService.getOrderOtp(orderId, vehicleId, userId);
  }

  async payBalance(
    orderId: string,
    vehicleId: string,
    passengerId: string,
    body: any,
  ) {
    return this.orderPaymentService.payBalance(
      orderId,
      vehicleId,
      passengerId,
      body,
    );
  }

  async completePayment(
    orderId: string,
    passengerId: string,
    paidAmount: number,
    transactionId: string,
  ) {
    return this.orderPaymentService.completePayment(
      orderId,
      passengerId,
      paidAmount,
      transactionId,
    );
  }

  async startTrip(orderVehicleId: string, driverId: string) {
    return this.orderDriverService.startTrip(orderVehicleId, driverId);
  }

  async adminGetAnalytics(from: string, to: string) {
    return this.orderQueryService.adminGetAnalytics(from, to);
  }

  async getOrderPaymentStatus(orderId: string) {
    return this.orderQueryService.getOrderPaymentStatus(orderId);
  }
}
