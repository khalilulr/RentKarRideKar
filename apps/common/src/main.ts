import { NestFactory } from '@nestjs/core';
import { CommonModule } from './common.module';

async function bootstrap() {
  const app = await NestFactory.create(CommonModule);
  await app.listen(process.env.PORT ?? 8000, '0.0.0.0');
}
bootstrap();
