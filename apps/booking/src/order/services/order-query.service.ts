import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderTimeline } from '../entities/order-timeline.entity';
import { OrderGrpcService } from './order-grpc.service';
import { PricingService } from '../../pricing/pricing.service';
import { PaymentStatus } from '../enum/payment-status.enum';
import { OrderStatus } from '../enum/order-status.enum';

@Injectable()
export class OrderQueryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderVehicle)
    private readonly orderVehicleRepository: Repository<OrderVehicle>,
    @InjectRepository(OrderTimeline)
    private readonly orderTimelineRepository: Repository<OrderTimeline>,
    private readonly orderGrpcService: OrderGrpcService,
    private readonly pricingService: PricingService,
  ) {}

  async listOrders(
    user: any,
    roleQuery?: string,
    statusQuery?: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    const page = pageQuery || 1;
    const limit = limitQuery || 10;
    const skip = (page - 1) * limit;

    if (roleQuery === 'PASSENGER') {
      const [orders, total] = await this.orderRepository.findAndCount({
        where: { passengerId: user.userId },
        relations: ['vehicles'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

      const formatted = await Promise.all(
        orders.map(async (o) => {
          const first = o.vehicles[0];
          const pickupArea = first?.pickupAddress?.split(',')[0].trim() || 'Jadugoda';
          const dropArea = first?.dropAddress?.split(',')[0].trim() || 'Jamshedpur';
          const platformFee = Math.round(Number(o.totalAmount) * 0.03);

          const vehiclesResponse = await Promise.all(
            o.vehicles.map(async (v) => {
              let vehicleName = 'Ertiga (White)';
              let driverName = 'Rajesh Kumar';

              const vehRes = await this.orderGrpcService.getVehicleById(v.vehicleId);
              if (vehRes?.vehicle) {
                vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.color})`;
              }

              if (v.assignedDriverId) {
                const driverRes = await this.orderGrpcService.getMe(v.assignedDriverId);
                driverName = driverRes?.user?.name || driverName;
              }

              return {
                vehicle: vehicleName,
                driver: driverName,
                status: v.status === 'PENDING_OWNER_RESPONSE' ? 'PENDING' : 'CONFIRMED',
              };
            }),
          );

          return {
            orderId: o.id,
            status: o.status,
            visibleStatus: o.visibleStatus,
            route: `${pickupArea} → ${dropArea}`,
            pickupDatetime: first?.pickupDatetime
              ? first.pickupDatetime.toISOString()
              : new Date().toISOString(),
            tripType: first?.tripType || 'ROUND_TRIP',
            totalAmount: Number(o.totalAmount) - platformFee,
            advancePaid: Number(o.advanceAmount),
            remainingAmount: Number(o.totalAmount) - Number(o.advanceAmount),
            vehicles: vehiclesResponse,
            createdAt: o.createdAt.toISOString(),
          };
        }),
      );

      return {
        data: formatted,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    } else {
      // Owner perspective
      const [orderVehicles, total] = await this.orderVehicleRepository.findAndCount({
        where: { ownerId: user.userId },
        relations: ['order'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

      const formatted = await Promise.all(
        orderVehicles.map(async (ov) => {
          const pickupArea = ov.pickupAddress?.split(',')[0].trim() || 'Jadugoda';
          const dropArea = ov.dropAddress?.split(',')[0].trim() || 'Jamshedpur';

          let passengerName = 'Priya Sharma';
          if (ov.order && ov.order.passengerId) {
            const passRes = await this.orderGrpcService.getMe(ov.order.passengerId);
            passengerName = passRes?.user?.name || passengerName;
          }

          let vehicleName = 'Ertiga (JH05AB1234)';
          const vehRes = await this.orderGrpcService.getVehicleById(ov.vehicleId);
          if (vehRes?.vehicle) {
            vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.registrationNumber})`;
          }

          const pricing = this.pricingService.calculatePricing(ov.totalDays);
          const mustConfirmDriverBy = new Date(ov.pickupDatetime);
          mustConfirmDriverBy.setHours(mustConfirmDriverBy.getHours() - 48);

          return {
            orderId: ov.orderId,
            orderVehicleId: ov.id,
            status: ov.status,
            route: `${pickupArea} → ${dropArea}`,
            pickupDatetime: ov.pickupDatetime.toISOString(),
            tripType: ov.tripType,
            passenger: { name: passengerName, rating: 4.5 },
            yourVehicle: vehicleName,
            yourEarnings: pricing.yourEarnings,
            responseDeadline: ov.ownerResponseDeadline
              ? ov.ownerResponseDeadline.toISOString()
              : null,
            createdAt: ov.createdAt.toISOString(),
            driverArrangement: {
              mode: 'POOL',
              availableDrivers: [
                { driverId: 'drv_001', name: 'Mahesh Kumar', tripsCompleted: 42, isAvailableOnDate: true },
                { driverId: 'drv_002', name: 'Suresh Yadav', tripsCompleted: 18, isAvailableOnDate: true },
              ],
              mustConfirmDriverBy: mustConfirmDriverBy.toISOString(),
            },
          };
        }),
      );

      return {
        data: formatted,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    }
  }

  async getOrderDetails(orderId: string, user: any) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['vehicles', 'timeline'],
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }

    const first = order.vehicles[0];

    const vehicles = await Promise.all(
      order.vehicles.map(async (v) => {
        let vehicleDetails = {
          id: v.vehicleId,
          make: 'Maruti Suzuki',
          model: 'Ertiga',
          variant: 'VXI',
          color: 'WHITE',
          registrationNumber: 'JH05**1234',
          seatingCapacity: 'SIX_SEVEN',
          hasAC: true,
          photos: [] as string[],
        };
        
        const vehRes = await this.orderGrpcService.getVehicleById(v.vehicleId);
        if (vehRes?.vehicle) {
          vehicleDetails = {
            ...vehicleDetails,
            make: vehRes.vehicle.make || vehicleDetails.make,
            model: vehRes.vehicle.model || vehicleDetails.model,
            variant: vehRes.vehicle.variant || vehicleDetails.variant,
            color: vehRes.vehicle.color || vehicleDetails.color,
            registrationNumber: vehRes.vehicle.registrationNumber || vehicleDetails.registrationNumber,
            seatingCapacity: vehRes.vehicle.seatingCapacity || vehicleDetails.seatingCapacity,
            hasAC: vehRes.vehicle.hasAC !== undefined ? vehRes.vehicle.hasAC : vehicleDetails.hasAC,
            photos: vehRes.vehicle.vehiclePhotos || vehicleDetails.photos,
          };
        }

        let ownerName = 'Rajesh Kumar';
        const ownerRes = await this.orderGrpcService.getMe(v.ownerId);
        ownerName = ownerRes?.user?.name || ownerName;

        let driverDetails: any = null;
        if (v.assignedDriverId) {
          let driverName = 'Rajesh Kumar';
          const driverRes = await this.orderGrpcService.getMe(v.assignedDriverId);
          driverName = driverRes?.user?.name || driverName;

          driverDetails = {
            id: v.assignedDriverId,
            name: driverName,
            rating: 4.8,
            totalTrips: 23,
            assignmentType: v.driverAssignmentType || 'OWNER_AS_DRIVER',
            proxyContact:
              order.paymentStatus === PaymentStatus.COMPLETED
                ? v.proxyContact || '+918XXXXX0001'
                : null,
          };
        }

        const pricing = this.pricingService.calculatePricing(v.totalDays);

        return {
          orderVehicleId: v.id,
          vehicle: vehicleDetails,
          owner: { id: v.ownerId, name: ownerName, rating: 4.6, totalTrips: 23 },
          driver: driverDetails,
          pricing: {
            total: pricing.total,
            advance: pricing.advanceRequired,
            remaining: pricing.total - pricing.advanceRequired,
          },
        };
      }),
    );

    return {
      orderId: order.id,
      status: order.status,
      visibleStatus: order.visibleStatus,
      route: {
        pickup: {
          address: first?.pickupAddress || 'Jadugoda Main Road, Near SBI',
          lat: Number(first?.pickupLat || 22.6532),
          lng: Number(first?.pickupLng || 86.3575),
        },
        drop: {
          address: first?.dropAddress || 'Tata Main Hospital, Jamshedpur',
          lat: Number(first?.dropLat || 22.8046),
          lng: Number(first?.dropLng || 86.2029),
        },
      },
      pickupDatetime: first?.pickupDatetime
        ? first.pickupDatetime.toISOString()
        : new Date().toISOString(),
      returnDatetime: first?.returnDatetime ? first.returnDatetime.toISOString() : null,
      tripType: first?.tripType || 'ROUND_TRIP',
      totalDays: first?.totalDays || 1,
      passengerNote: order.passengerNote,
      vehicles,
      payment: {
        status: order.paymentStatus,
        advanceAmount: Number(order.advanceAmount),
        advanceDue: order.paymentStatus === PaymentStatus.PENDING,
        paymentLink:
          order.paymentStatus === PaymentStatus.PENDING ? order.paymentLink : null,
        totalAmount: Number(order.totalAmount),
        originalAmount: Number(order.originalAmount || order.totalAmount),
        discountAmount: Number(order.discountAmount),
        promoCode: order.promoCode || '',
      },
      communication:
        order.paymentStatus === PaymentStatus.COMPLETED
          ? {
              chatUnlocked: true,
              note: 'Use GET /communication/chat/rooms?bookingId= to fetch your chat rooms.',
            }
          : {
              chatUnlocked: false,
              note: 'Chat and call will be unlocked after advance payment.',
            },
      timeline: order.timeline.map((t) => ({
        status: t.status,
        timestamp: t.timestamp.toISOString(),
        description: t.description,
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async getBooking(orderId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({
        error: 'BOOKING_NOT_FOUND',
        message: 'Booking not found',
      });
    }

    const vehicles = await this.orderVehicleRepository.find({ where: { orderId } });
    const tripStartDate = vehicles.length > 0
      ? new Date(Math.min(...vehicles.map(v => new Date(v.pickupDatetime).getTime())))
      : new Date();

    return {
      id: order.id,
      passengerId: order.passengerId,
      status: order.status,
      paymentStatus: order.paymentStatus,
      advanceAmount: Number(order.advanceAmount),
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt.toISOString(),
      tripStartDate: tripStartDate.toISOString(),
    };
  }

  async getOrderVehicles(orderId: string) {
    const vehicles = await this.orderVehicleRepository.find({ where: { orderId } });
    const mapped = vehicles.map(v => ({
      id: v.id,
      orderId: v.orderId,
      vehicleId: v.vehicleId,
      ownerId: v.ownerId,
      status: v.status,
      price: Number(v.price),
      completedAt: v.completedAt ? v.completedAt.toISOString() : '',
    }));
    return { vehicles: mapped };
  }

  async updateBookingStatus(orderId: string, status: string, visibleStatus: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException({
        error: 'BOOKING_NOT_FOUND',
        message: 'Booking not found',
      });
    }

    order.status = status as OrderStatus;
    order.visibleStatus = visibleStatus;
    await this.orderRepository.save(order);
    return { success: true };
  }
}
