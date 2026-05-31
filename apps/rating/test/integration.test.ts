import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { RatingModule } from '../src/rating.module';
import { BookingIntegrationService } from '../src/services/BookingIntegration.service';
import { ReviewRepository } from '../src/repositories/Review.repository';
import { ReputationRepository } from '../src/repositories/Reputation.repository';
import { CancellationRepository } from '../src/repositories/Cancellation.repository';
import { Review } from '../src/entities/Review.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

describe('Ratings & Cancellations Microservice Integration Tests', () => {
  let app: INestApplication;
  let reviewRepo: Repository<Review>;

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

    reviewRepo = app.get(getRepositoryToken(Review));
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/reviews - Blind Review Submission Flow', () => {
    it('reveals both reviews immediately when both passenger and owner have submitted', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f434';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f435';
      const ownerId = 'd3b07384-d113-49c3-a5af-aa1d5964f436';

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
      const res1 = await request(app.getHttpServer())
        .post('/api/reviews')
        .set('x-user-id', passengerId)
        .send({
          bookingId,
          revieweeId: ownerId,
          reviewerRole: 'passenger',
          overallRating: 5,
          reviewText: 'Great owner!',
        })
        .expect(201);

      expect(res1.body.success).toBe(true);

      const review1 = await reviewRepo.findOne({ where: { id: res1.body.id } });
      expect(review1?.revealedAt).toBeNull();

      // 2. Submit review from Owner -> both exist, so both must be revealed (revealedAt !== null)
      const res2 = await request(app.getHttpServer())
        .post('/api/reviews')
        .set('x-user-id', ownerId)
        .send({
          bookingId,
          revieweeId: passengerId,
          reviewerRole: 'owner',
          overallRating: 4,
          reviewText: 'Polite passenger.',
        })
        .expect(201);

      expect(res2.body.success).toBe(true);

      const updatedReview1 = await reviewRepo.findOne({ where: { id: res1.body.id } });
      const updatedReview2 = await reviewRepo.findOne({ where: { id: res2.body.id } });

      expect(updatedReview1?.revealedAt).not.toBeNull();
      expect(updatedReview2?.revealedAt).not.toBeNull();
    });
  });

  describe('POST /api/bookings/:bookingId/cancel - Cancellation Logic', () => {
    it('applies 50% penalty on first late cancellation', async () => {
      const bookingId = 'd3b07384-d113-49c3-a5af-aa1d5964f437';
      const passengerId = 'd3b07384-d113-49c3-a5af-aa1d5964f438';

      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 10); // created 10 days ago

      const tripStartDate = new Date();
      tripStartDate.setHours(tripStartDate.getHours() + 12); // trip starts in 12 hours (inside the late window)

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

      const res = await request(app.getHttpServer())
        .post(`/api/bookings/${bookingId}/cancel`)
        .set('x-user-id', passengerId)
        .send({ cancelledByRole: 'passenger' })
        .expect(200);

      expect(res.body.isLate).toBe(true);
      expect(res.body.penaltyApplied).toBe(true);
      expect(Number(res.body.penaltyAmount)).toBe(100); // 50% forfeit of 200 advance
    });
  });
});
