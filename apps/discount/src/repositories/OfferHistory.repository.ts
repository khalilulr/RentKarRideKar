import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfferHistory } from '../entities/OfferHistory.entity';

@Injectable()
export class OfferHistoryRepository {
  constructor(
    @InjectRepository(OfferHistory)
    private readonly repo: Repository<OfferHistory>,
  ) {}

  async recordUsage(usage: Partial<OfferHistory>): Promise<OfferHistory> {
    const record = this.repo.create(usage);
    return this.repo.save(record);
  }

  async findByUserId(userId: string): Promise<OfferHistory[]> {
    return this.repo.find({
      where: { userId },
      order: { usedAt: 'DESC' },
    });
  }

  async countByUserId(userId: string): Promise<number> {
    return this.repo.count({ where: { userId } });
  }

  async hasUsedOffer(userId: string, offerCode: string): Promise<boolean> {
    // case insensitive search
    const count = await this.repo.createQueryBuilder('history')
      .where('history.user_id = :userId', { userId })
      .andWhere('LOWER(history.offer_code) = LOWER(:offerCode)', { offerCode })
      .getCount();
    return count > 0;
  }

  async getUsageCounts(): Promise<Record<string, number>> {
    const raw = await this.repo.createQueryBuilder('history')
      .select('history.offer_code', 'offerCode')
      .addSelect('COUNT(history.id)', 'count')
      .groupBy('history.offer_code')
      .getRawMany();
    
    const counts: Record<string, number> = {};
    for (const row of raw) {
      if (row.offerCode) {
        counts[row.offerCode.toLowerCase()] = parseInt(row.count, 10);
      }
    }
    return counts;
  }

  async countByOfferCode(offerCode: string): Promise<number> {
    const count = await this.repo.createQueryBuilder('history')
      .where('LOWER(history.offer_code) = LOWER(:offerCode)', { offerCode })
      .getCount();
    return count;
  }
}
