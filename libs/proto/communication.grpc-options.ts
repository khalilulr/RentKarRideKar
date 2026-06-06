import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and communication-service gRPC. */
export const COMMUNICATION_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/communication.proto',
);

export function assertCommunicationServiceProtoExists(): void {
  if (!fs.existsSync(COMMUNICATION_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Communication gRPC proto not found at ${COMMUNICATION_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/communication.proto exists and restart services.',
    );
  }
}
