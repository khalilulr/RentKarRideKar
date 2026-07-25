import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull, Not } from 'typeorm';
import { Review } from '../entities/Review.entity';

@Injectable()
export class ReviewRepository {
  constructor(
    @InjectRepository(Review)
    private readonly repo: Repository<Review>,
  ) {}

  async create(reviewData: Partial<Review>): Promise<Review> {
    const review = this.repo.create(reviewData);
    return this.repo.save(review);
  }

  async save(review: Review): Promise<Review> {
    return this.repo.save(review);
  }

  async findById(id: string): Promise<Review | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByBookingRoleAndTarget(
    bookingId: string,
    reviewerRole: 'owner' | 'passenger',
    targetType: 'driver' | 'vehicle' | 'passenger',
  ): Promise<Review | null> {
    return this.repo.findOne({
      where: { bookingId, reviewerRole, targetType },
    });
  }

  async findBothReviewsForBooking(bookingId: string): Promise<Review[]> {
    return this.repo.find({ where: { bookingId } });
  }

  async findPendingExpiredReviews(now: Date): Promise<Review[]> {
    return this.repo.find({
      where: {
        revealedAt: IsNull(),
        expiresAt: LessThan(now),
      },
    });
  }

  async findRevealedByReviewee(
    revieweeId: string,
    role?: 'owner' | 'passenger',
    sortBy: 'date' | 'rating' = 'date',
    cursor?: string,
    limit: number = 20,
  ): Promise<{ data: Review[]; nextCursor: string | null; total: number }> {
    // 1. Get total count
    const totalQuery = this.repo
      .createQueryBuilder('review')
      .where('review.reviewee_id = :revieweeId', { revieweeId })
      .andWhere('review.revealed_at IS NOT NULL');

    if (role) {
      totalQuery.andWhere('review.reviewer_role = :role', { role });
    }

    const total = await totalQuery.getCount();

    // 2. Fetch paginated data
    const queryBuilder = this.repo
      .createQueryBuilder('review')
      .where('review.reviewee_id = :revieweeId', { revieweeId })
      .andWhere('review.revealed_at IS NOT NULL');

    if (role) {
      queryBuilder.andWhere('review.reviewer_role = :role', { role });
    }

    // Cursor parsing
    if (cursor) {
      const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
      const [cursorSubmittedAtStr, cursorId] = decodedCursor.split('_');
      const cursorDate = new Date(cursorSubmittedAtStr);

      if (sortBy === 'rating') {
        // Sort by overall_rating DESC, then submitted_at DESC, then id DESC
        // For simplicity: (rating < cursorRating) OR (rating = cursorRating AND submittedAt < cursorSubmittedAt) OR (rating = cursorRating AND submittedAt = cursorSubmittedAt AND id < cursorId)
        // Since custom ordering can get complex, let's keep cursor logic on rating + submitted_at
        // Let's decode it: [rating, submittedAt, id]
        const [cursorRatingStr] = decodedCursor.split('_');
        const cursorRating = parseInt(cursorRatingStr, 10);
        queryBuilder.andWhere(
          `(review.overall_rating < :cursorRating OR ` +
            `(review.overall_rating = :cursorRating AND review.submitted_at < :cursorDate) OR ` +
            `(review.overall_rating = :cursorRating AND review.submitted_at = :cursorDate AND review.id < :cursorId))`,
          { cursorRating, cursorDate, cursorId },
        );
      } else {
        // Default cursor sorting: (submitted_at < cursorDate) OR (submitted_at = cursorDate AND id < cursorId)
        queryBuilder.andWhere(
          `(review.submitted_at < :cursorDate OR (review.submitted_at = :cursorDate AND review.id < :cursorId))`,
          { cursorDate, cursorId },
        );
      }
    }

    // Apply sorting
    if (sortBy === 'rating') {
      queryBuilder
        .orderBy('review.overall_rating', 'DESC')
        .addOrderBy('review.submitted_at', 'DESC')
        .addOrderBy('review.id', 'DESC');
    } else {
      queryBuilder
        .orderBy('review.submitted_at', 'DESC')
        .addOrderBy('review.id', 'DESC');
    }

    // Fetch limit + 1 to check if there is a next page
    const data = await queryBuilder.take(limit + 1).getMany();

    const hasNext = data.length > limit;
    const paginatedData = hasNext ? data.slice(0, limit) : data;

    let nextCursor: string | null = null;
    if (hasNext && paginatedData.length > 0) {
      const lastItem = paginatedData[paginatedData.length - 1];
      if (sortBy === 'rating') {
        nextCursor = Buffer.from(
          `${lastItem.overallRating}_${lastItem.submittedAt.toISOString()}_${lastItem.id}`,
        ).toString('base64');
      } else {
        nextCursor = Buffer.from(
          `${lastItem.submittedAt.toISOString()}_${lastItem.id}`,
        ).toString('base64');
      }
    }

    return {
      data: paginatedData,
      nextCursor,
      total,
    };
  }

  async findRevealedReviewsForCalculation(
    revieweeId: string,
  ): Promise<Review[]> {
    return this.repo.find({
      where: {
        revieweeId,
        revealedAt: Not(IsNull()),
      },
      order: {
        submittedAt: 'DESC',
      },
    });
  }
}
