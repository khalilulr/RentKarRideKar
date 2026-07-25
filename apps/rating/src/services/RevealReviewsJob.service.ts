import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ReviewRepository } from '../repositories/Review.repository';
import { ReputationRepository } from '../repositories/Reputation.repository';

@Injectable()
export class RevealReviewsJobService implements OnApplicationBootstrap {
  constructor(
    private readonly reviewRepo: ReviewRepository,
    private readonly reputationRepo: ReputationRepository,
  ) {}

  onApplicationBootstrap() {
    // Run immediately on startup
    this.runRevealJob().catch((err) =>
      console.error('[Reveal Job Initial Run Error]:', err),
    );

    // Schedule task to run every 15 minutes (15 * 60 * 1000 ms)
    setInterval(
      () => {
        this.runRevealJob().catch((err) =>
          console.error('[Reveal Job Cron Run Error]:', err),
        );
      },
      15 * 60 * 1000,
    );
  }

  async runRevealJob(): Promise<void> {
    const now = new Date();
    const expiredReviews = await this.reviewRepo.findPendingExpiredReviews(now);

    if (expiredReviews.length === 0) {
      return;
    }

    console.log(
      `[Reveal Job] Found ${expiredReviews.length} expired pending reviews. Revealing now...`,
    );

    for (const r of expiredReviews) {
      r.revealedAt = now;
      await this.reviewRepo.save(r);
      await this.reputationRepo.invalidate(r.revieweeId);
    }
  }
}
