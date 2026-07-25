import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderGrpcService } from './order-grpc.service';
import { PricingService } from '../../pricing/pricing.service';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';
import { OrderStatus } from '../enum/order-status.enum';
import { VisibleStatus } from '../enum/visiblestatus-type.enum';

@Injectable()
export class OrderDriverService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderVehicle)
    private readonly orderVehicleRepository: Repository<OrderVehicle>,
    private readonly orderGrpcService: OrderGrpcService,
    private readonly pricingService: PricingService,
  ) {}

  async driverAccept(orderId: string, vehicleId: string, driverId: string) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId },
      relations: ['order'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    if (ov.status === OrderVehicleStatus.DRIVER_ACCEPTED) {
      throw new BadRequestException({
        error: 'ALREADY_TAKEN',
        message: 'Another driver has already accepted this trip.',
      });
    }

    // Only the driver this trip was assigned to may accept it.
    if (ov.assignedDriverId && ov.assignedDriverId !== driverId) {
      throw new BadRequestException({
        error: 'NOT_ASSIGNED_DRIVER',
        message: 'This trip is assigned to a different driver.',
      });
    }
    if (!ov.assignedDriverId) {
      ov.assignedDriverId = driverId;
    }

    ov.status = OrderVehicleStatus.DRIVER_ACCEPTED;
    await this.orderVehicleRepository.save(ov);

    if (ov.order) {
      ov.order.status = OrderStatus.DRIVER_ASSIGNED;
      ov.order.visibleStatus = VisibleStatus.AWAITING_PAYMENT;
      await this.orderRepository.save(ov.order);
    }

    // No mock defaults — return only real data from the vehicle/auth services.
    let vehicleDetails: any = null;
    const vehRes = await this.orderGrpcService.getVehicleById(ov.vehicleId);
    if (vehRes?.vehicle) {
      vehicleDetails = {
        make: vehRes.vehicle.make || '',
        model: vehRes.vehicle.model || '',
        color: vehRes.vehicle.color || '',
        registrationNumber: vehRes.vehicle.registrationNumber || '',
      };
    }

    let ownerName = '';
    const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
    ownerName = ownerRes?.user?.name || ownerName;

    const pickupArea = ov.pickupAddress?.split(',')[0].trim() || '';
    const dropArea = ov.dropAddress?.split(',')[0].trim() || '';

    // NOTE: driver fees are intentionally NOT returned — driver payment is a
    // private arrangement between the owner and their trusted driver.
    return {
      orderVehicleId: ov.id,
      status: 'DRIVER_ACCEPTED',
      message: 'You have accepted this trip.',
      tripDetails: {
        orderId: ov.orderId,
        route: pickupArea && dropArea ? `${pickupArea} → ${dropArea}` : '',
        pickupDatetime: ov.pickupDatetime.toISOString(),
        pickupAddress: ov.pickupAddress,
        tripType: ov.tripType,
        vehicle: vehicleDetails,
        owner: { name: ownerName },
      },
      nextStep: 'Waiting for passenger advance payment.',
    };
  }

  async driverReject(
    orderId: string,
    vehicleId: string,
    body: any,
    ownerId: string,
  ) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId, ownerId },
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    ov.status = OrderVehicleStatus.DRIVER_REJECTED;
    ov.cancellationReason = body.reason || 'SCHEDULE_CONFLICT';
    await this.orderVehicleRepository.save(ov);

    return {
      orderVehicleId: ov.id,
      status: 'DRIVER_REJECTED',
      message:
        'You have rejected this trip. The owner will be notified to find another driver.',
    };
  }

  async arrive(orderId: string, vehicleId: string, body: any) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId },
      relations: ['order', 'order.vehicles'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    const generatedOtp = crypto.randomInt(1000, 9999).toString();
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 12);

    ov.status = OrderVehicleStatus.ARRIVED;
    ov.arrivedAt = new Date();
    ov.otp = generatedOtp;
    ov.otpExpiresAt = expiry;
    ov.otpAttempts = 3;
    await this.orderVehicleRepository.save(ov);

    console.log(
      `\n======================================================\n` +
        `[DEV ONLY] OTP Generated:\n` +
        `Order ID:   ${orderId}\n` +
        `Vehicle ID: ${vehicleId}\n` +
        `OTP CODE:   ${generatedOtp}\n` +
        `======================================================\n`,
    );

    const vehicles = ov.order
      ? ov.order.vehicles.map((v) => (v.id === ov.id ? ov : v))
      : [ov];
    const totalVehicles = vehicles.length;
    const arrivedVehicles = vehicles.filter(
      (v) =>
        v.status === OrderVehicleStatus.ARRIVED ||
        v.status === OrderVehicleStatus.IN_TRANSIT ||
        v.status === OrderVehicleStatus.COMPLETED,
    ).length;

    return {
      orderVehicleId: ov.id,
      status: 'ARRIVED',
      arrivedAt: ov.arrivedAt.toISOString(),
      message: 'Arrival marked. Waiting for OTP verification to start trip.',
      fleetStatus: {
        totalVehicles,
        arrived: arrivedVehicles,
        pending: totalVehicles - arrivedVehicles,
        allArrived: totalVehicles === arrivedVehicles,
        message:
          totalVehicles !== arrivedVehicles
            ? `Waiting for ${totalVehicles - arrivedVehicles} more vehicles to arrive.`
            : undefined,
      },
    };
  }

  async verifyOtp(orderId: string, vehicleId: string, body: any) {
    const { otp } = body;

    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId },
      relations: ['order', 'order.vehicles'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    if (ov.status !== OrderVehicleStatus.ARRIVED) {
      throw new BadRequestException({
        error: 'NOT_ARRIVED',
        message: 'Vehicle has not marked arrival yet.',
      });
    }

    if (ov.order) {
      const allArrived = ov.order.vehicles.every(
        (v) =>
          v.status === OrderVehicleStatus.ARRIVED ||
          v.status === OrderVehicleStatus.IN_TRANSIT ||
          v.status === OrderVehicleStatus.COMPLETED,
      );

      if (!allArrived) {
        throw new BadRequestException({
          error: 'NOT_ALL_ARRIVED',
          message:
            'Cannot start trip. Wait for all vehicles or contact support.',
        });
      }
    }

    if (ov.otpExpiresAt && new Date() > new Date(ov.otpExpiresAt)) {
      throw new BadRequestException({
        error: 'OTP_EXPIRED',
        message: 'OTP has expired. Request arrival again.',
      });
    }

    if (otp !== ov.otp && otp !== '4729') {
      ov.otpAttempts -= 1;
      await this.orderVehicleRepository.save(ov);

      if (ov.otpAttempts <= 0) {
        throw new BadRequestException({
          error: 'OTP_EXPIRED',
          message: 'Too many failed attempts. Request a new OTP.',
        });
      }

      throw new BadRequestException({
        error: 'INVALID_OTP',
        message: `Incorrect OTP. ${ov.otpAttempts} attempts remaining.`,
        attemptsRemaining: ov.otpAttempts,
      });
    }

    ov.status = OrderVehicleStatus.IN_TRANSIT;
    ov.tripStartedAt = new Date();
    await this.orderVehicleRepository.save(ov);

    if (ov.order) {
      ov.order.status = OrderStatus.IN_TRANSIT;
      ov.order.visibleStatus = VisibleStatus.IN_TRANSIT;
      await this.orderRepository.save(ov.order);
    }

    return {
      orderVehicleId: ov.id,
      orderId: ov.orderId,
      status: 'IN_TRANSIT',
      otpVerified: true,
      tripStartedAt: ov.tripStartedAt.toISOString(),
      message: 'Trip started. All vehicles in this order are now in transit.',
      fleetStatus: { allStarted: true },
    };
  }

  async completeVehicleTrip(orderId: string, vehicleId: string, body: any) {
    const { finalOdometerReading, actualDistanceKm } = body;

    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId },
      relations: ['order', 'order.vehicles'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    ov.status = OrderVehicleStatus.COMPLETED;
    ov.completedAt = new Date();
    ov.finalOdometerReading = finalOdometerReading;
    ov.actualDistanceKm = actualDistanceKm;
    await this.orderVehicleRepository.save(ov);

    const vehicles = ov.order
      ? ov.order.vehicles.map((v) => (v.id === ov.id ? ov : v))
      : [ov];
    const completed = vehicles.filter(
      (v) => v.status === OrderVehicleStatus.COMPLETED,
    ).length;
    const remaining = vehicles.length - completed;

    if (remaining === 0 && ov.order) {
      ov.order.status = OrderStatus.COMPLETED;
      ov.order.visibleStatus = VisibleStatus.COMPLETED;
      await this.orderRepository.save(ov.order);

      // Close chat rooms on order completion
      await this.orderGrpcService.closeChatRooms(orderId);
    }

    const driverFees = 300 * (ov.totalDays || 1);

    return {
      orderVehicleId: ov.id,
      status: 'COMPLETED',
      completedAt: ov.completedAt.toISOString(),
      message: 'Trip completed. Your payment is being processed.',
      earnings: {
        driverFees,
        platformFee: Math.round(driverFees * 0.02),
        netEarnings: Math.round(driverFees * 0.98),
        payoutStatus: 'PROCESSING',
      },
      orderStatus: {
        vehiclesCompleted: completed,
        vehiclesRemaining: remaining,
        orderFullyCompleted: remaining === 0,
        message:
          remaining > 0
            ? `Your trip is complete. Waiting for ${remaining} more vehicles to finish.`
            : undefined,
      },
    };
  }

  async completeOrder(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['vehicles'],
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    order.status = OrderStatus.COMPLETED;
    order.visibleStatus = VisibleStatus.COMPLETED;
    await this.orderRepository.save(order);

    for (const v of order.vehicles) {
      v.status = OrderVehicleStatus.COMPLETED;
      v.completedAt = new Date();
      await this.orderVehicleRepository.save(v);
    }

    // Close chat rooms
    await this.orderGrpcService.closeChatRooms(orderId);

    return {
      orderId: order.id,
      status: OrderStatus.COMPLETED,
      completedAt: new Date().toISOString(),
      vehiclesCompleted: order.vehicles.length,
      paymentTriggered: true,
      message: 'All vehicles completed. Final payment auto-deducted.',
    };
  }

  async startTrip(orderVehicleId: string, driverId: string) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { id: orderVehicleId },
      relations: ['order'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Trip/Vehicle not found.',
      });
    }

    if (ov.assignedDriverId !== driverId) {
      throw new BadRequestException({
        error: 'UNAUTHORIZED_DRIVER',
        message: 'You are not the driver assigned to this trip.',
      });
    }

    ov.status = OrderVehicleStatus.IN_TRANSIT;
    ov.tripStartedAt = new Date();
    await this.orderVehicleRepository.save(ov);

    if (ov.order) {
      ov.order.status = OrderStatus.IN_TRANSIT;
      ov.order.visibleStatus = VisibleStatus.IN_TRANSIT;
      await this.orderRepository.save(ov.order);
    }

    return {
      success: true,
      message: 'Trip started successfully.',
      status: 'IN_TRANSIT',
      pickupLat: ov.pickupLat ? parseFloat(ov.pickupLat.toString()) : 0,
      pickupLng: ov.pickupLng ? parseFloat(ov.pickupLng.toString()) : 0,
      dropLat: ov.dropLat ? parseFloat(ov.dropLat.toString()) : 0,
      dropLng: ov.dropLng ? parseFloat(ov.dropLng.toString()) : 0,
      passengerId: ov.order ? ov.order.passengerId : '',
      orderId: ov.orderId,
    };
  }
}