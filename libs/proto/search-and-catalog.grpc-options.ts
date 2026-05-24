import * as fs from 'fs';
import * as path from 'path';

/** Single canonical proto path for api-gateway and search-and-catalog gRPC. */
export const SEARCH_AND_CATALOG_SERVICE_PROTO_PATH = path.join(
  process.cwd(),
  'libs/proto/search-and-catalog.proto',
);

export function assertSearchAndCatalogServiceProtoExists(): void {
  if (!fs.existsSync(SEARCH_AND_CATALOG_SERVICE_PROTO_PATH)) {
    throw new Error(
      `Search & Catalog gRPC proto not found at ${SEARCH_AND_CATALOG_SERVICE_PROTO_PATH}. ` +
        'Ensure libs/proto/search-and-catalog.proto exists and restart both services.',
    );
  }
}
