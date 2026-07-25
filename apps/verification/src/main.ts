import { NestFactory } from '@nestjs/core';
import { VerificationModule } from './verification.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  assertVerificationServiceProtoExists,
  VERIFICATION_SERVICE_PROTO_PATH,
} from '../../../libs/proto/verification.grpc-options';

async function bootstrap() {
  assertVerificationServiceProtoExists();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    VerificationModule,
    {
      transport: Transport.GRPC,
      options: {
        package: 'verification',
        protoPath: VERIFICATION_SERVICE_PROTO_PATH,
        url: '0.0.0.0:50052',
      },
    },
  );
  await app.listen();
}
bootstrap();
