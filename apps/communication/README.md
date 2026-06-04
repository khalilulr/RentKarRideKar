# Communication Microservice Testing Guide (Postman)

This guide documents the REST APIs exposed by the **Communication Service** (both directly on port `3003` and routed through the **API Gateway** on port `3000`).

---

## 1. Direct Calls (Bypassing API Gateway)
To call the communication microservice directly (useful for local development testing), send HTTP requests to:
`http://localhost:3003`

You **must** manually pass the headers that the API Gateway would normally inject:
* `x-user-id` (UUID format, representing the authenticated user)
* `x-user-role` (e.g. `passenger`, `driver`, `owner`)

---

## 2. API Gateway Calls (External / Production)
When calling from the external client, send HTTP requests to:
`http://localhost:3000`

You must supply a standard Authorization header:
* `Authorization: Bearer <your_jwt_token>`

The API gateway will authenticate the JWT and inject the appropriate `x-user-id` and `x-user-role` headers to the communication microservice.

---

## 3. API Reference & Payloads

### A. Chat Rooms & Messages

#### 1. List Rooms
* **Route:** `GET /communication/chat/rooms`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
  * `x-user-role: passenger`
* **Response:**
  ```json
  {
    "rooms": [
      {
        "roomId": "room-uuid",
        "bookingId": "booking-uuid",
        "roomType": "passenger_driver",
        "status": "active",
        "lastMessage": { "content": "I am at Gate 3", "sentAt": "ISO8601" },
        "unreadCount": 0
      }
    ]
  }
  ```

#### 2. Get Messages
* **Route:** `GET /communication/chat/rooms/:roomId/messages?limit=50`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
* **Response:**
  ```json
  {
    "messages": [
      {
        "id": "msg-uuid",
        "senderId": "sender-uuid",
        "content": "On my way",
        "contentType": "text",
        "sentAt": "ISO8601",
        "readAt": null
      }
    ],
    "hasMore": false
  }
  ```

#### 3. Send Message
* **Route:** `POST /communication/chat/rooms/:roomId/messages`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
* **Body:**
  ```json
  {
    "content": "I am at Gate 3",
    "contentType": "text"
  }
  ```
* **Response:**
  ```json
  {
    "messageId": "msg-uuid",
    "sentAt": "2026-05-31T12:00:00Z"
  }
  ```

#### 4. Mark Room as Read
* **Route:** `PATCH /communication/chat/rooms/:roomId/messages/read`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
* **Response:**
  ```json
  {
    "markedCount": 3
  }
  ```

---

### B. Call Session Proxy

#### 1. Initiate Proxy Call
* **Route:** `POST /communication/call/initiate`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
* **Body:**
  ```json
  {
    "bookingId": "booking-uuid",
    "callTo": "driver"
  }
  ```
* **Response:**
  ```json
  {
    "callSessionId": "session-uuid",
    "status": "connecting",
    "maskedNumber": "+919999999999"
  }
  ```

#### 2. End Call
* **Route:** `POST /communication/call/end`
* **Body:**
  ```json
  {
    "callSessionId": "session-uuid"
  }
  ```
* **Response:**
  ```json
  {
    "duration": 47,
    "endedAt": "2026-05-31T12:05:00Z"
  }
  ```

#### 3. Twilio Status Callback
* **Route:** `POST /communication/call/webhook/twilio`
* **Body (Twilio Format):**
  ```json
  {
    "CallSid": "CA123456789",
    "CallStatus": "completed",
    "Duration": "87"
  }
  ```
* **Response:**
  ```json
  {
    "success": true
  }
  ```

---

### C. SOS Emergency Event

#### 1. Trigger SOS Alert
* **Route:** `POST /communication/sos`
* **Direct Headers:**
  * `x-user-id: 2d14878a-c603-4903-8d69-a1b7eb850e04`
  * `x-user-role: passenger`
* **Body:**
  ```json
  {
    "bookingId": "booking-uuid",
    "latitude": 22.8046,
    "longitude": 86.2029
  }
  ```
* **Response:**
  ```json
  {
    "sosId": "sos-uuid",
    "status": "active",
    "triggeredAt": "2026-05-31T12:10:00Z",
    "message": "Emergency alert sent to all contacts"
  }
  ```

#### 2. Fetch SOS Alert Details
* **Route:** `GET /communication/sos/:sosId`
* **Response:**
  ```json
  {
    "sosId": "sos-uuid",
    "bookingId": "booking-uuid",
    "triggeredBy": "user-uuid",
    "role": "passenger",
    "latitude": 22.8046,
    "longitude": 86.2029,
    "status": "active",
    "triggeredAt": "2026-05-31T12:10:00Z"
  }
  ```

#### 3. Resolve SOS Event
* **Route:** `PATCH /communication/sos/:sosId/resolve`
* **Direct Headers:**
  * `x-user-id: support-operator-uuid`
* **Body:**
  ```json
  {
    "notes": "Confirmed safe and passenger back home safely."
  }
  ```
* **Response:**
  ```json
  {
    "sosId": "sos-uuid",
    "resolvedAt": "2026-05-31T12:15:00Z"
  }
  ```
