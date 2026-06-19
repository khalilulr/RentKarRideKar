import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsArray,
  IsLatitude,
  IsLongitude,
  Min,
  Max,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { VehicleCategory } from '../enum/vehicleCategory.enum';
import { SeatingCapacity } from '../enum/seatingCapacity.enum';
import { VehicleStatus } from '../enum/vehicleStatus.enum';

export class RegisterVehicleDto {

  @IsEnum(VehicleCategory)
  vehicleCategory: VehicleCategory;

  @IsString()
  make: string;

  @IsString()
  model: string;

  @IsOptional()
  @IsString()
  variant?: string;

  @IsString()
  registrationNumber: string;

  @IsEnum(SeatingCapacity)
  seatingCapacity: SeatingCapacity;

  @IsString()
  color: string;

  @IsBoolean()
  hasAC: boolean;

  @IsNumber()
  @Min(1900)
  @Max(new Date().getFullYear() + 1)
  manufacturingYear: number;

  @IsNumber()
  @Min(0)
  serviceRadius: number;

  @IsNumber()
  @IsLatitude()
  homeLat: number;

  @IsNumber()
  @IsLongitude()
  homeLng: number;

  @IsString()
  homeAddress: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehiclePhotos?: string[];

  @IsOptional()
  @IsString()
  fuelType?: string;

  @IsOptional()
  @IsString()
  transmission?: string;

  @IsOptional()
  @IsString()
  plateType?: string;

  @IsOptional()
  @IsString()
  rtoRawDataJson?: string;

  // Owner controlled
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}