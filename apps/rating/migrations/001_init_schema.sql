-- Create custom PostgreSQL enums
CREATE TYPE reviewer_role_enum AS ENUM ('owner', 'passenger');
CREATE TYPE badge_level_enum AS ENUM ('Excellent', 'VeryGood', 'Fair', 'Concerning', 'Poor');
CREATE TYPE rating_trend_enum AS ENUM ('up', 'down', 'stable');

-- Create reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    reviewer_id UUID NOT NULL,
    reviewee_id UUID NOT NULL,
    reviewer_role reviewer_role_enum NOT NULL,
    overall_rating SMALLINT NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
    punctuality_score SMALLINT CHECK (punctuality_score >= 1 AND punctuality_score <= 5),
    cleanliness_score SMALLINT CHECK (cleanliness_score >= 1 AND cleanliness_score <= 5),
    safety_score SMALLINT CHECK (safety_score >= 1 AND safety_score <= 5),
    communication_score SMALLINT CHECK (communication_score >= 1 AND communication_score <= 5),
    review_text TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revealed_at TIMESTAMPTZ,
    response_text TEXT,
    response_submitted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT unique_booking_reviewer UNIQUE (booking_id, reviewer_role)
);

-- Create cancellations table
CREATE TABLE cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL,
    cancelled_by_id UUID NOT NULL,
    cancelled_by_role reviewer_role_enum NOT NULL,
    cancelled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_late BOOLEAN NOT NULL DEFAULT false,
    hours_before_trip NUMERIC(6,2) NOT NULL,
    advance_was_paid BOOLEAN NOT NULL,
    penalty_applied BOOLEAN NOT NULL DEFAULT false,
    penalty_amount NUMERIC(10,2),
    offense_count_at_time SMALLINT NOT NULL
);

-- Create reputation_cache table
CREATE TABLE reputation_cache (
    user_id UUID PRIMARY KEY,
    overall_rating NUMERIC(3,2),
    punctuality_avg NUMERIC(3,2),
    cleanliness_avg NUMERIC(3,2),
    safety_avg NUMERIC(3,2),
    communication_avg NUMERIC(3,2),
    reliability_score NUMERIC(3,2),
    badge_level badge_level_enum,
    total_reviews INTEGER,
    rating_trend rating_trend_enum,
    last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional: Create indices for pagination and lookups
CREATE INDEX idx_reviews_revealed_submitted ON reviews(revealed_at, submitted_at, id);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX idx_cancellations_user ON cancellations(cancelled_by_id);
