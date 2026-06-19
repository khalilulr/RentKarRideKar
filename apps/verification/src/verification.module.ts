import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KycVerificationEntity } from './entity/kyc-verification.entity';
import { DocumentEntity } from './entity/document.entity';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { COMMUNICATION_SERVICE_PROTO_PATH } from '../../../libs/proto/communication.grpc-options';

const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [ 
      TypeOrmModule.forFeature([KycVerificationEntity, DocumentEntity]),
      ConfigModule.forRoot({ isGlobal: true, envFilePath }),
      TypeOrmModule.forRootAsync({
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          type: 'postgres',
          host: configService.get<string>('VERIFICATION_DB_HOST'), 
          port: configService.get<number>('VERIFICATION_DB_PORT'), // 5432
          username: configService.get<string>('VERIFICATION_DB_USER'),
          password: configService.get<string>('VERIFICATION_DB_PASSWORD'),
          database: configService.get<string>('VERIFICATION_DB_NAME'),
          autoLoadEntities: true, // Automatically finds your @Entity() files
          synchronize: true, // Auto-creates tables (DEVELOPMENT ONLY!)
        }),
      }),
      ClientsModule.register([
        {
          name: 'COMMUNICATION_SERVICE',
          transport: Transport.GRPC,
          options: {
            package: 'communication',
            protoPath: COMMUNICATION_SERVICE_PROTO_PATH,
            url: 'communication-service:50054',
          },
        },
      ]),
  ],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
