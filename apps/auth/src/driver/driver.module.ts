import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { User } from '../entity/user.entity';
import { TrustedDriver } from '../entity/trusted-driver.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, TrustedDriver])],
  controllers: [DriverController],
  providers: [DriverService],
})
export class DriverModule {}
