# RentKarRideKar (RKRK) API Documentation

This document contains the complete REST API specification exposed by the API Gateway. It lists all endpoints, request bodies, query parameters, headers, response payloads, and database enums.

---

## Global Authentication Header
For all endpoints marked with **[Requires Authentication]**, the client must include the JWT access token in the `Authorization` header:
`Authorization: Bearer <JWT_ACCESS_TOKEN>`

---

## ENUMS

### 1. User Roles
* `PASSENGER`
* `DRIVER`
* `VEHICLE_OWNER`
* `ADMIN`

### 2. KYC Status
* `PENDING`
* `APPROVED`
* `REJECTED`

### 3. Order Status
* `OWNER_PENDING`
* `CONFIRMED`
* `DRIVER_ASSIGNED`
* `IN_TRANSIT`
* `COMPLETED`
* `CANCELLED`

### 4. Vehicle Status
* `PENDING`
* `ACTIVE`
* `SUSPENDED`

### 5. Payment Status
* `PENDING`
* `PAID`
* `REFUNDED`

### 6. Reviewer Roles / Target Types
* `owner`
* `driver`
* `passenger`
* `vehicle`

---

## 1. Auth Service (`/auth`)

### POST `/auth/send-otp`
* **Description**: Sends a one-time password (OTP) verification to a user's mobile number.
* **Request Body**:
  ```json
  {
    "mobile": "+919876543210"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "OTP sent successfully"
  }
  ```

### POST `/auth/verify-otp`
* **Description**: Verifies the OTP, log in the user, and sets an HTTP-Only `refreshToken` cookie.
* **Request Body**:
  ```json
  {
    "mobile": "+919876543210",
    "otp": "123456"
  }
  ```
* **Response Body**:
  ```json
  {
    "accessToken": "eyJhbG...",
    "user": {
      "id": "user_uuid",
      "mobile": "+919876543210",
      "name": "John Doe",
      "roles": ["PASSENGER"],
      "activePerspective": "PASSENGER",
      "kycStatus": "PENDING"
    }
  }
  ```

### POST `/auth/admin/login`
* **Description**: Logs in as an administrator. Sets an HTTP-Only `refreshToken` cookie.
* **Request Body**:
  ```json
  {
    "email": "admin@rkrk.com",
    "password": "SecurePassword123"
  }
  ```
* **Response Body**: Identical to `/auth/verify-otp`.

### POST `/auth/admin/demo`
* **Description**: Registers or logs in a demo admin user.
* **Request Body**:
  ```json
  {
    "email": "demo_admin@rkrk.com",
    "password": "SecurePassword123"
  }
  ```
* **Response Body**: Identical to `/auth/verify-otp`.

