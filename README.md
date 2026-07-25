# 🚗 RentKarRideKar

> **A Next-Gen Multi-Vehicle & Advance Ride Booking Platform**
> 
> *Solving complex event logistics, multi-vehicle bookings, and opening up private vehicle rentals for Tier 2/3 cities.*

---

## 🌟 Overview & Problem Statement

Most modern ride-hailing and rental platforms (like Uber, Ola, or Lyft) are designed primarily for **on-demand, single-vehicle point-to-point rides**. However, they break down when handling **advance event planning** and **multi-vehicle logistics**.

### The Gap in Existing Platforms
- **Event & Multi-Vehicle Bookings**: Planning weddings, corporate events, or group trips requiring multiple vehicles (e.g., 3 SUVs and a luxury bus weeks in advance) forces users into making separate bookings, managing isolated payments, verifying drivers individually, and coordinating multiple OTPs.
- **Private Car Owner Exclusion**: In Tier 2 and Tier 3 cities, local rental markets rely heavily on individual private car owners rather than registered taxi fleets. Standard platforms completely ignore this massive supply market.

### The RentKarRideKar Solution
1. **Advance Booking First**: Built from the ground up for scheduled and multi-day bookings across custom dates.
2. **Unified Multi-Vehicle Orders**: 
   - Book multiple vehicles (cars, buses, bikes) under **a single order**.
   - Single advance payment upfront, single completion OTP, and single final settlement verified post-trip.
   - Automated earnings distribution to individual vehicle owners.
3. **Private Vehicle Peer-to-Peer Onboarding**: Enables private non-commercial car owners in Tier 2/3 cities to monetize their vehicles with robust identity and document verification.

---

## 🏗 System Architecture & Microservices Design

RentKarRideKar is built using a **NestJS Microservices Architecture** designed for high throughput, scalability, independent service deployments, and strict domain separation.

```
                    ┌───────────────────────────────┐
                    │      Client / Frontend        │
                    └───────────────┬───────────────┘
                                    │  REST / HTTP / WS
                                    ▼
                    ┌───────────────────────────────┐
                    │          API Gateway          │
                    └───────────────┬───────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           │ gRPC                   │ gRPC                   │ gRPC
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│    Auth Service     │  │   Booking Service   │  │ Verification Service│
│ (Identity, Tokens)  │  │ (Orders, Trips, OTP)│  │ (KYC, Docs, License)│
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
           │ gRPC                   │ gRPC                   │ gRPC
           ▼                        ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│   Search & Catalog  │  │  Communication Svc  │  │  Rating & Review    │
│(Vehicles, Availability)│ (Chat, Calls, SOS)  │  │ (Reputation, Karma) │
└─────────────────────┘  └─────────────────────┘  └─────────────────────┘
           │ gRPC                   │ gRPC
           ▼                        ▼
┌─────────────────────┐  ┌─────────────────────┐
│  Discount Service   │  │   Payment Service   │
│(Promos, Dynamic Pricing)│(Escrow, Razorpay) │
└─────────────────────┘  └─────────────────────┘
```

### Communication Protocols
- **API Gateway**: Single entry point exposing clean **RESTful APIs** and **WebSockets** for real-time trip tracking/chat.
- **Internal Microservices**: Direct inter-service communication over **gRPC (Protocol Buffers)** for high performance, low latency, and strong static type safety.

---

## 🛠 Tech Stack

| Domain | Technologies |
| :--- | :--- |
| **Framework** | [NestJS](https://nestjs.com/) (Node.js & TypeScript) |
| **Architecture** | Microservices Architecture with Monorepo structure |
| **Inter-Service IPC** | **gRPC** via Protocol Buffers (`.proto`) |
| **Database & ORM** | PostgreSQL / TypeORM |
| **Caching & Pub/Sub** | Redis |
| **API Protocol** | REST, WebSockets (Socket.IO / Gateways) |
| **Containerization** | Docker & Docker Compose |

---

## 📁 Repository Structure (`apps/`)

- `apps/api-gateway`: Unified entry point routing HTTP requests to downstream gRPC services.
- `apps/auth-service`: Authentication, JWT issuing, user accounts, and security access control.
- `apps/booking`: Multi-vehicle order processing, pricing calculations, trip status, and trip lifecycle.
- `apps/search`: Vehicle catalog management, location indexing, and vehicle availability lookup.
- `apps/verification`: Identity verification (KYC), driving license, RC, and vehicle inspection documents.
- `apps/communication`: Real-time chat between passengers and owners, call masking, and emergency SOS alerts.
- `apps/rating`: User & driver rating system, dynamic reputation caching, and cancellation tracking.
- `apps/discount`: Promotional offers, discount codes, dynamic pricing adjustments, and offer history.
- `apps/payment`: Payment processing, advance hold payouts, and owner earnings distribution.
- `libs/proto`: Shared Protocol Buffer definitions for gRPC contracts across all microservices.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose
- [npm](https://www.npmjs.com/)

### Environment Setup
Copy sample environment files or configure `.env`:
```bash
cp todo.env .env
```

### 🐳 Running via Docker Compose
To run all microservices, databases, and Redis instances simultaneously:
```bash
docker-compose up --build
```

### 💻 Running Locally (Development Mode)
1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Shared Infra (PostgreSQL/Redis)**:
   ```bash
   docker-compose up postgres redis -d
   ```

3. **Start Microservices**:
   ```bash
   # Start API Gateway
   npm run start:dev api-gateway

   # Start Microservices individually or concurrently
   npm run start:dev booking
   npm run start:dev search
   npm run start:dev verification
   npm run start:dev auth-service
   npm run start:dev communication
   npm run start:dev rating
   npm run start:dev discount
   npm run start:dev payment
   ```

---

## 📄 License
This project is proprietary software under the RentKarRideKar Platform. All rights reserved.
