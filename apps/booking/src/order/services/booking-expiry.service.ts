import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderVehicle } from '../entities/order-vehicle.entity';
import { OrderTimeline } from '../entities/order-timeline.entity';
import { OrderStatus } from '../enum/order-status.enum';
import { VisibleStatus } from '../enum/visiblestatus-type.enum';
import { OrderVehicleStatus } from '../enum/order-vehicle-status.enum';
import { OrderGrpcService } from './order-grpc.service';

/**
 * BookingExpiryService — Automatic booking cancellation.
 *
 * If a vehicle owner does not respond to a booking request within the
 * configured window (default 150 minutes), the booking is automatically CANCELLED,
 * the passenger and owner are notified, and the vehicle becomes bookable again.
 */
@Injectable()
export class BookingExpiryService implements OnModuleInit {
  private readonly logger = new Logger(BookingExpiryService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderVehicle)
    private readonly orderVehicleRepository: Repository<OrderVehicle>,
    @InjectRepository(OrderTimeline)
    private readonly orderTimelineRepository: Repository<OrderTimeline>,
    private readonly orderGrpcService: OrderGrpcService,
  ) {}

  onModuleInit() {
    this.logger.log(
      `Booking auto-expiry active — owner response window: ${this.getTimeoutMinutes()} minutes`,
    );
  }

  private getTimeoutMinutes(): number {
    return parseFloat(
      this.configService.get<string>('OWNER_RESPONSE_TIMEOUT_MINUTES') || '150',
    );
  }

  /** Statuses representing "waiting for the owner" */
  private static readonly AWAITING_OWNER = [OrderStatus.OWNER_PENDING];

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireUnansweredBookings(): Promise<void> {
    const timeoutMs = this.getTimeoutMinutes() * 60 * 1000;
    const cutoff = new Date(Date.now() - timeoutMs);

    try {
      // 1. Find candidates (joining the vehicles relation to retrieve ownerId)
      const staleOrders = await this.orderRepository.find({
        where: {
          status: In(BookingExpiryService.AWAITING_OWNER),
          createdAt: LessThan(cutoff),
        },
        relations: ['vehicles'],
      });

      if (staleOrders.length === 0) return;

      const orderIds = staleOrders.map((o) => o.id);

      // 2. Expire them atomically in the database
      await this.orderRepository.update(
        {
          id: In(orderIds),
          status: In(BookingExpiryService.AWAITING_OWNER),
        },
        {
          status: OrderStatus.CANCELLED,
          visibleStatus: VisibleStatus.CANCELLED,
        },
      );

      // Update the association state for the vehicles
      await this.orderVehicleRepository.update(
        {
          orderId: In(orderIds),
          status: OrderVehicleStatus.PENDING_OWNER_RESPONSE,
        },
        {
          status: OrderVehicleStatus.OWNER_REJECTED,
        },
      );

      // 3. Add timeline logs and send notifications
      for (const order of staleOrders) {
        // Create timeline cancellation record
        const timelineEntry = this.orderTimelineRepository.create({
          orderId: order.id,
          status: 'EXPIRED',
          description: `Auto-cancelled: Owner did not respond within ${this.getTimeoutMinutes()} minutes.`,
          timestamp: new Date(),
        });
        await this.orderTimelineRepository.save(timelineEntry);

        // Cancel pending Whatsapp notifications/reminders for this order request
        await this.orderGrpcService.cancelNotification(
          `order_request:${order.id}`,
        );

        // Notify passenger and owners
        await this.notifyExpiry(order).catch((err) =>
          this.logger.warn(
            `Failed to send expiry notification for order ${order.id}: ${err.message}`,
          ),
        );
      }

      this.logger.log(
        `Auto-expired ${staleOrders.length} booking(s) past the owner-response deadline.`,
      );
    } catch (err: any) {
      this.logger.error(`Booking expiry sweep failed: ${err.message}`);
    }
  }

  private async notifyExpiry(order: Order): Promise<void> {
    const title = 'Booking Request Expired';
    const content =
      `Booking request has been automatically cancelled because the vehicle owner ` +
      `did not respond within ${this.getTimeoutMinutes()} minutes. ` +
      `No payment was taken.`;

    // Notify passenger (In-App)
    await this.orderGrpcService.sendNotification(
      order.passengerId,
      title,
      content,
      'in-app',
    );

    // Notify owner(s) (In-App)
    if (order.vehicles) {
      for (const ov of order.vehicles) {
        if (ov.ownerId) {
          await this.orderGrpcService.sendNotification(
            ov.ownerId,
            'Booking Request Missed',
            `You did not respond to booking request ${order.id} in time; it has been auto-cancelled.`,
            'in-app',
          );
        }
      }
    }
  }
}
