import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewLike } from '../entities/ReviewLike.entity';

@Injectable()
export class ReviewLikeRepository {
  constructor(
    @InjectRepository(ReviewLike)
    private readonly repo: Repository<ReviewLike>,
  ) {}

  async exists(reviewId: string, userId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { reviewId, userId } });
    return count > 0;
  }

  async create(reviewId: string, userId: string): Promise<ReviewLike> {
    const like = this.repo.create({ reviewId, userId });
    return this.repo.save(like);
  }
}
