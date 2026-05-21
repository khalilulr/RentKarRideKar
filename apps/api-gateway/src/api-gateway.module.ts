import { Module } from '@nestjs/common';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import * as path from 'path';
import * as fs from 'fs';
import { RedisModule } from 'apps/common/src/redis/redis.module';
import { AuthController } from './auth/auth.controller';
import { VerificationController } from './verification/verification.controller';
import {
  assertAuthServiceProtoExists,
  AUTH_SERVICE_PROTO_PATH,
} from '../../../libs/proto/auth-service.grpc-options';
import {
  assertVerificationServiceProtoExists,
  VERIFICATION_SERVICE_PROTO_PATH,
} from '../../../libs/proto/verification.grpc-options';

assertAuthServiceProtoExists();
assertVerificationServiceProtoExists();
const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePath,
    }),
    JwtModule.register({
      privateKey: fs.readFileSync(path.join(process.cwd(), 'secrets/private.pem')),
      publicKey: fs.readFileSync(path.join(process.cwd(), 'secrets/public.pem')),
      signOptions: { algorithm: 'RS256' },
    }),
    RedisModule.registerAsync(),
    ClientsModule.register([
      {
        name: 'AUTH_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'auth',
          protoPath: AUTH_SERVICE_PROTO_PATH,
          url: 'auth-service:50051',
        },
      },
      {
        name: 'VERIFICATION_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'verification',
          protoPath: VERIFICATION_SERVICE_PROTO_PATH,
          url: 'verification-service:50052',
        },
      },
    ]),
  ],
  controllers: [ApiGatewayController, AuthController, VerificationController],
  providers: [ApiGatewayService],
})
export class ApiGatewayModule {}
