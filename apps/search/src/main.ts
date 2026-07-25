import { NestFactory } from '@nestjs/core';
import { SearchModule } from './search.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  assertSearchAndCatalogServiceProtoExists,
  SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
} from '../../../libs/proto/search-and-catalog.grpc-options';

async function bootstrap() {
  assertSearchAndCatalogServiceProtoExists();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    SearchModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'searchAndCatalog',
        protoPath: SEARCH_AND_CATALOG_SERVICE_PROTO_PATH,
        url: '0.0.0.0:50055',
      },
    },
  );
  await app.listen();
}
bootstrap();
