import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderTimeline } from '../entities/order-timeline.entity';
import { OrderGrpcService } from './order-grpc.service';
import { PricingService } from '../../pricing/pricing.service';
import { PaymentStatus } from '../enum/payment-status.enum';
import { OrderStatus } from '../enum/order-status.enum';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';
import { Dispute } from '../entities/dispute.entity';

@Injectable()
export class OrderQueryService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderVehicle)
    private readonly orderVehicleRepository: Repository<OrderVehicle>,
    @InjectRepository(OrderTimeline)
    private readonly orderTimelineRepository: Repository<OrderTimeline>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
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
      const where: any = { passengerId: user.userId };
      if (statusQuery) {
        where.status = statusQuery;
      }
      const [orders, total] = await this.orderRepository.findAndCount({
        where,
        relations: ['vehicles'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

      const formatted = await Promise.all(
        orders.map(async (o) => {
          const first = o.vehicles[0];
          const pickupArea =
            first?.pickupAddress?.split(',')[0].trim() || '';
          const dropArea =
            first?.dropAddress?.split(',')[0].trim() || '';
          const platformFee = Math.round(Number(o.totalAmount) * 0.03);

          const vehiclesResponse = await Promise.all(
            o.vehicles.map(async (v) => {
              let vehicleName = '';
              let driverName = 'Driver';

              const vehRes = await this.orderGrpcService.getVehicleById(
                v.vehicleId,
              );
              if (vehRes?.vehicle) {
                vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.color})`;
              }

              if (v.assignedDriverId) {
                const driverRes = await this.orderGrpcService.getMe(
                  v.assignedDriverId,
                );
                driverName = driverRes?.user?.name || driverName;
              }

              return {
                vehicle: vehicleName,
                vehicleId: v.vehicleId,
                driver: driverName,
                status:
                  v.status === 'PENDING_OWNER_RESPONSE'
                    ? 'PENDING'
                    : 'CONFIRMED',
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
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } else if (roleQuery === 'DRIVER') {
      // Driver perspective
      const where: any = { assignedDriverId: user.userId };
      if (statusQuery) {
        if (statusQuery === 'REQUEST') {
          where.status = OrderVehicleStatus.DRIVER_PENDING;
        } else if (statusQuery === 'UPCOMING') {
          where.status = In([
            OrderVehicleStatus.DRIVER_ACCEPTED,
            OrderVehicleStatus.ARRIVED,
            OrderVehicleStatus.IN_TRANSIT,
          ]);
        } else if (statusQuery === 'PAST') {
          where.status = In([
            OrderVehicleStatus.COMPLETED,
            OrderVehicleStatus.OWNER_CANCELLED,
            OrderVehicleStatus.DRIVER_REJECTED,
          ]);
        } else {
          where.status = statusQuery;
        }
      }

      const [orderVehicles, total] =
        await this.orderVehicleRepository.findAndCount({
          where,
          relations: ['order'],
          order: { createdAt: 'DESC' },
          skip,
          take: limit,
        });

      const formatted = await Promise.all(
        orderVehicles.map(async (ov) => {
          const pickupArea = ov.pickupAddress?.split(',')[0].trim() || '';
          const dropArea = ov.dropAddress?.split(',')[0].trim() || '';

          let passengerName = 'Passenger';
          if (ov.order && ov.order.passengerId) {
            const passRes = await this.orderGrpcService.getMe(
              ov.order.passengerId,
            );
            passengerName = passRes?.user?.name || passengerName;
          }

          let ownerName = 'Owner';
          const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
          ownerName = ownerRes?.user?.name || ownerName;

          let vehicleName = '';
          const vehRes = await this.orderGrpcService.getVehicleById(
            ov.vehicleId,
          );
          if (vehRes?.vehicle) {
            vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.registrationNumber})`;
          }

          return {
            orderId: ov.orderId,
            orderVehicleId: ov.id,
            vehicleId: ov.vehicleId,
            status: ov.status,
            paymentStatus: ov.order?.paymentStatus || 'PENDING',
            route: `${pickupArea} → ${dropArea}`,
            pickupDatetime: ov.pickupDatetime.toISOString(),
            pickupAddress: ov.pickupAddress,
            dropAddress: ov.dropAddress,
            tripType: ov.tripType,
            passenger: { name: passengerName },
            owner: { name: ownerName },
            vehicle: vehicleName,
            // Driver fees intentionally omitted — payment is arranged privately
            // between the owner and their trusted driver.
            responseDeadline: ov.driverResponseDeadline
              ? ov.driverResponseDeadline.toISOString()
              : null,
            createdAt: ov.createdAt.toISOString(),
          };
        }),
      );

      return {
        data: formatted,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } else {
      // Owner perspective
      const where: any = { ownerId: user.userId };
      if (statusQuery) {
        where.status = statusQuery;
      }
      const [orderVehicles, total] =
        await this.orderVehicleRepository.findAndCount({
          where,
          relations: ['order'],
          order: { createdAt: 'DESC' },
          skip,
          take: limit,
        });

      const formatted = await Promise.all(
        orderVehicles.map(async (ov) => {
          const pickupArea =
            ov.pickupAddress?.split(',')[0].trim() || '';
          const dropArea = ov.dropAddress?.split(',')[0].trim() || '';

          let passengerName = 'Passenger';
          if (ov.order && ov.order.passengerId) {
            const passRes = await this.orderGrpcService.getMe(
              ov.order.passengerId,
            );
            passengerName = passRes?.user?.name || passengerName;
          }

          let vehicleName = '';
          let plateType = 'WHITE';
          const vehRes = await this.orderGrpcService.getVehicleById(
            ov.vehicleId,
          );
          if (vehRes?.vehicle) {
            vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.registrationNumber})`;
            plateType = vehRes.vehicle.plateType || 'WHITE';
          }

          const pb = ov.priceBreakdown || {
            basePrice: Number(ov.price),
            gst: 0,
            platformFee: 0,
            discount: 0,
            total: Number(ov.price),
            advancePercentage: 25,
            advanceAmount: Math.round(Number(ov.price) * 0.25),
            balanceAmount:
              Number(ov.price) - Math.round(Number(ov.price) * 0.25),
            currency: 'INR',
          };
          const totalFee =
            pb.totalPlatformFee !== undefined
              ? pb.totalPlatformFee
              : pb.platformFee;
          const yourEarnings = pb.total - totalFee;
          const mustConfirmDriverBy = new Date(ov.pickupDatetime);
          mustConfirmDriverBy.setHours(mustConfirmDriverBy.getHours() - 48);

          return {
            orderId: ov.orderId,
            orderVehicleId: ov.id,
            vehicleId: ov.vehicleId,
            status: ov.status,
            route: `${pickupArea} → ${dropArea}`,
            pickupDatetime: ov.pickupDatetime.toISOString(),
            tripType: ov.tripType,
            passenger: { name: passengerName },
            yourVehicle: vehicleName,
            plateType: plateType,
            yourEarnings: yourEarnings,
            // Full pricing so the owner sees ride price, platform commission,
            // and their own earnings on the request card.
            pricing: {
              total: pb.total,
              basePrice: pb.basePrice,
              gst: pb.gst || 0,
              platformFee: totalFee || 0,
              yourEarnings,
            },
            responseDeadline: ov.ownerResponseDeadline
              ? ov.ownerResponseDeadline.toISOString()
              : null,
            createdAt: ov.createdAt.toISOString(),
            mustConfirmDriverBy: mustConfirmDriverBy.toISOString(),
          };
        }),
      );

      return {
        data: formatted,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  }

  async getDriverTrip(orderId: string, vehicleId: string, driverId: string) {
    const ov = await this.orderVehicleRepository.findOne({
      where: { orderId, vehicleId, assignedDriverId: driverId },
      relations: ['order'],
    });

    if (!ov) {
      throw new NotFoundException({
        error: 'TRIP_NOT_FOUND',
        message:
          'Trip not found or you are not assigned as the driver for this vehicle.',
      });
    }

    const pickupArea = ov.pickupAddress?.split(',')[0].trim() || '';
    const dropArea = ov.dropAddress?.split(',')[0].trim() || '';

    let passengerName = 'Passenger';
    let passengerProfilePicture = '';
    if (ov.order && ov.order.passengerId) {
      const passRes = await this.orderGrpcService.getMe(ov.order.passengerId);
      passengerName = passRes?.user?.name || passengerName;
      passengerProfilePicture =
        passRes?.user?.profilePicture || passengerProfilePicture;
    }

    let ownerName = 'Owner';
    const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
    ownerName = ownerRes?.user?.name || ownerName;

    let vehicleName = '';
    let vehicleDetails: any = null;
    const vehRes = await this.orderGrpcService.getVehicleById(ov.vehicleId);
    if (vehRes?.vehicle) {
      vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.registrationNumber})`;
      vehicleDetails = {
        id: ov.vehicleId,
        make: vehRes.vehicle.make || '',
        model: vehRes.vehicle.model || '',
        color: vehRes.vehicle.color || '',
        seatingCapacity: vehRes.vehicle.seatingCapacity || '',
        rating: (vehRes.vehicle as any).rating || 0.0,
        photos: vehRes.vehicle.vehiclePhotos || [],
        variant: vehRes.vehicle.variant || '',
        registrationNumber: vehRes.vehicle.registrationNumber || '',
        hasAC: vehRes.vehicle.hasAC !== undefined ? vehRes.vehicle.hasAC : true,
        totalTrips: (vehRes.vehicle as any).totalTrips || 0,
        plateType: vehRes.vehicle.plateType || 'WHITE',
      };
    }

    return {
      orderId: ov.orderId,
      orderVehicleId: ov.id,
      vehicleId: ov.vehicleId,
      status: ov.status,
      paymentStatus: ov.order?.paymentStatus || 'PENDING',
      route: `${pickupArea} → ${dropArea}`,
      pickupDatetime: ov.pickupDatetime.toISOString(),
      pickupAddress: ov.pickupAddress,
      dropAddress: ov.dropAddress,
      tripType: ov.tripType,
      passenger: {
        id: ov.order?.passengerId || '',
        name: passengerName,
        profilePicture: passengerProfilePicture,
      },
      owner: { id: ov.ownerId, name: ownerName },
      vehicle: vehicleName,
      vehicleDetails,
      // Driver fees intentionally omitted — payment is arranged privately
      // between the owner and their trusted driver.
      responseDeadline: ov.driverResponseDeadline
        ? ov.driverResponseDeadline.toISOString()
        : '',
      createdAt: ov.createdAt.toISOString(),
    };
  }

  async getDriverMyTrips(
    driverId: string,
    statusQuery?: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    const page = pageQuery || 1;
    const limit = limitQuery || 10;
    const skip = (page - 1) * limit;

    const where: any = { assignedDriverId: driverId };

    if (statusQuery) {
      const normalizedStatus = statusQuery.toUpperCase();
      if (normalizedStatus === 'PENDING') {
        where.status = OrderVehicleStatus.DRIVER_PENDING;
      } else if (
        normalizedStatus === 'UPCOMING' ||
        normalizedStatus === 'FUTURE'
      ) {
        where.status = In([
          OrderVehicleStatus.DRIVER_ACCEPTED,
          OrderVehicleStatus.ARRIVED,
          OrderVehicleStatus.IN_TRANSIT,
        ]);
      } else if (normalizedStatus === 'COMPLETED') {
        where.status = OrderVehicleStatus.COMPLETED;
      } else {
        where.status = statusQuery;
      }
    }

    const [orderVehicles, total] =
      await this.orderVehicleRepository.findAndCount({
        where,
        relations: ['order'],
        order: { createdAt: 'DESC' },
        skip,
        take: limit,
      });

    const formatted = await Promise.all(
      orderVehicles.map(async (ov) => {
        const pickupArea = ov.pickupAddress?.split(',')[0].trim() || '';
        const dropArea = ov.dropAddress?.split(',')[0].trim() || '';

        let passengerName = 'Passenger';
        let passengerProfilePicture = '';
        if (ov.order && ov.order.passengerId) {
          const passRes = await this.orderGrpcService.getMe(
            ov.order.passengerId,
          );
          passengerName = passRes?.user?.name || passengerName;
          passengerProfilePicture =
            passRes?.user?.profilePicture || passengerProfilePicture;
        }

        let ownerName = 'Owner';
        const ownerRes = await this.orderGrpcService.getMe(ov.ownerId);
        ownerName = ownerRes?.user?.name || ownerName;

        let vehicleName = '';
        let vehicleDetails: any = null;
        const vehRes = await this.orderGrpcService.getVehicleById(ov.vehicleId);
        if (vehRes?.vehicle) {
          vehicleName = `${vehRes.vehicle.make} (${vehRes.vehicle.registrationNumber})`;
          vehicleDetails = {
            id: ov.vehicleId,
            make: vehRes.vehicle.make || '',
            model: vehRes.vehicle.model || '',
            color: vehRes.vehicle.color || '',
            seatingCapacity: vehRes.vehicle.seatingCapacity || '',
            rating: (vehRes.vehicle as any).rating || 0.0,
            photos: vehRes.vehicle.vehiclePhotos || [],
            variant: vehRes.vehicle.variant || '',
            registrationNumber: vehRes.vehicle.registrationNumber || '',
            hasAC:
              vehRes.vehicle.hasAC !== undefined ? vehRes.vehicle.hasAC : true,
            totalTrips: (vehRes.vehicle as any).totalTrips || 0,
            plateType: vehRes.vehicle.plateType || 'WHITE',
          };
        }

        return {
          orderId: ov.orderId,
          orderVehicleId: ov.id,
          vehicleId: ov.vehicleId,
          status: ov.status,
          paymentStatus: ov.order?.paymentStatus || 'PENDING',
          route: `${pickupArea} → ${dropArea}`,
          pickupDatetime: ov.pickupDatetime.toISOString(),
          pickupAddress: ov.pickupAddress,
          dropAddress: ov.dropAddress,
          tripType: ov.tripType,
          passenger: {
            id: ov.order?.passengerId || '',
            name: passengerName,
            rating: 0,
            totalTrips: 10,
            profilePicture: passengerProfilePicture,
          },
          owner: {
            id: ov.ownerId,
            name: ownerName,
            rating: 4.6,
            totalTrips: 10,
          },
          vehicle: vehicleName,
          vehicleDetails,
          // Driver fees intentionally omitted — payment is arranged privately
          // between the owner and their trusted driver.
          responseDeadline: ov.driverResponseDeadline
            ? ov.driverResponseDeadline.toISOString()
            : '',
          createdAt: ov.createdAt.toISOString(),
        };
      }),
    );

    return {
      data: formatted,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getOrderDetails(orderId: string, user: any) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!orderId || !uuidRegex.test(orderId)) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
    }

    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['vehicles', 'timeline'],
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'Order not found.',
      });
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
          plateType: 'WHITE',
        };

        const vehRes = await this.orderGrpcService.getVehicleById(v.vehicleId);
        if (vehRes?.vehicle) {
          vehicleDetails = {
            ...vehicleDetails,
            make: vehRes.vehicle.make || vehicleDetails.make,
            model: vehRes.vehicle.model || vehicleDetails.model,
            variant: vehRes.vehicle.variant || vehicleDetails.variant,
            color: vehRes.vehicle.color || vehicleDetails.color,
            registrationNumber:
              vehRes.vehicle.registrationNumber ||
              vehicleDetails.registrationNumber,
            seatingCapacity:
              vehRes.vehicle.seatingCapacity || vehicleDetails.seatingCapacity,
            hasAC:
              vehRes.vehicle.hasAC !== undefined
                ? vehRes.vehicle.hasAC
                : vehicleDetails.hasAC,
            photos: vehRes.vehicle.vehiclePhotos || vehicleDetails.photos,
            plateType: vehRes.vehicle.plateType || 'WHITE',
          };
        }

        let ownerName = 'Owner';
        const ownerRes = await this.orderGrpcService.getMe(v.ownerId);
        ownerName = ownerRes?.user?.name || ownerName;

        let driverDetails: any = null;
        if (v.assignedDriverId) {
          let driverName = 'Driver';
          const driverRes = await this.orderGrpcService.getMe(
            v.assignedDriverId,
          );
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

        const pb = v.priceBreakdown || {
          basePrice: Number(v.price),
          gst: 0,
          platformFee: 0,
          discount: 0,
          total: Number(v.price),
          advancePercentage: 25,
          advanceAmount: Math.round(Number(v.price) * 0.25),
          balanceAmount: Number(v.price) - Math.round(Number(v.price) * 0.25),
          currency: 'INR',
        };

        return {
          orderVehicleId: v.id,
          vehicle: vehicleDetails,
          owner: {
            id: v.ownerId,
            name: ownerName,
            rating: 4.6,
            totalTrips: 23,
          },
          driver: driverDetails,
          pricing: pb,
        };
      }),
    );

    const orderPb = order.priceBreakdown || {
      basePrice: Number(order.totalAmount),
      gst: 0,
      platformFee: 0,
      discount: Number(order.discountAmount),
      total: Number(order.totalAmount),
      advancePercentage: 25,
      advanceAmount: Number(order.advanceAmount),
      balanceAmount: Number(order.totalAmount) - Number(order.advanceAmount),
      currency: 'INR',
    };

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
      returnDatetime: first?.returnDatetime
        ? first.returnDatetime.toISOString()
        : null,
      tripType: first?.tripType || 'ROUND_TRIP',
      totalDays: first?.totalDays || 1,
      passengerNote: order.passengerNote,
      vehicles,
      payment: {
        status: order.paymentStatus,
        advanceAmount: orderPb.advanceAmount,
        advanceDue: order.paymentStatus === PaymentStatus.PENDING,
        paymentLink:
          order.paymentStatus === PaymentStatus.PENDING
            ? order.paymentLink
            : null,
        totalAmount: orderPb.total,
        originalAmount: orderPb.basePrice,
        discountAmount: orderPb.discount,
        promoCode: order.promoCode || '',
        basePrice: orderPb.basePrice,
        gst: orderPb.gst,
        platformFee: orderPb.platformFee,
        balanceAmount: orderPb.balanceAmount,
        currency: orderPb.currency,
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
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException({
        error: 'BOOKING_NOT_FOUND',
        message: 'Booking not found',
      });
    }

    const vehicles = await this.orderVehicleRepository.find({
      where: { orderId },
    });
    const tripStartDate =
      vehicles.length > 0
        ? new Date(
            Math.min(
              ...vehicles.map((v) => new Date(v.pickupDatetime).getTime()),
            ),
          )
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
    const vehicles = await this.orderVehicleRepository.find({
      where: { orderId },
    });
    const mapped = vehicles.map((v) => ({
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

  async getOrderVehicle(id: string) {
    const v = await this.orderVehicleRepository.findOne({
      where: { id },
      relations: ['order'],
    });
    if (!v) {
      throw new NotFoundException({
        error: 'ORDER_VEHICLE_NOT_FOUND',
        message: 'Order vehicle not found',
      });
    }

    return {
      id: v.id,
      orderId: v.orderId,
      vehicleId: v.vehicleId,
      ownerId: v.ownerId,
      status: v.status,
      price: Number(v.price),
      assignedDriverId: v.assignedDriverId || '',
      pickupLat: v.pickupLat ? parseFloat(v.pickupLat.toString()) : 0,
      pickupLng: v.pickupLng ? parseFloat(v.pickupLng.toString()) : 0,
      dropLat: v.dropLat ? parseFloat(v.dropLat.toString()) : 0,
      dropLng: v.dropLng ? parseFloat(v.dropLng.toString()) : 0,
      pickupAddress: v.pickupAddress || '',
      dropAddress: v.dropAddress || '',
      passengerId: v.order ? v.order.passengerId : '',
    };
  }

  async updateBookingStatus(
    orderId: string,
    status: string,
    visibleStatus: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });
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

  async getOwnerEarnings(
    ownerId: string,
    period: string,
    year: number,
    month: number,
  ) {
    const query = this.orderVehicleRepository
      .createQueryBuilder('ov')
      .where('ov.ownerId = :ownerId', { ownerId })
      .andWhere('ov.status = :status', { status: 'COMPLETED' });

    const completed = await query.getMany();

    let totalGross = 0;
    let totalTrips = 0;
    const byVehicle: Record<
      string,
      { gross: number; trips: number; vehicleId: string }
    > = {};

    for (const ov of completed) {
      if (ov.completedAt) {
        const compDate = new Date(ov.completedAt);
        if (
          compDate.getFullYear() === year &&
          (month === 0 || compDate.getMonth() + 1 === month)
        ) {
          const price = Number(ov.price) || 0;
          totalGross += price;
          totalTrips++;
          if (!byVehicle[ov.vehicleId]) {
            byVehicle[ov.vehicleId] = {
              gross: 0,
              trips: 0,
              vehicleId: ov.vehicleId,
            };
          }
          byVehicle[ov.vehicleId].gross += price;
          byVehicle[ov.vehicleId].trips++;
        }
      }
    }

    const platformFee = Math.round(totalGross * 0.03 * 100) / 100;
    const netEarnings = totalGross - platformFee;

    const summary = {
      totalGrossEarnings: totalGross,
      totalPlatformFee: platformFee,
      totalNetEarnings: netEarnings,
      totalTrips,
    };

    const chartData = [
      { label: 'Week 1', gross: Math.round(totalGross * 0.2) },
      { label: 'Week 2', gross: Math.round(totalGross * 0.3) },
      { label: 'Week 3', gross: Math.round(totalGross * 0.25) },
      { label: 'Week 4', gross: Math.round(totalGross * 0.25) },
    ];

    return {
      period,
      month: month ? month.toString() : 'ALL',
      summaryJson: JSON.stringify(summary),
      byVehicleJson: JSON.stringify(Object.values(byVehicle)),
      chartDataJson: JSON.stringify(chartData),
    };
  }

  async getPayoutHistory(
    ownerId: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    const page = pageQuery || 1;
    const limit = limitQuery || 10;

    const mockPayouts = [
      {
        payoutId: 'pay_uuid_1092',
        amount: 8500,
        status: 'SUCCESS',
        processedAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
        bankName: 'State Bank of India',
        accountLast4: '4321',
      },
      {
        payoutId: 'pay_uuid_1091',
        amount: 12400,
        status: 'SUCCESS',
        processedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
        bankName: 'State Bank of India',
        accountLast4: '4321',
      },
    ];

    return {
      payoutsJson: JSON.stringify(mockPayouts),
      paginationJson: JSON.stringify({
        page,
        limit,
        total: mockPayouts.length,
        totalPages: 1,
      }),
    };
  }

  async downloadEarningsStatement(ownerId: string, year: number) {
    const completed = await this.orderVehicleRepository.find({
      where: { ownerId, status: OrderVehicleStatus.COMPLETED },
    });

    let totalGross = 0;
    let totalTrips = 0;
    for (const ov of completed) {
      if (ov.completedAt && new Date(ov.completedAt).getFullYear() === year) {
        totalGross += Number(ov.price) || 0;
        totalTrips++;
      }
    }

    const platformFee = Math.round(totalGross * 0.03 * 100) / 100;
    const netEarnings = totalGross - platformFee;

    return {
      year,
      ownerName: 'Owner',
      panNumber: 'ABCDE1234F',
      totalGrossEarnings: totalGross,
      totalPlatformFee: platformFee,
      totalNetEarnings: netEarnings,
      totalTrips,
      statementUrl: `https://rkrk-statements.s3.amazonaws.com/earnings_${ownerId}_${year}.pdf`,
      generatedAt: new Date().toISOString(),
    };
  }

  async getDriverEarnings(
    driverId: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    const page = pageQuery || 1;
    const limit = limitQuery || 10;

    const completed = await this.orderVehicleRepository.find({
      where: {
        assignedDriverId: driverId,
        status: OrderVehicleStatus.COMPLETED,
      },
    });

    let totalGross = 0;
    let totalTrips = 0;
    const list: any[] = [];

    for (const ov of completed) {
      const driverFee = 300 * (ov.totalDays || 1);
      totalGross += driverFee;
      totalTrips++;
      list.push({
        orderId: ov.orderId,
        date: ov.completedAt
          ? ov.completedAt.toISOString()
          : new Date().toISOString(),
        gross: driverFee,
        platformFee: Math.round(driverFee * 0.02 * 100) / 100,
        net: Math.round(driverFee * 0.98 * 100) / 100,
      });
    }

    const platformFee = Math.round(totalGross * 0.02 * 100) / 100;
    const netEarnings = totalGross - platformFee;

    return {
      earningsJson: JSON.stringify(list),
      summaryJson: JSON.stringify({
        totalGrossEarnings: totalGross,
        totalPlatformFee: platformFee,
        totalNetEarnings: netEarnings,
        totalTrips,
      }),
      paginationJson: JSON.stringify({
        page,
        limit,
        total: totalTrips,
        totalPages: Math.ceil(totalTrips / limit),
      }),
    };
  }

  async raiseDispute(body: any) {
    const { orderId, userId, type, description, photos, raisedBy } = body;
    const dispute = this.disputeRepository.create({
      orderId,
      userId,
      type,
      description,
      photos: photos || [],
      status: 'OPEN',
      raisedBy,
    });
    const saved = await this.disputeRepository.save(dispute);
    return {
      disputeId: saved.id,
      orderId: saved.orderId,
      type: saved.type,
      status: saved.status,
      raisedBy: saved.raisedBy,
      message: 'Dispute raised successfully. Support team will contact you.',
      createdAt: saved.createdAt.toISOString(),
      resolution: '',
      refundAmount: 0,
      resolvedAt: '',
    };
  }

  async getDispute(orderId: string, userId: string) {
    const dispute = await this.disputeRepository.findOne({
      where: { orderId, userId },
    });
    if (!dispute) {
      throw new NotFoundException({
        error: 'DISPUTE_NOT_FOUND',
        message: 'No active dispute found for this order.',
      });
    }
    return {
      disputeId: dispute.id,
      orderId: dispute.orderId,
      type: dispute.type,
      status: dispute.status,
      raisedBy: dispute.raisedBy,
      message: 'Dispute status fetched.',
      createdAt: dispute.createdAt.toISOString(),
      resolution: dispute.resolution || '',
      refundAmount: Number(dispute.refundAmount) || 0,
      resolvedAt: dispute.resolvedAt ? dispute.resolvedAt.toISOString() : '',
    };
  }

  async adminGetDisputes(
    statusQuery?: string,
    pageQuery?: number,
    limitQuery?: number,
  ) {
    const page = pageQuery || 1;
    const limit = limitQuery || 10;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (statusQuery) {
      where.status = statusQuery;
    }

    const [disputes, total] = await this.disputeRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    const mapped = disputes.map((d) => ({
      disputeId: d.id,
      orderId: d.orderId,
      userId: d.userId,
      type: d.type,
      status: d.status,
      raisedBy: d.raisedBy,
      createdAt: d.createdAt.toISOString(),
      description: d.description,
      resolution: d.resolution || '',
      refundAmount: Number(d.refundAmount) || 0,
      resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : '',
    }));

    return {
      disputesJson: JSON.stringify(mapped),
      paginationJson: JSON.stringify({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }),
    };
  }

  async adminResolveDispute(body: any) {
    const {
      disputeId,
      resolution,
      refundAmount,
      refundTo,
      penaliseOwner,
      penaltyAmount,
    } = body;
    const dispute = await this.disputeRepository.findOne({
      where: { id: disputeId },
    });
    if (!dispute) {
      throw new NotFoundException({
        error: 'DISPUTE_NOT_FOUND',
        message: 'Dispute not found.',
      });
    }

    dispute.status = 'RESOLVED';
    dispute.resolution = resolution;
    dispute.refundAmount = refundAmount || 0;
    dispute.refundTo = refundTo || '';
    dispute.penaliseOwner = penaliseOwner || false;
    dispute.penaltyAmount = penaltyAmount || 0;
    dispute.resolvedAt = new Date();

    const saved = await this.disputeRepository.save(dispute);
    return {
      disputeId: saved.id,
      orderId: saved.orderId,
      type: saved.type,
      status: saved.status,
      raisedBy: saved.raisedBy,
      message: 'Dispute resolved successfully.',
      createdAt: saved.createdAt.toISOString(),
      resolution: saved.resolution,
      refundAmount: Number(saved.refundAmount),
      resolvedAt: saved.resolvedAt.toISOString(),
    };
  }

  async getOrderOtp(orderId: string, vehicleId: string, userId: string) {
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

    if (ov.order && ov.order.paymentStatus !== PaymentStatus.COMPLETED) {
      throw new BadRequestException({
        error: 'ADVANCE_PAYMENT_PENDING',
        message: 'Advance payment must be completed before retrieving the OTP.',
      });
    }

    return {
      orderId: ov.orderId,
      vehicleId: ov.vehicleId,
      otp: ov.otp || '4729',
      otpExpiresAt: ov.otpExpiresAt
        ? ov.otpExpiresAt.toISOString()
        : new Date().toISOString(),
      otpStatus: ov.otp ? 'ACTIVE' : 'NOT_GENERATED',
      instruction: 'Share this OTP with the driver to start the trip.',
    };
  }

  async adminGetAnalytics(from: string, to: string) {
    const totalBookings = await this.orderRepository.count();
    const totalCompleted = await this.orderVehicleRepository.count({
      where: { status: OrderVehicleStatus.COMPLETED },
    });
    const totalCancelled = await this.orderVehicleRepository.count({
      where: { status: OrderVehicleStatus.OWNER_CANCELLED },
    });

    const revenue = await this.orderRepository
      .createQueryBuilder('o')
      .select('SUM(o.totalAmount)', 'total')
      .getRawOne();

    const totalRevenue = Number(revenue?.total) || 128500;

    const totals = {
      totalBookings,
      totalRevenue,
      averageOrderValue:
        totalBookings > 0 ? Math.round(totalRevenue / totalBookings) : 3400,
      activeVehicles: 24,
      totalUsers: 142,
    };

    const bookingsByDay = [
      { date: new Date().toISOString().split('T')[0], bookings: totalBookings },
    ];

    const topCities = [
      { city: 'Jamshedpur', bookings: Math.round(totalBookings * 0.6) },
      { city: 'Ranchi', bookings: Math.round(totalBookings * 0.4) },
    ];

    return {
      periodJson: JSON.stringify({ from, to }),
      totalsJson: JSON.stringify(totals),
      bookingsByDayJson: JSON.stringify(bookingsByDay),
      topCitiesJson: JSON.stringify(topCities),
      cancellationRate:
        totalBookings > 0
          ? `${Math.round((totalCancelled / totalBookings) * 100)}%`
          : '5%',
      averageRating: 4.7,
    };
  }

  async getOrderPaymentStatus(orderId: string) {
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

    let calculatedStatus = 'PENDING';
    if (order.paymentStatus === 'FAILED') {
      calculatedStatus = 'FAILED';
    } else if (
      order.paymentStatus === 'COMPLETED' ||
      order.paymentStatus === 'PAID'
    ) {
      const allCompleted =
        order.vehicles.length > 0 &&
        order.vehicles.every((v) => v.status === OrderVehicleStatus.COMPLETED);
      calculatedStatus = allCompleted ? 'FULLY_PAID' : 'ADVANCE_PAID';
    }

    const totalAmount = Number(order.totalAmount) || 0;
    const advanceAmount = Number(order.advanceAmount) || 0;
    const remainingAmount = totalAmount - advanceAmount;

    return {
      orderId: order.id,
      paymentStatus: calculatedStatus,
      totalAmount,
      advanceAmount,
      remainingAmount,
    };
  }
}