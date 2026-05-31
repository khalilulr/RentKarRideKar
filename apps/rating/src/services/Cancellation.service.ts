import { Injectable } from '@nestjs/common';
import { CancellationRepository } from '../repositories/Cancellation.repository';
import { ReputationRepository } from '../repositories/Reputation.repository';
import { BookingIntegrationService } from './BookingIntegration.service';
import { Cancellation } from '../entities/Cancellation.entity';
import { AppError } from '../errors/AppError';

@Injectable()
export class CancellationService {
  constructor(
    private readonly cancellationRepo: CancellationRepository,
    private readonly reputationRepo: ReputationRepository,
    private readonly bookingIntegration: BookingIntegrationService,
  ) {}

  calculateDeadline(createdAt: Date, tripStartDate: Date): { deadlineDays: number; cancellationDeadline: Date } {
    const diffTime = tripStartDate.getTime() - createdAt.getTime();
    const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));
    const deadlineDays = Math.min(7, Math.floor(diffDays / 2));

    const cancellationDeadline = new Date(tripStartDate.getTime() - deadlineDays * 24 * 60 * 60 * 1000);
    cancellationDeadline.setUTCHours(0, 0, 0, 0); // midnight UTC

    return { deadlineDays, cancellationDeadline };
  }

  async cancelBooking(
    userId: string,
    bookingId: string,
    body: { cancelledByRole: 'owner' | 'passenger' },
  ): Promise<any> {
    const { cancelledByRole } = body;

    // 1. Validate booking exists and belongs to user
    const booking = await this.bookingIntegration.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    const vehicles = await this.bookingIntegration.getOrderVehicles(bookingId);
    const isPassenger = booking.passengerId === userId;
    const isOwner = vehicles.some(v => v.owner_id === userId);

    if (cancelledByRole === 'passenger' && !isPassenger) {
      throw new AppError(403, 'FORBIDDEN_USER', 'You do not have permission to cancel as passenger');
    }
    if (cancelledByRole === 'owner' && !isOwner) {
      throw new AppError(403, 'FORBIDDEN_USER', 'You do not have permission to cancel as owner');
    }

    // 2. Validate booking is in a cancellable state
    const uncancellable = ['CANCELLED', 'COMPLETED', 'IN_TRANSIT'];
    if (uncancellable.includes(booking.status)) {
      throw new AppError(400, 'INVALID_BOOKING_STATE', 'Booking is not in a cancellable state');
    }

    // 3. Check advance payment & calculate deadline
    const advancePaid = booking.paymentStatus === 'PAID';
    const { cancellationDeadline } = this.calculateDeadline(booking.createdAt, booking.tripStartDate);

    const now = new Date();
    const isLate = advancePaid && now > cancellationDeadline;

    let penaltyApplied = false;
    let penaltyAmount = 0;
    let offenseCount = 0;

    if (isLate) {
      // Count prior late cancellations
      const stats = await this.cancellationRepo.countCancellationsByUser(userId);
      offenseCount = stats.late;

      penaltyApplied = true;
      penaltyAmount = offenseCount === 0 ? booking.advanceAmount * 0.5 : booking.advanceAmount;
    }

    // 4. Save Cancellation record
    await this.cancellationRepo.create({
      bookingId,
      cancelledById: userId,
      cancelledByRole,
      isLate,
      hoursBeforeTrip: Number(((booking.tripStartDate.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(2)),
      advanceWasPaid: advancePaid,
      penaltyApplied,
      penaltyAmount,
      offenseCountAtTime: offenseCount,
    });

    // 5. Update Booking Status
    await this.bookingIntegration.updateBookingStatus(bookingId, 'CANCELLED', 'CANCELLED');

    // 6. Invalidate reputation cache for the canceller
    await this.reputationRepo.invalidate(userId);

    // 7. Stub Notification Event
    console.log(
      `[EVENT] Booking ${bookingId} cancelled by ${cancelledByRole} (${userId}). ` +
      `Notification sent to other party. IsLate: ${isLate}, PenaltyApplied: ${penaltyApplied}`
    );

    return {
      isLate,
      penaltyApplied,
      penaltyAmount,
      cancellationDeadline: cancellationDeadline.toISOString(),
    };
  }

  async getCancellationStats(userId: string): Promise<any> {
    const { total, late } = await this.cancellationRepo.countCancellationsByUser(userId);
    const lateRate = total === 0 ? 0 : Number(((late / total) * 100).toFixed(2));

    let reliabilityScore = 5.0;
    let badgeLevel: 'Excellent' | 'VeryGood' | 'Fair' | 'Concerning' | 'Poor' = 'Excellent';

    if (lateRate === 0) {
      reliabilityScore = 5.0;
      badgeLevel = 'Excellent';
    } else if (lateRate < 5) {
      reliabilityScore = 4.5;
      badgeLevel = 'VeryGood';
    } else if (lateRate >= 5 && lateRate < 10) {
      reliabilityScore = 3.5;
      badgeLevel = 'Fair';
    } else if (lateRate >= 10 && lateRate < 20) {
      reliabilityScore = 2.5;
      badgeLevel = 'Concerning';
    } else {
      reliabilityScore = 1.5;
      badgeLevel = 'Poor';
    }

    return {
      totalCancellations: total,
      lateCancellations: late,
      lateRate,
      reliabilityScore,
      badgeLevel,
    };
  }

  async getCancellationDeadline(bookingId: string): Promise<any> {
    const booking = await this.bookingIntegration.getBooking(bookingId);
    if (!booking) {
      throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    const { cancellationDeadline } = this.calculateDeadline(booking.createdAt, booking.tripStartDate);
    const now = new Date();
    const hoursRemaining = Math.max(0, Number(((cancellationDeadline.getTime() - now.getTime()) / (1000 * 60 * 60)).toFixed(2)));
    const isInsideWindow = now > cancellationDeadline;

    return {
      cancellationDeadline: cancellationDeadline.toISOString(),
      hoursRemaining,
      isInsideWindow,
    };
  }
}