### POST `/auth/refresh-token`
* **Description**: Refreshes the access token using the HTTP-Only `refreshToken` cookie.
* **Headers**: Requires `Cookie: refreshToken=...`
* **Response Body**: Identical to `/auth/verify-otp` (excluding the user's refresh token).

### POST `/auth/logout` **[Requires Authentication]**
* **Description**: Logs out the current session and clears the HTTP-Only cookie.
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### POST `/auth/logout-all-devices` **[Requires Authentication]**
* **Description**: Invalidate all sessions across all devices for the user.
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Logged out from all devices"
  }
  ```

### GET `/auth/me` **[Requires Authentication]**
* **Description**: Retrieve the current user's profile.
* **Response Body**:
  ```json
  {
    "user": {
      "id": "user_uuid",
      "mobile": "+919876543210",
      "name": "John Doe",
      "roles": ["PASSENGER", "VEHICLE_OWNER"],
      "activePerspective": "PASSENGER",
      "kycStatus": "APPROVED"
    }
  }
  ```

### PUT `/auth/me` **[Requires Authentication]**
* **Description**: Updates user profile options.
* **Request Body** (All optional):
  ```json
  {
    "name": "Jane Doe",
    "profileImage": "http://image-url.com/profile.png",
    "roles": ["PASSENGER", "VEHICLE_OWNER"],
    "activePerspective": "VEHICLE_OWNER"
  }
  ```
* **Response Body**: Returns the updated profile payload.

### PUT `/auth/switch-perspective` **[Requires Authentication]**
* **Description**: Switches the user's active perspective role view.
* **Request Body**:
  ```json
  {
    "perspective": "VEHICLE_OWNER"
  }
  ```
* **Response Body**: Returns the updated profile payload with new `activePerspective`.

---

## 2. KYC Verification Service (`/kyc`)

### POST `/kyc/upload` **[Requires Authentication]**
* **Description**: Upload files (Aadhaar, DL, RC) for KYC verification. Uses `multipart/form-data`.
* **Query Parameters**:
  * `role`: `'DRIVER' | 'VEHICLE_OWNER'`
  * `documentType`: `'AADHAAR_FRONT' | 'AADHAAR_BACK' | 'PAN_CARD' | 'DRIVING_LICENSE' | 'SELFIE' | 'RC_BOOK' | 'INSURANCE' | 'PUC_CERTIFICATE' | 'FITNESS_CERT' | 'PERMIT'`
  * `vehicleId` (optional, string): Required when uploading vehicle documents.
* **Multipart Body**:
  * `file`: Binary document file.
* **Response Body**:
  ```json
  {
    "success": true,
    "documentId": "doc_uuid",
    "fileUrl": "uploads/kyc/filename.jpg"
  }
  ```

### GET `/kyc/status` **[Requires Authentication]**
* **Description**: Get verification status for a specific role.
* **Query Parameters**:
  * `role`: `'DRIVER' | 'VEHICLE_OWNER'`
* **Response Body**:
  ```json
  {
    "overallStatus": "PENDING",
    "documents": [
      {
        "id": "doc_uuid",
        "docType": "AADHAAR_FRONT",
        "status": "APPROVED",
        "fileUrl": "..."
      }
    ]
  }
  ```

### PATCH `/kyc/submit` **[Requires Authentication]**
* **Description**: Submits the completed role verification request for admin review.
* **Request Body**:
  ```json
  {
    "role": "DRIVER"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "KYC submitted successfully"
  }
  ```

### PATCH `/kyc/submit-vehicle` **[Requires Authentication]**
* **Description**: Submits the vehicle documents for admin review.
* **Query Parameters**:
  * `vehicleId`: `vehicle_uuid`
* **Request Body**:
  ```json
  {
    "role": "VEHICLE_OWNER"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Vehicle verification request submitted"
  }
  ```

### GET `/kyc/admin/pending` **[Requires Authentication, Admin Only]**
* **Description**: Fetch all pending document approvals for validation.
* **Response Body**:
  ```json
  {
    "pendingDocuments": [
      {
        "id": "doc_uuid",
        "userId": "user_uuid",
        "role": "DRIVER",
        "docType": "DRIVING_LICENSE",
        "fileUrl": "...",
        "status": "SUBMITTED"
      }
    ]
  }
  ```

### PATCH `/kyc/admin/documents/:id` **[Requires Authentication, Admin Only]**
* **Description**: Approve or Reject a single KYC document.
* **Request Body**:
  ```json
  {
    "status": "APPROVED" // or "REJECTED"
    "rejectionReason": "Blurry image" // optional
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Document status updated"
  }
  ```

---

## 3. Search & Catalog Service (`/vehicles`)

### GET `/vehicles/search`
* **Description**: Search for available vehicles based on location, dates, and filters.
* **Query Parameters**:
  * `from`: "Jadugoda" (pickup location)
  * `to`: "Jamshedpur" (drop location)
  * `date`: "2026-06-10"
  * `time`: "10:00"
  * `vehicleType`: "SEDAN" (optional)
  * `seats`: "5" (optional)
  * `color`: "White" (optional)
  * `ac`: "true" (optional)
* **Response Body**:
  ```json
  {
    "vehicles": [
      {
        "id": "vehicle_uuid",
        "make": "Maruti Suzuki",
        "model": "Ertiga",
        "seatingCapacity": "SEVEN",
        "color": "White",
        "hasAC": true,
        "pricePerDay": 2160.00,
        "ownerId": "owner_uuid",
        "vehiclePhotos": ["http://..."]
      }
    ]
  }
  ```

### GET `/vehicles/owner/my` **[Requires Authentication, Owner Only]**
* **Description**: List all registered vehicles owned by the logged-in user.
* **Response Body**: Array of registered vehicles.

### GET `/vehicles/admin/all` **[Requires Authentication, Admin Only]**
* **Description**: List all registered vehicles across the platform. Filter by status or owner.
* **Query Parameters** (Optional):
  * `ownerId`: `owner_uuid`
  * `status`: `PENDING | ACTIVE | SUSPENDED`
* **Response Body**: Array of all registered vehicles.

### POST `/vehicles` **[Requires Authentication, Owner Only]**
* **Description**: Registers a new vehicle in the catalog.
* **Request Body**:
  ```json
  {
    "vehicleCategory": "SUV",
    "make": "Mahindra",
    "model": "Thar",
    "variant": "LX",
    "registrationNumber": "JH05AB1234",
    "seatingCapacity": "FOUR",
    "color": "Red",
    "hasAC": true,
    "manufacturingYear": 2024,
    "serviceRadius": 25,
    "homeLat": 22.80,
    "homeLng": 86.20,
    "homeAddress": "Jamshedpur, Jharkhand",
    "vehiclePhotos": ["http://image-link.com/thar.png"]
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "vehicleId": "vehicle_uuid"
  }
  ```

### PUT `/vehicles/:id` **[Requires Authentication, Owner Only]**
* **Description**: Updates vehicle registration details.
* **Request Body**: Identical fields to POST vehicle (all fields optional).
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Vehicle updated successfully"
  }
  ```

