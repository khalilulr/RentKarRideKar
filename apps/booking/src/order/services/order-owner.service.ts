import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderTimeline } from '../entities/order-timeline.entity';
import { OrderGrpcService } from './order-grpc.service';
import { PricingService } from '../../pricing/pricing.service';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';
import { OrderStatus } from '../enum/order-status.enum';
import { VisibleStatus } from '../enum/visiblestatus-type.enum';

@Injectable()
export class OrderOwnerService {
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

  async ownerAccept(orderId: string, vehicleId: string, body: any, ownerId: string) {
    const { assignmentPreference, driverId } = body;

    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId, ownerId },
      relations: ['order'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    if (ov.status !== OrderVehicleStatus.PENDING_OWNER_RESPONSE) {
      throw new BadRequestException({
        error: 'ALREADY_RESPONDED',
        message: 'You have already responded to this request.',
      });
    }

    let ownerName: string | undefined;
    const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
    ownerName = ownerRes?.user?.name;

    const ot1 = this.orderTimelineRepository.create({
      orderId,
      status: 'OWNER_ACCEPTED',
      description: `${ownerName || 'Owner'} accepted your booking`,
      timestamp: new Date(),
    });
    await this.orderTimelineRepository.save(ot1);

    if (assignmentPreference === 'OWNER_AS_DRIVER') {
      ov.status = OrderVehicleStatus.DRIVER_ACCEPTED;
      ov.driverAssignmentType = 'OWNER_AS_DRIVER';
      ov.assignedDriverId = ov.ownerId;
      ov.proxyContact = '+918XXXXX0001';
      await this.orderVehicleRepository.save(ov);

      if (ov.order) {
        ov.order.status = OrderStatus.DRIVER_ASSIGNED;
        ov.order.visibleStatus = VisibleStatus.AWAITING_PAYMENT;
        await this.orderRepository.save(ov.order);
      }

      const ot2 = this.orderTimelineRepository.create({
        orderId,
        status: 'DRIVER_ACCEPTED',
        description: `${ownerName || 'Owner'} will be your driver`,
        timestamp: new Date(),
      });
      await this.orderTimelineRepository.save(ot2);

      return {
        orderVehicleId: ov.id,
        status: 'DRIVER_ACCEPTED',
        message: 'Booking accepted. You are the driver. Passenger will be notified.',
        nextStep: 'Waiting for passenger advance payment. Chat is active for testing.',
      };
    } else if (assignmentPreference === 'TRUSTED_DRIVER') {
      if (!driverId) {
        throw new BadRequestException({
          error: 'DRIVER_NOT_REGISTERED',
          message: 'Driver ID is required for trusted driver arrangement.',
        });
      }

      let driverName: string | undefined;
      const driverRes = await this.orderGrpcService.getMe(driverId);
      driverName = driverRes?.user?.name;

      const driverResponseDeadline = new Date();
      driverResponseDeadline.setMinutes(driverResponseDeadline.getMinutes() + 60);

      ov.status = OrderVehicleStatus.DRIVER_PENDING;
      ov.driverAssignmentType = 'TRUSTED_DRIVER';
      ov.assignedDriverId = driverId;
      ov.driverResponseDeadline = driverResponseDeadline;
      await this.orderVehicleRepository.save(ov);

      return {
        orderVehicleId: ov.id,
        status: OrderVehicleStatus.DRIVER_PENDING,
        message: `Booking accepted. Waiting for ${driverName || 'driver'} to accept the assignment.`,
        assignedDriver: {
          name: driverName,
          driverResponseDeadline: driverResponseDeadline.toISOString(),
        },
        nextStep: `${driverName || 'Driver'} has been notified via WhatsApp. Chat will unlock after driver accepts and passenger pays.`,
      };
    } else {
      // Platform pool
      ov.status = OrderVehicleStatus.DRIVER_PENDING;
      ov.driverAssignmentType = 'PLATFORM_POOL';
      await this.orderVehicleRepository.save(ov);

      return {
        orderVehicleId: ov.id,
        assignmentType: 'PLATFORM_POOL',
        status: OrderVehicleStatus.DRIVER_PENDING,
        broadcastedTo: 4,
        estimatedMatchTime: '5-10 minutes',
        message: 'Searching for available drivers.',
      };
    }
  }

