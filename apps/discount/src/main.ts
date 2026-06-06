import { NestFactory } from '@nestjs/core';
import { DiscountModule } from './discount.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  assertDiscountServiceProtoExists,
  DISCOUNT_SERVICE_PROTO_PATH,
} from '../../../libs/proto/discount.grpc-options';

async function bootstrap() {
  assertDiscountServiceProtoExists();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(DiscountModule, {
    transport: Transport.GRPC,
    options: {
      package: 'discount',
      protoPath: DISCOUNT_SERVICE_PROTO_PATH,
      url: '0.0.0.0:50057',
    }
  });
  await app.listen();
}
bootstrap();
