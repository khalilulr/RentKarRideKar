import { NestFactory } from '@nestjs/core';
import { PaymentModule } from './payment.module';

async function bootstrap() {
  const app = await NestFactory.create(PaymentModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.port ?? 3004);
}
bootstrap();
