import { NestFactory } from '@nestjs/core';
import { ApiGatewayModule } from './api-gateway.module';
import cookieParser from 'cookie-parser';
import { RpcExceptionFilter } from 'apps/common/src/rpc-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(ApiGatewayModule, {
    bodyParser: false, 
  });
  
  // Manually add JSON and urlencoded parsers (excludes multipart)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: any, res: any, next: any) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      return next(); // let Multer handle it
    }
    require('express').json()(req, res, (err: any) => {
      if (err) return next(err);
      require('express').urlencoded({ extended: true })(req, res, next);
    });
  });

  app.use(cookieParser());
  app.useGlobalFilters(new RpcExceptionFilter());
  app.enableCors({ origin: true, credentials: true });

  // Setup Swagger API Documentation UI
  try {
    const swaggerDocument = require('../../../swagger.json');
    const { SwaggerModule } = require('@nestjs/swagger');
    SwaggerModule.setup('api-docs', app, swaggerDocument);
    console.log('[GATEWAY] Swagger UI loaded at /api-docs');
  } catch (e: any) {
    console.error('[GATEWAY] Failed to initialize Swagger UI:', e.message);
  }

  await app.listen(process.env.port ?? 3000);
}
bootstrap();

