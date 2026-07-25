import { DynamicModule, Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({})
export class RedisModule {
  static registerAsync(): DynamicModule {
    return {
      module: RedisModule,
      imports: [ConfigModule], // Import ConfigModule here
      providers: [
        {
          provide: 'REDIS_CLIENT',
          useFactory: (configService: ConfigService) => {
            const host = configService.get<string>('REDIS_HOST');
            const port = configService.get<number>('REDIS_PORT');

            const client = new Redis({
              host: host ?? 'localhost',
              port: port ?? 6379,
            });

            client.on('connect', () => {
              console.log(`Successfully connected to Redis at ${host}:${port}`);
            });

            client.on('error', (err) => {
              console.error('Redis connection error:', err);
            });

            return client;
          },
          inject: [ConfigService],
        },
        RedisService,
      ],
      exports: ['REDIS_CLIENT', RedisService],
    };
  }
}
