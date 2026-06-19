import { NestFactory } from '@nestjs/core';
import { CommonModule } from './common.module';

async function bootstrap() {
  const app = await NestFactory.create(CommonModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');
}
bootstrap();
