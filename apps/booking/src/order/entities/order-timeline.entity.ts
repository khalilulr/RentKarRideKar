import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_timelines')
export class OrderTimeline {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Order, (order) => order.timeline, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'order_id' })
  orderId: string;

  @Column()
  status: string;

  @Column()
  description: string;

  @Column({ type: 'timestamp', name: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  timestamp: Date;
}