### POST `/vehicles/:id/block` **[Requires Authentication, Owner Only]**
* **Description**: Blocks a vehicle for custom dates (maintenance/personal use).
* **Request Body**:
  ```json
  {
    "startDate": "2026-06-15",
    "endDate": "2026-06-17",
    "reason": "Scheduled maintenance"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Vehicle blocked successfully"
  }
  ```

### DELETE `/vehicles/blocks/:blockId` **[Requires Authentication, Owner Only]**
* **Description**: Unblock a previously blocked schedule.
* **Response Body**:
  ```json
  {
    "success": true,
    "message": "Vehicle schedule unblocked"
  }
  ```

### GET `/vehicles/:id/available`
* **Description**: Query check if a vehicle is available for dates.
* **Query Parameters**:
  * `startDate`: "2026-06-10"
  * `endDate`: "2026-06-12"
* **Response Body**:
  ```json
  {
    "vehicleId": "...",
    "isAvailable": true
  }
  ```

---

## 4. Booking & Cart Service (`/cart` & `/orders`)

### POST `/booking/calculate-price`
* **Description**: Calculates fare estimation and pricing breakdown based on vehicle capacity, trip type, distance, and booking days.
* **Request Body**:
  ```json
  {
    "vehicleId": "vehicle_uuid",
    "seatingCapacity": "5",
    "tripType": "OUTSTATION",
    "totalDays": 2,
    "pickupLat": 22.65,
    "pickupLng": 86.35,
    "dropLat": 22.80,
    "dropLng": 86.20,
    "pickupDatetime": "2026-06-10T10:00:00Z",
    "returnDatetime": "2026-06-12T10:00:00Z",
    "discount": 0
  }
  ```
* **Response Body**:
  ```json
  {
    "basePrice": 240,
    "gst": 43,
    "platformFee": 7,
    "discount": 0,
    "total": 290,
    "advancePercentage": 25,
    "advanceAmount": 73,
    "balanceAmount": 217,
    "currency": "INR",
    "seater": 5,
    "tripType": "OUTSTATION",
    "distanceKm": 20.01
  }
  ```