  async ownerReject(orderId: string, vehicleId: string, body: any, ownerId: string) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId, ownerId },
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    ov.status = OrderVehicleStatus.OWNER_REJECTED;
    ov.cancellationReason = body.reason || 'VEHICLE_BOOKED_ELSEWHERE';
    await this.orderVehicleRepository.save(ov);

    const ot = this.orderTimelineRepository.create({
      orderId,
      status: 'OWNER_REJECTED',
      description: 'Booking rejected by owner',
      timestamp: new Date(),
    });
    await this.orderTimelineRepository.save(ot);

    return {
      orderVehicleId: ov.id,
      status: 'OWNER_REJECTED',
      message: 'Booking rejected. Passenger will be offered alternatives.',
    };
  }

  async assignDriver(orderId: string, vehicleId: string, body: any) {
    const { assignmentType, driverId } = body;

    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId },
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle association not found.',
      });
    }

    if (assignmentType === 'OWNER_AS_DRIVER') {
      ov.status = OrderVehicleStatus.DRIVER_ACCEPTED;
      ov.driverAssignmentType = 'OWNER_AS_DRIVER';
      ov.assignedDriverId = ov.ownerId;
      await this.orderVehicleRepository.save(ov);

      let ownerName = 'Rajesh Kumar';
      const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
      ownerName = ownerRes?.user?.name || ownerName;

      return {
        orderVehicleId: ov.id,
        assignmentType: 'OWNER_AS_DRIVER',
        driver: { id: ov.assignedDriverId, name: ownerName },
        status: 'DRIVER_ACCEPTED',
        message: 'You are now assigned as driver.',
      };
    } else if (assignmentType === 'TRUSTED_DRIVER') {
      const targetDriverId = driverId || 'usr_driver_mukesh';
      let driverName = 'Mukesh Yadav';
      const driverRes = await this.orderGrpcService.getMe(targetDriverId);
      driverName = driverRes?.user?.name || driverName;

      const driverResponseDeadline = new Date();
      driverResponseDeadline.setMinutes(driverResponseDeadline.getMinutes() + 60);

      ov.status = OrderVehicleStatus.DRIVER_PENDING;
      ov.driverAssignmentType = 'TRUSTED_DRIVER';
      ov.assignedDriverId = targetDriverId;
      ov.driverResponseDeadline = driverResponseDeadline;
      await this.orderVehicleRepository.save(ov);

      return {
        orderVehicleId: ov.id,
        assignmentType: 'TRUSTED_DRIVER',
        assignedDriver: { id: ov.assignedDriverId, name: driverName },
        status: 'DRIVER_PENDING',
        driverResponseDeadline: driverResponseDeadline.toISOString(),
        message: `${driverName} has been notified.`,
      };
    } else {
      ov.status = OrderVehicleStatus.DRIVER_PENDING;
      ov.driverAssignmentType = 'PLATFORM_POOL';
      await this.orderVehicleRepository.save(ov);

      return {
        orderVehicleId: ov.id,
        assignmentType: 'PLATFORM_POOL',
        status: 'DRIVER_PENDING',
        broadcastedTo: 4,
        estimatedMatchTime: '5-10 minutes',
        message: 'Searching for available drivers.',
      };
    }
  }

  async ownerRemoveDriver(orderId: string, vehicleId: string, user: any) {
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

    if (ov.ownerId !== user.userId) {
      throw new BadRequestException({
        error: 'FORBIDDEN',
        message: 'You do not own this vehicle and cannot unassign the driver.',
      });
    }

    ov.assignedDriverId = null;
    ov.driverAssignmentType = null;
    ov.proxyContact = null;
    ov.status = OrderVehicleStatus.PENDING_OWNER_RESPONSE;
    await this.orderVehicleRepository.save(ov);

    return {
      orderVehicleId: ov.id,
      status: ov.status,
      message: 'Driver removed successfully. You can assign another driver.',
    };
  }

  async ownerCancelVehicle(
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

    ov.status = OrderVehicleStatus.OWNER_CANCELLED;
    ov.cancellationReason = body.reason || 'VEHICLE_BREAKDOWN';
    await this.orderVehicleRepository.save(ov);

    // Deallocate proxy immediately on owner cancellation
    await this.orderGrpcService.triggerDeactivateProxy(orderId, 'cancelled');

    return {
      orderVehicleId: ov.id,
      status: OrderVehicleStatus.OWNER_CANCELLED,
      cancelledAt: new Date().toISOString(),
      message: 'You have cancelled this booking. Passenger will be offered replacement options.',
      penalty: {
        ratingImpact: 'Your owner rating may be affected',
        futurePriority: 'Repeated cancellations reduce your booking priority',
      },
      passengerNotified: true,
    };
  }
}
