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

    const now = new Date();
    const expired = cart.items.some((item) => new Date(item.expiresAt) < now);
    if (expired) {
      throw new BadRequestException({
        error: 'CART_EXPIRED',
        message: 'Your cart has expired. Please search and add vehicles again.',
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
          message: 'Vehicle is no longer available. It has been removed from your order.',
          affectedVehicle: {
            vehicleId: item.vehicleId,
            reason: 'Booked by another passenger',
          },
        });
      }
    }

    let totalAmount = 0;
    let totalAdvance = 0;
    const orderVehiclesData: OrderVehicle[] = [];

    for (const item of cart.items) {
      const vehicleRes = await this.orderGrpcService.getVehicleById(item.vehicleId);
      const vehicle = vehicleRes?.vehicle;

      const pricing = this.pricingService.calculatePricing(item.totalDays);
      totalAmount += pricing.total;
      totalAdvance += pricing.advanceRequired;

      const ownerResponseDeadline = new Date();
      ownerResponseDeadline.setHours(ownerResponseDeadline.getHours() + 1);

      const ov = this.orderVehicleRepository.create({
        vehicleId: item.vehicleId,
        ownerId: vehicle?.ownerId || 'usr_owner1',
        price: pricing.total,
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

    const order = this.orderRepository.create({
      passengerId,
      passengerNote,
      totalAmount,
      advanceAmount: totalAdvance,
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
    await this.cartService.clearCart(passengerId);

    const vehiclesResponse: any[] = [];
    for (const v of order.vehicles) {
      let ownerName = 'Rajesh Kumar';
      const ownerRes = await this.orderGrpcService.getMe(v.ownerId);
      ownerName = ownerRes?.user?.name || ownerName;

      let vehicleDetails = { make: 'Maruti Suzuki', model: 'Ertiga', color: 'WHITE' };
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
        totalAmount,
        advanceRequired: totalAdvance,
      },
      whatsappStatus: order.whatsappStatus,
      nextStep: 'Waiting for owner response. You will be notified within 1 hour.',
      createdAt: order.createdAt.toISOString(),
    };
  }
}
