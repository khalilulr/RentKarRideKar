import { NestFactory } from '@nestjs/core';
import { RatingModule } from './rating.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  assertRatingServiceProtoExists,
  RATING_SERVICE_PROTO_PATH,
} from '../../../libs/proto/rating.grpc-options';

async function bootstrap() {
  assertRatingServiceProtoExists();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    RatingModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'rating',
        protoPath: RATING_SERVICE_PROTO_PATH,
        url: '0.0.0.0:50054',
      },
    },
  );
  await app.listen();
}
bootstrap();
