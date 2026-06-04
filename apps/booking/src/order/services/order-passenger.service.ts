import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderGrpcService } from './order-grpc.service';
import { OrderStatus } from '../enum/order-status.enum';
import { VisibleStatus } from '../enum/visiblestatus-type.enum';
import { PaymentStatus } from '../enum/payment-status.enum';

@Injectable()
export class OrderPassengerService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly orderGrpcService: OrderGrpcService,
  ) {}

  async passengerCancelOrder(orderId: string, body: any) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['vehicles'],
    });

    if (!order) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'Order not found.' });
    }

    order.status = OrderStatus.CANCELLED;
    order.visibleStatus = VisibleStatus.CANCELLED;
    await this.orderRepository.save(order);

    // Deallocate proxy immediately if cancellation happens after proxy window opened
    await this.orderGrpcService.triggerDeactivateProxy(orderId, 'cancelled');

    const first = order.vehicles[0];
    const pickupTime = first?.pickupDatetime ? new Date(first.pickupDatetime) : new Date();
    const hoursDifference = (pickupTime.getTime() - Date.now()) / (1000 * 60 * 60);

    let refundAmount = 0;
    let percentage = 0;
    let reason = 'No payment was made. No refund applicable.';

    if (order.paymentStatus === PaymentStatus.COMPLETED) {
      if (hoursDifference > 48) {
        refundAmount = Number(order.advanceAmount);
        percentage = 100;
        reason = 'Cancelled more than 48 hours before trip';
      } else if (hoursDifference >= 24) {
        refundAmount = Number(order.advanceAmount) * 0.5;
        percentage = 50;
        reason = 'Cancelled between 24-48 hours before trip';
      } else {
        refundAmount = 0;
        percentage = 0;
        reason = 'Cancelled less than 24 hours before trip';
      }
    }

    return {
      orderId: order.id,
      status: OrderStatus.CANCELLED,
      cancelledBy: 'PASSENGER',
      cancelledAt: new Date().toISOString(),
      refund: {
        amount: refundAmount,
        percentage,
        reason,
        refundStatus: refundAmount > 0 ? 'PROCESSING' : undefined,
        estimatedCreditTime: refundAmount > 0 ? '3-5 business days' : undefined,
        forfeitedAmount:
          refundAmount === 0 && order.paymentStatus === PaymentStatus.COMPLETED
            ? Number(order.advanceAmount)
            : undefined,
        forfeitedTo:
          refundAmount === 0 && order.paymentStatus === PaymentStatus.COMPLETED ? 'owner' : undefined,
      },
      ownerNotified: true,
    };
  }
}
