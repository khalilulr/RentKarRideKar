import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReputationCache } from '../entities/ReputationCache.entity';

@Injectable()
export class ReputationRepository {
  constructor(
    @InjectRepository(ReputationCache)
    private readonly repo: Repository<ReputationCache>,
  ) {}

  async findByUserId(userId: string): Promise<ReputationCache | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async save(cacheData: Partial<ReputationCache>): Promise<ReputationCache> {
    let cache = await this.repo.findOne({
      where: { userId: cacheData.userId! },
    });
    if (!cache) {
      cache = this.repo.create(cacheData);
    } else {
      Object.assign(cache, cacheData);
    }
    cache.lastComputedAt = new Date();
    return this.repo.save(cache);
  }

  async invalidate(userId: string): Promise<void> {
    // Setting lastComputedAt to epoch so it's guaranteed to be stale (> 10 mins old)
    const cache = await this.repo.findOne({ where: { userId } });
    if (cache) {
      cache.lastComputedAt = new Date(0);
      await this.repo.save(cache);
    }
  }
}
