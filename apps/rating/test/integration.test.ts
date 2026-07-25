import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { RatingModule } from '../src/rating.module';
import { BookingIntegrationService } from '../src/services/BookingIntegration.service';
import { ReviewService } from '../src/services/Review.service';
import { CancellationService } from '../src/services/Cancellation.service';
import { ReviewRepository } from '../src/repositories/Review.repository';
import { Review } from '../src/entities/Review.entity';
import { ReviewLike } from '../src/entities/ReviewLike.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('Ratings & Cancellations Microservice Integration Tests', () => {
  let app: INestApplication;
  let reviewService: ReviewService;
  let cancellationService: CancellationService;
  let reviewRepo: Repository<Review>;
  let reviewLikeRepo: Repository<ReviewLike>;

  const mockBookingIntegration = {
    getBooking: jest.fn(),
    getOrderVehicles: jest.fn(),
    updateBookingStatus: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [RatingModule],
    })
      .overrideProvider(BookingIntegrationService)
      .useValue(mockBookingIntegration)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    reviewService = app.get(ReviewService);
    cancellationService = app.get(CancellationService);
    reviewRepo = app.get(getRepositoryToken(Review));
    reviewLikeRepo = app.get(getRepositoryToken(ReviewLike));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await reviewLikeRepo.createQueryBuilder().delete().execute();
    await reviewRepo.createQueryBuilder().delete().execute();
  });

  describe('Submit Review Flow', () => {
    it('reveals both reviews immediately when both passenger and owner have submitted', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f435';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f436';
      const ownerId = 'd3b07384-d113-49c3-a5af-aa1d5964f437';

      mockBookingIntegration.getBooking.mockResolvedValue({
        id: bookingId,
        passengerId,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        tripStartDate: new Date(),
      });

      mockBookingIntegration.getOrderVehicles.mockResolvedValue([
        { id: 'ov_1', owner_id: ownerId, completed_at: new Date() },
      ]);

      // 1. Submit review from Passenger -> should succeed but remain blind/hidden (revealedAt = null)
      const review1Id = await reviewService.submitReview(passengerId, {
        bookingId,
        revieweeId: ownerId,
        reviewerRole: 'passenger',
        targetType: 'driver',
        overallRating: 5,
        reviewText: 'Great owner!',
      });

      const review1 = await reviewRepo.findOne({ where: { id: review1Id } });
      expect(review1?.revealedAt).toBeNull();

      // 2. Submit review from Owner -> both exist, so both must be revealed (revealedAt !== null)
      const review2Id = await reviewService.submitReview(ownerId, {
        bookingId,
        revieweeId: passengerId,
        reviewerRole: 'owner',
        targetType: 'passenger',
        overallRating: 4,
        reviewText: 'Polite passenger.',
      });

      const updatedReview1 = await reviewRepo.findOne({
        where: { id: review1Id },
      });
      const updatedReview2 = await reviewRepo.findOne({
        where: { id: review2Id },
      });

      expect(updatedReview1?.revealedAt).not.toBeNull();
      expect(updatedReview2?.revealedAt).not.toBeNull();
    });

    it('allows passenger to review vehicle and reveals it immediately', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f438';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f439';
      const ownerId = 'd3b07384-d113-49c3-a5af-aa1d5964f440';
      const vehicleId = 'd3b07384-d113-49c3-a5af-aa1d5964f441';

      mockBookingIntegration.getBooking.mockResolvedValue({
        id: bookingId,
        passengerId,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        tripStartDate: new Date(),
      });

      mockBookingIntegration.getOrderVehicles.mockResolvedValue([
        {
          id: 'ov_1',
          vehicle_id: vehicleId,
          owner_id: ownerId,
          completed_at: new Date(),
        },
      ]);

      const reviewId = await reviewService.submitReview(passengerId, {
        bookingId,
        revieweeId: vehicleId,
        reviewerRole: 'passenger',
        targetType: 'vehicle',
        overallRating: 5,
        isLiked: true,
        reviewText: 'Clean car.',
      });

      const review = await reviewRepo.findOne({ where: { id: reviewId } });
      expect(review?.revealedAt).not.toBeNull();
      expect(review?.isLiked).toBe(true);
    });

    it('can like a review and increment its likesCount', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f442';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f443';
      const ownerId = 'd3b07384-d113-49c3-a5af-aa1d5964f444';
      const vehicleId = 'd3b07384-d113-49c3-a5af-aa1d5964f445';

      mockBookingIntegration.getBooking.mockResolvedValue({
        id: bookingId,
        passengerId,
        status: 'COMPLETED',
        paymentStatus: 'PAID',
        createdAt: new Date(),
        tripStartDate: new Date(),
      });

      mockBookingIntegration.getOrderVehicles.mockResolvedValue([
        {
          id: 'ov_1',
          vehicle_id: vehicleId,
          owner_id: ownerId,
          completed_at: new Date(),
        },
      ]);

      const reviewId = await reviewService.submitReview(passengerId, {
        bookingId,
        revieweeId: vehicleId,
        reviewerRole: 'passenger',
        targetType: 'vehicle',
        overallRating: 4,
      });

      let updatedReview = await reviewRepo.findOne({ where: { id: reviewId } });
      expect(updatedReview?.likesCount).toBe(0);

      const user1 = 'd3b07384-d113-49c3-a5af-aa1d5964f446';
      const user2 = 'd3b07384-d113-49c3-a5af-aa1d5964f447';

      const count1 = await reviewService.likeReview(reviewId, user1);
      expect(count1).toBe(1);

      // Attempting to like again with same user should throw error
      await expect(reviewService.likeReview(reviewId, user1)).rejects.toThrow(
        'You have already liked this review',
      );

      const count2 = await reviewService.likeReview(reviewId, user2);
      expect(count2).toBe(2);

      updatedReview = await reviewRepo.findOne({ where: { id: reviewId } });
      expect(updatedReview?.likesCount).toBe(2);
    });
  });

  describe('Cancellation Logic', () => {
    it('applies 50% penalty on first late cancellation', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f446';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f447';

      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 10);

      const tripStartDate = new Date();
      tripStartDate.setHours(tripStartDate.getHours() + 12);

      mockBookingIntegration.getBooking.mockResolvedValue({
        id: bookingId,
        passengerId,
        status: 'BOOKED',
        paymentStatus: 'PAID',
        advanceAmount: 200,
        createdAt,
        tripStartDate,
      });

      mockBookingIntegration.getOrderVehicles.mockResolvedValue([]);

      const result = await cancellationService.cancelBooking(
        passengerId,
        bookingId,
        {
          cancelledByRole: 'passenger',
        },
      );

      expect(result.isLate).toBe(true);
      expect(result.penaltyApplied).toBe(true);
      expect(Number(result.penaltyAmount)).toBe(100);
    });
  });
});
