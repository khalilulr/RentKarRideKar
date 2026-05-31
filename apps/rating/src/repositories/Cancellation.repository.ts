import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cancellation } from '../entities/Cancellation.entity';

@Injectable()
export class CancellationRepository {
  constructor(
    @InjectRepository(Cancellation)
    private readonly repo: Repository<Cancellation>,
  ) {}

  async create(cancellationData: Partial<Cancellation>): Promise<Cancellation> {
    const cancellation = this.repo.create(cancellationData);
    return this.repo.save(cancellation);
  }

  async save(cancellation: Cancellation): Promise<Cancellation> {
    return this.repo.save(cancellation);
  }

  async findById(id: string): Promise<Cancellation | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByBookingId(bookingId: string): Promise<Cancellation | null> {
    return this.repo.findOne({ where: { bookingId } });
  }

  async countCancellationsByUser(userId: string): Promise<{ total: number; late: number }> {
    const total = await this.repo.count({ where: { cancelledById: userId } });
    const late = await this.repo.count({ where: { cancelledById: userId, isLate: true } });
    return { total, late };
  }
}
