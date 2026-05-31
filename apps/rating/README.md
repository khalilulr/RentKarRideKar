# Convoy Reviews & Ratings & Cancellation Microservice

This microservice handles:
1. **Blind Review Submission and Auto-Reveal Flow**
2. **Dynamic Cancellation Deadlines & Penalty Tracking**
3. **Reputation Profile & Time-Decayed Rating Cache**

---

## 1. Review Blind-Submit Flow

To prevent revenge reviews or biased ratings, Convoy uses a **blind-submission flow**:
- When a trip completes, both the passenger and owner have a **7-day window** to submit their reviews.
- Reviews submitted are immediately stored with `revealed_at = NULL` (they are hidden from the public).
- If **both parties** submit their reviews before the 7 days expire:
  - Both reviews are immediately **revealed** (set `revealed_at = NOW()`).
- If **only one party** submits a review:
  - A background poller running every 15 minutes automatically reveals any review once its 7-day submission window expires (`expires_at <= NOW()`), even if the other party did not submit theirs.
- The `reputation_cache` for the reviewed user is automatically invalidated on submission.

---

## 2. Cancellation Window Formula

When a user cancels a booking, Convoy calculates the deadline and applies late penalties strictly according to the creation and trip start dates:

### 2.1 The Cancellation Deadline Formula:
$$\text{deadlineDays} = \min\left(7, \left\lfloor \frac{\text{tripStartDate} - \text{bookingCreatedAt}}{2} \right\rfloor\right)$$

$$\text{cancellationDeadline} = \text{tripStartDate} - \text{deadlineDays}\text{ days (midnight UTC)}$$

### 2.2 Late Penalties:
- **On-Time Cancellation (`now() <= cancellationDeadline` or no advance was paid)**:
  - Allowed without penalty (`penalty_applied = false`).
- **Late Cancellation (`now() > cancellationDeadline` and advance paid)**:
  - First-time offense (`offense_count == 0`): Forfeit **50%** of the advance payment.
  - Repeat offenses (`offense_count >= 1`): Forfeit **100%** of the advance payment.
  - Recorded as a repeat offense snapshot.

---

## 3. Reputation & Weighted Rating Formula

### 3.1 Overall Rating with Time Decay:
Reviews are weighted based on their age in UTC:
- **Last 30 days**: Weight = $1.0$
- **31 to 90 days**: Weight = $0.8$
- **More than 90 days**: Weight = $0.5$

$$\text{Overall Rating} = \frac{\sum (\text{overall\_rating} \times \text{weight})}{\sum \text{weight}}$$

### 3.2 Reliability Score & Badges:
- Calculated from the cancellation history:
  $$\text{lateRate} = \left(\frac{\text{lateCancellations}}{\text{totalCancellations}}\right) \times 100$$
- Reliability Level mapping:
  - `lateRate == 0%` $\rightarrow$ Score: **5.0**, Badge: **Excellent**
  - `lateRate < 5%` $\rightarrow$ Score: **4.5**, Badge: **VeryGood**
  - `lateRate < 10%` $\rightarrow$ Score: **3.5**, Badge: **Fair**
  - `lateRate < 20%` $\rightarrow$ Score: **2.5**, Badge: **Concerning**
  - `lateRate >= 20%` $\rightarrow$ Score: **1.5**, Badge: **Poor**
