import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import cookieParser from 'cookie-parser';
import { RpcExceptionFilter } from 'apps/common/src/rpc-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule);
  app.use(cookieParser());
  app.useGlobalFilters(new RpcExceptionFilter());
  await app.listen(process.env.port ?? 3000);
}
bootstrap();

