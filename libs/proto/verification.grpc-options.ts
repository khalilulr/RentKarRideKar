import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and verification-service gRPC. */
export const VERIFICATION_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/verification.proto',
);

export function assertVerificationServiceProtoExists(): void {
  if (!fs.existsSync(VERIFICATION_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Verification gRPC proto not found at ${VERIFICATION_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/verification.proto exists and restart both services.',
    );
  }
}
