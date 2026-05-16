import { Module } from '@nestjs/common';
import { CommonController } from './common.controller';
import { CommonService } from './common.service';
import { ConfigModule } from '@nestjs/config';
import { Msg91Service } from './msg91.service';
import { TransformInterceptor } from './transform.interceptor';
import { RedisModule } from './redis/redis.module';

const envFilePath = process.env.NODE_ENV?.trim() === 'production' ? '.env' : `.env.${process.env.NODE_ENV?.trim()}`;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath,
    }),
    RedisModule,
  ],
  controllers: [CommonController],

  providers: [
    CommonService,
    Msg91Service,
    TransformInterceptor,
  ],

  exports: [
    Msg91Service,
    TransformInterceptor,
  ],
})
export class CommonModule {}
