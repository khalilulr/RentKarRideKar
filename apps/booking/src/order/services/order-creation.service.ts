import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderTimeline } from '../entities/order-timeline.entity';
import { CartService } from '../../cart/cart.service';
import { PricingService } from '../../pricing/pricing.service';
import { OrderGrpcService } from './order-grpc.service';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';
import { OrderStatus } from '../enum/order-status.enum';
import { VisibleStatus } from '../enum/visiblestatus-type.enum';
import { PaymentStatus } from '../enum/payment-status.enum';
import { WhatsappStatus } from '../enum/whatsapp-status.enum';

@Injectable()
export class OrderCreationService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderVehicle)
    private readonly orderVehicleRepository: Repository<OrderVehicle>,
    @InjectRepository(OrderTimeline)
    private readonly orderTimelineRepository: Repository<OrderTimeline>,
    private readonly cartService: CartService,
    private readonly pricingService: PricingService,
    private readonly orderGrpcService: OrderGrpcService,
  ) {}

  async createOrder(passengerId: string, body: any) {
    const { passengerNote } = body;

    const cart = await this.cartService.getOrCreateCart(passengerId);
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException({
        error: 'EMPTY_CART',
        message: 'Your cart is empty. Add a vehicle before placing order.',
      });
    }

    // Re-verify availability
    for (const item of cart.items) {
      const start = new Date(item.pickupDatetime).toISOString().split('T')[0];
      const end = item.returnDatetime
        ? new Date(item.returnDatetime).toISOString().split('T')[0]
        : start;

      const isAvailableRes = await this.orderGrpcService.isVehicleAvailable(
        item.vehicleId,
        start,
        end,
      );

      if (isAvailableRes && !isAvailableRes.isAvailable) {
        await this.cartService.removeCartItem(passengerId, item.id);
        throw new BadRequestException({
          error: 'VEHICLE_UNAVAILABLE',
          message:
            'Vehicle is no longer available. It has been removed from your order.',
          affectedVehicle: {
            vehicleId: item.vehicleId,
            reason: 'Booked by another passenger',
          },
        });
      }
    }

    let originalAmount = 0;
    const orderVehiclesData: OrderVehicle[] = [];

    for (const item of cart.items) {
      const vehicleRes = await this.orderGrpcService.getVehicleById(
        item.vehicleId,
      );
      const vehicle = vehicleRes?.vehicle;

      let pricing = item.priceBreakdown;
      if (!pricing) {
        pricing = await this.pricingService.calculatePricing(
          item.totalDays,
          vehicle,
          item.pickupLat,
          item.pickupLng,
          item.dropLat,
          item.dropLng,
          item.returnDatetime ? item.returnDatetime.toISOString() : undefined,
          item.pickupDatetime ? item.pickupDatetime.toISOString() : undefined,
          0,
          item.tripType,
        );
      }
      originalAmount += pricing.total;

      const ownerResponseDeadline = new Date();
      ownerResponseDeadline.setHours(ownerResponseDeadline.getHours() + 1);

      const ov = this.orderVehicleRepository.create({
        vehicleId: item.vehicleId,
        ownerId: vehicle?.ownerId || 'usr_owner1',
        price: pricing.total,
        priceBreakdown: pricing,
        status: OrderVehicleStatus.PENDING_OWNER_RESPONSE,
        ownerResponseDeadline,
        pickupAddress: item.pickupAddress,
        dropAddress: item.dropAddress,
        pickupLat: item.pickupLat,
        pickupLng: item.pickupLng,
        dropLat: item.dropLat,
        dropLng: item.dropLng,
        pickupDatetime: item.pickupDatetime,
        returnDatetime: item.returnDatetime,
        tripType: item.tripType,
        totalDays: item.totalDays,
      });

      orderVehiclesData.push(ov);
    }

    let totalBasePrice = 0;
    let totalGst = 0;
    let totalPlatformFee = 0;
    let totalDiscount = 0;
    let totalAmount = 0;

    for (const ov of orderVehiclesData) {
      const pb = ov.priceBreakdown;
      totalBasePrice += pb.basePrice || 0;
      totalGst += pb.gst || 0;
      totalPlatformFee += pb.platformFee || 0;
      totalDiscount += pb.discount || 0;
      totalAmount += pb.total || 0;
    }

    let discountAmount = 0;

    if (body.promoCode) {
      const validateRes = await this.orderGrpcService.validateCode(
        body.promoCode,
        passengerId,
        totalAmount,
      );
      if (!validateRes || !validateRes.isValid) {
        throw new BadRequestException({
          error: 'INVALID_PROMO_CODE',
          message: validateRes?.message || 'The promo code is invalid.',
        });
      }
      discountAmount = Number(validateRes.discountAmount);
      totalDiscount += discountAmount;
      totalAmount = Number(validateRes.discountedPrice);
    }

    const totalAdvance = Math.round(totalAmount * 0.25);
    const balanceAmount = totalAmount - totalAdvance;

    const orderBreakdown = {
      basePrice: totalBasePrice,
      gst: totalGst,
      platformFee: totalPlatformFee,
      discount: totalDiscount,
      total: totalAmount,
      advancePercentage: 25,
      advanceAmount: totalAdvance,
      balanceAmount,
      currency: 'INR',
    };

    const order = this.orderRepository.create({
      passengerId,
      passengerNote,
      totalAmount,
      advanceAmount: totalAdvance,
      originalAmount,
      discountAmount,
      promoCode: body.promoCode || '',
      priceBreakdown: orderBreakdown,
      status: OrderStatus.OWNER_PENDING,
      visibleStatus: VisibleStatus.REQUEST_SENT,
      paymentStatus: PaymentStatus.PENDING,
      whatsappStatus: WhatsappStatus.SENT,
      paymentLink: `https://pay.convoy.app/ord_${Math.random().toString(36).substring(2, 8)}`,
    });

    order.vehicles = orderVehiclesData;
    order.timeline = [
      this.orderTimelineRepository.create({
        status: VisibleStatus.REQUEST_SENT,
        description: 'Request sent to vehicle owners',
        timestamp: new Date(),
      }),
    ];

    await this.orderRepository.save(order);

    // Send notifications to vehicle owners
    for (const v of order.vehicles) {
      await this.orderGrpcService.sendNotification(
        v.ownerId,
        'New Ride Request',
        `You have received a new ride request (Order ID: ${order.id}) for your vehicle.`,
        'in-app',
      );

      await this.orderGrpcService.sendNotification(
        v.ownerId,
        'Pending Ride Request Reminder',
        `You have a pending ride request (Order ID: ${order.id}). Please accept or reject it.`,
        'whatsapp',
        5,
        `order_request:${order.id}`,
      );
    }

    if (body.promoCode && discountAmount > 0) {
      await this.orderGrpcService.recordOfferUsage(
        passengerId,
        body.promoCode,
        order.id,
        discountAmount,
      );
    }

    await this.cartService.clearCart(passengerId);

    const vehiclesResponse: any[] = [];
    for (const v of order.vehicles) {
      let ownerName = 'Rajesh Kumar';
      const ownerRes = await this.orderGrpcService.getMe(v.ownerId);
      ownerName = ownerRes?.user?.name || ownerName;

      let vehicleDetails = {
        make: 'Maruti Suzuki',
        model: 'Ertiga',
        color: 'WHITE',
      };
      const vehRes = await this.orderGrpcService.getVehicleById(v.vehicleId);
      if (vehRes?.vehicle) {
        vehicleDetails.make = vehRes.vehicle.make || vehicleDetails.make;
        vehicleDetails.model = vehRes.vehicle.model || vehicleDetails.model;
        vehicleDetails.color = vehRes.vehicle.color || vehicleDetails.color;
      }

      vehiclesResponse.push({
        vehicleId: v.vehicleId,
        orderVehicleId: v.id,
        owner: { id: v.ownerId, name: ownerName },
        vehicle: vehicleDetails,
        status: v.status,
        price: Number(v.price),
        ownerResponseDeadline: v.ownerResponseDeadline.toISOString(),
      });
    }

    return {
      orderId: order.id,
      status: order.status,
      visibleStatus: order.visibleStatus,
      vehicles: vehiclesResponse,
      summary: {
        totalVehicles: order.vehicles.length,
        basePrice: orderBreakdown.basePrice,
        gst: orderBreakdown.gst,
        platformFee: orderBreakdown.platformFee,
        discount: orderBreakdown.discount,
        totalAmount: orderBreakdown.total,
        advanceAmount: orderBreakdown.advanceAmount,
        balanceAmount: orderBreakdown.balanceAmount,
        currency: 'INR',
      },
      whatsappStatus: order.whatsappStatus,
      nextStep:
        'Waiting for owner response. You will be notified within 1 hour.',
      createdAt: order.createdAt.toISOString(),
    };
  }
}
