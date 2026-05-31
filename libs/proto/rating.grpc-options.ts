import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and rating-service gRPC. */
export const RATING_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/rating.proto',
);

export function assertRatingServiceProtoExists(): void {
  if (!fs.existsSync(RATING_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Rating gRPC proto not found at ${RATING_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/rating.proto exists and restart services.',
    );
  }
}