### POST `/cart/items` **[Requires Authentication]**
* **Description**: Adds a vehicle to the passenger's checkout cart.
* **Request Body**:
  ```json
  {
    "vehicleId": "vehicle_uuid",
    "pickupAddress": "Jadugoda Main Rd",
    "pickupLat": 22.65,
    "pickupLng": 86.35,
    "dropAddress": "TMH Jamshedpur",
    "dropLat": 22.80,
    "dropLng": 86.20,
    "pickupDatetime": "2026-06-10T10:00:00Z",
    "tripType": "ROUND_TRIP",
    "returnDatetime": "2026-06-12T10:00:00Z",
    "totalDays": 2
  }
  ```
* **Response Body**: Returns added item pricing and vehicle summaries.

### GET `/cart` **[Requires Authentication]**
* **Description**: Fetch items currently in the cart.
* **Query Parameters**:
  * `promoCode` (optional, string): Validates and applies a code.
* **Response Body**:
  ```json
  {
    "cartId": "cart_uuid",
    "items": [...],
    "summary": {
      "totalVehicles": 1,
      "totalAmount": 1800.00,
      "totalAdvance": 450.00,
      "originalAmount": 2000.00,
      "discountAmount": 200.00,
      "promoCode": "SAVE10"
    }
  }
  ```

### DELETE `/cart/items/:cartItemId` **[Requires Authentication]**
* **Description**: Remove an item from the cart.
* **Response Body**: `{ "message": "Vehicle removed" }`

### POST `/orders` **[Requires Authentication]**
* **Description**: Create booking order from Cart.
* **Request Body**:
  ```json
  {
    "passengerNote": "Please call before arriving",
    "promoCode": "SAVE10" // optional
  }
  ```
* **Response Body**: Returns order overview, status, and payment sums.

### GET `/orders` **[Requires Authentication]**
* **Description**: List booking history for user.
* **Query Parameters**:
  * `role`: `'PASSENGER' | 'VEHICLE_OWNER'` (Defaults to 'PASSENGER')
  * `status`: filter status (optional)
* **Response Body**: Paginated list of booking orders.

### GET `/orders/:orderId` **[Requires Authentication]**
* **Description**: Fetch full booking details, pricing breakdown, and active timeline.
* **Response Body**: Includes `payment` summary with original and discounted amounts.

---

## 5. Discount & Offers Service (`/admin/offers` & `/offers`)

### POST `/admin/offers` **[Requires Authentication, Admin Only]**
* **Description**: Create a promotional offer with eligibility rules.
* **Request Body**:
  ```json
  {
    "code": "FIRSTRIDE",
    "type": "percentage", // or "flat"
    "value": 15.00, // 15% discount
    "conditions": {
      "firstBookingOnly": true,
      "minBookingAmount": 1000.00
    },
    "description": "Get 15% off your first booking above Rs. 1000"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "offer": {
      "id": "offer_uuid",
      "code": "FIRSTRIDE",
      "type": "percentage",
      "value": 15.00,
      "isActive": true,
      "conditions": {
        "firstBookingOnly": true,
        "minBookingAmount": 1000.00
      },
      "description": "..."
    }
  }
  ```

### PATCH `/admin/offers/:id/toggle` **[Requires Authentication, Admin Only]**
* **Description**: Toggle offer status on or off.
* **Request Body**:
  ```json
  {
    "isActive": false
  }
  ```
* **Response Body**: Returns updated offer payload.

### GET `/admin/offers` **[Requires Authentication, Admin Only]**
* **Description**: List all registered offers.
* **Query Parameters**:
  * `filter`: `'active' | 'inactive' | 'all'` (Defaults to 'all')
* **Response Body**: `{ "offers": [...] }`

