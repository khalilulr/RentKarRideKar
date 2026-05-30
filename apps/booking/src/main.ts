import { NestFactory } from '@nestjs/core';
import { BookingModule } from './booking.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  assertBookingServiceProtoExists,
  BOOKING_SERVICE_PROTO_PATH,
} from '../../../libs/proto/booking.grpc-options';

async function bootstrap() {
  assertBookingServiceProtoExists();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(BookingModule, {
    transport: Transport.GRPC,
    options: {
      package: 'booking',
      protoPath: BOOKING_SERVICE_PROTO_PATH,
      url: '0.0.0.0:50053',
    }
  });
  await app.listen();
}
bootstrap();
