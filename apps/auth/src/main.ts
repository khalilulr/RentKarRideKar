import { NestFactory } from '@nestjs/core';
import { AuthModule } from './auth.module';
import cookieParser from 'cookie-parser';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import path from 'path';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.GRPC,
    options: {
      package: 'auth',
      protoPath: path.join(__dirname, './auth.proto'),
      url: 'auth-service:50051',
    }
  });
  // app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen();
}
bootstrap();
