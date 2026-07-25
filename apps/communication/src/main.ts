import { NestFactory } from '@nestjs/core';
import { CommunicationModule } from './communication.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { COMMUNICATION_SERVICE_PROTO_PATH } from '../../../libs/proto/communication.grpc-options';

async function bootstrap() {
  const app = await NestFactory.create(CommunicationModule);

  app.use((req: any, res: any, next: any) => {
    if (req.url && req.url.includes(',')) {
      req.url = req.url.replace(/,/g, '/');
    }
    next();
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'communication',
      protoPath: COMMUNICATION_SERVICE_PROTO_PATH,
      url: '0.0.0.0:50054',
    },
  });

  await app.startAllMicroservices();
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3003);
}
bootstrap();