### POST `/offers/validate-code` **[Requires Authentication]**
* **Description**: Explicitly check if a promo code is valid for a given amount.
* **Request Body**:
  ```json
  {
    "code": "SAVE10",
    "originalPrice": 2000.00
  }
  ```
* **Response Body**:
  ```json
  {
    "isValid": true,
    "discountedPrice": 1800.00,
    "discountAmount": 200.00,
    "message": "Code applied successfully!"
  }
  ```

### POST `/offers/check-eligibility` **[Requires Authentication]**
* **Description**: Check auto-eligible offers based on context and current price.
* **Request Body**:
  ```json
  {
    "originalPrice": 2000.00
  }
  ```
* **Response Body**: `{ "eligibleOffers": [...] }`

### GET `/offers/history` **[Requires Authentication]**
* **Description**: Get list of all promo codes used by the passenger.
* **Response Body**:
  ```json
  {
    "history": [
      {
        "id": "usage_uuid",
        "offerCode": "FIRSTRIDE",
        "bookingId": "booking_uuid",
        "discountAmount": 150.00,
        "usedAt": "2026-06-01T10:00:00Z"
      }
    ]
  }
  ```

---

## 6. Ratings & Reputation (`/api`)

### POST `/api/reviews` **[Requires Authentication]**
* **Description**: Submit a review for a booking.
* **Request Body**:
  ```json
  {
    "bookingId": "booking_uuid",
    "revieweeId": "user_or_vehicle_uuid",
    "reviewerRole": "passenger", // 'passenger' | 'owner'
    "targetType": "driver", // 'driver' | 'vehicle' | 'passenger'
    "overallRating": 5, // 1 to 5
    "reviewText": "Amazing journey and driving!",
    "isLiked": true // optional
  }
  ```
* **Response Body**: `{ "success": true, "id": "review_uuid" }`

### POST `/api/reviews/:reviewId/like` **[Requires Authentication]**
* **Description**: Likes a review. Users can like any comment at most once.
* **Response Body**: `{ "success": true, "likesCount": 1 }`

### POST `/api/reviews/:reviewId/respond` **[Requires Authentication]**
* **Description**: Submit a reply to a review written about you.
* **Request Body**:
  ```json
  {
    "responseText": "Thank you for the review!"
  }
  ```
* **Response Body**: `{ "success": true, "message": "Response submitted" }`

### GET `/api/users/:userId/reputation`
* **Description**: Returns overall rating, metrics breakdown, recent reviews, and reliability badge.
* **Response Body**: Large user scorecard payload.

---

## 7. Communication & Call Webhook (`/communication`)

### GET `/communication/chat/rooms` **[Requires Authentication]**
* **Description**: Get all active chat rooms unlocked for the user.
* **Response Body**: Array of chat rooms.

### POST `/communication/chat/rooms/:roomId/messages` **[Requires Authentication]**
* **Description**: Send a message to a chat room.
* **Request Body**:
  ```json
  {
    "content": "Hey, where have you reached?",
    "contentType": "text" // or "image"
  }
  ```
* **Response Body**: Message instance object.

### GET `/communication/chat/rooms/:roomId/messages` **[Requires Authentication]**
* **Description**: Fetch messages for a chat room with cursor pagination.
* **Response Body**: Array of messages.

### POST `/communication/call/initiate` **[Requires Authentication]**
* **Description**: Initiate a Twilio call session. Masking is supported.
* **Request Body**:
  ```json
  {
    "bookingId": "booking_uuid",
    "callTo": "driver" // or "owner"
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "callSessionId": "session_uuid",
    "virtualNumber": "+91888..."
  }
  ```

### POST `/communication/sos` **[Requires Authentication]**
* **Description**: Triggers an emergency SOS alert.
* **Request Body**:
  ```json
  {
    "bookingId": "booking_uuid",
    "latitude": 22.80,
    "longitude": 86.20
  }
  ```
* **Response Body**:
  ```json
  {
    "success": true,
    "sosId": "sos_uuid",
    "status": "TRIGGERED"
  }
  ```
