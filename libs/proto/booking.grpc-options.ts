import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and booking-service gRPC. */
export const BOOKING_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/booking.proto',
);

export function assertBookingServiceProtoExists(): void {
  if (!fs.existsSync(BOOKING_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Booking gRPC proto not found at ${BOOKING_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/booking.proto exists and restart services.',
    );
  }
}
