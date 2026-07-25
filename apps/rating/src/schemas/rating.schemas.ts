import { z } from 'zod';

export const CreateReviewSchema = z.object({
  bookingId: z.string().uuid(),
  revieweeId: z.string().uuid(),
  reviewerRole: z.literal('passenger'),
  targetType: z.literal('vehicle'),
  overallRating: z.number().int().min(1).max(5),
  isLiked: z.boolean().optional().default(false),
  reviewText: z.string().max(1000).optional(),
});

export const RespondReviewSchema = z.object({
  responseText: z.string().min(1).max(1000),
});

export const CancelBookingSchema = z.object({
  cancelledByRole: z.enum(['owner', 'passenger']),
});

export const GetReviewsQuerySchema = z.object({
  role: z.enum(['owner', 'passenger']).optional(),
  sortBy: z.enum(['date', 'rating']).default('date'),
  cursor: z.string().optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform((val) => parseInt(val, 10))
    .default('20' as any),
});

export const LikeReviewSchema = z.object({
  reviewId: z.string().uuid(),
  userId: z.string().uuid(),
});
