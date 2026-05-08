import { NestFactory } from '@nestjs/core';
import { RatingModule } from './rating.module';

async function bootstrap() {
  const app = await NestFactory.create(RatingModule);
  await app.listen(process.env.port ?? 3005);
}
bootstrap();
