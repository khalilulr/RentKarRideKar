import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and discount-service gRPC. */
export const DISCOUNT_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/discount.proto',
);

export function assertDiscountServiceProtoExists(): void {
  if (!fs.existsSync(DISCOUNT_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Discount gRPC proto not found at ${DISCOUNT_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/discount.proto exists and restart services.',
    );
  }
}
