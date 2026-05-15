import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and auth-service gRPC. */
export const AUTH_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/auth-service.proto',
);

export function assertAuthServiceProtoExists(): void {
  if (!fs.existsSync(AUTH_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Auth gRPC proto not found at ${AUTH_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/auth-service.proto exists and restart both services.',
    );
  }
}
