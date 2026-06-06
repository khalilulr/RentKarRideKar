import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  RatingServiceClient,
  RATING_SERVICE_NAME,
} from '../../../../libs/types/rating';

@Controller('api')
export class RatingController implements OnModuleInit {
  private ratingService: RatingServiceClient;

  constructor(
    @Inject('RATING_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.ratingService = this.client.getService<RatingServiceClient>(
      RATING_SERVICE_NAME,
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 1. Reviews Routes
  // ─────────────────────────────────────────────────────────────

  @Post('reviews')
  @UseGuards(JwtAuthGuard)
  createReview(@CurrentUser() user: any, @Body() body: any): Observable<any> {
    return this.ratingService.submitReview({
      reviewerId: user.userId,
      ...body,
    });
  }

  @Get('users/:userId/rating')
  getUserRating(@Param('userId') userId: string): Observable<any> {
    return this.ratingService.getUserRating({ userId });
  }

  @Get('users/:userId/reviews')
  getUserReviews(
    @Param('userId') userId: string,
    @Query('role') role?: string,
    @Query('sortBy') sortBy?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    const limitVal = limit ? parseInt(limit, 10) : 20;
    return this.ratingService.getUserReviews({
      userId,
      role: role || '',
      sortBy: sortBy || 'date',
      cursor: cursor || '',
      limit: limitVal,
    }).pipe(
      map(res => ({
        data: res.dataJson ? JSON.parse(res.dataJson) : [],
        nextCursor: res.nextCursor || null,
        total: res.total,
      }))
    );
  }

  @Post('reviews/:reviewId/respond')
  @UseGuards(JwtAuthGuard)
  respondToReview(
    @CurrentUser() user: any,
    @Param('reviewId') reviewId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.ratingService.respondToReview({
      userId: user.userId,
      reviewId,
      ...body,
    });
  }

  @Post('reviews/:reviewId/like')
  @UseGuards(JwtAuthGuard)
  likeReview(
    @CurrentUser() user: any,
    @Param('reviewId') reviewId: string,
  ): Observable<any> {
    return this.ratingService.likeReview({ reviewId, userId: user.userId });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Cancellation Routes
  // ─────────────────────────────────────────────────────────────

  @Post('bookings/:bookingId/cancel')
  @UseGuards(JwtAuthGuard)
  cancelBooking(
    @CurrentUser() user: any,
    @Param('bookingId') bookingId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.ratingService.cancelBooking({
      userId: user.userId,
      bookingId,
      ...body,
    });
  }

  @Get('users/:userId/cancellation-stats')
  getCancellationStats(@Param('userId') userId: string): Observable<any> {
    return this.ratingService.getCancellationStats({ userId });
  }

  @Get('bookings/:bookingId/cancellation-deadline')
  getCancellationDeadline(@Param('bookingId') bookingId: string): Observable<any> {
    return this.ratingService.getCancellationDeadline({ bookingId });
  }

  @Get('users/:userId/reputation')
  getUserReputation(@Param('userId') userId: string): Observable<any> {
    return this.ratingService.getUserReputation({ userId }).pipe(
      map(res => ({
        overallRating: res.overallRating,
        starVisualization: res.starVisualization,
        categoryBreakdown: res.categoryBreakdown,
        reliabilityScore: res.reliabilityScore,
        badgeLevel: res.badgeLevel,
        recentReviews: res.recentReviewsJson ? JSON.parse(res.recentReviewsJson) : [],
        tripCompletionCount: res.tripCompletionCount,
        ratingTrend: res.ratingTrend,
      }))
    );
  }
}
