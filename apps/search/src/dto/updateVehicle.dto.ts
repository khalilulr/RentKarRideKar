import { PartialType } from '@nestjs/mapped-types';
import { VehicleEntity } from '../entity/vehicle.entity';

export class UpdateVehicleDto extends PartialType(VehicleEntity) {}
