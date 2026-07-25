import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
  IsLatitude,
  IsLongitude,
} from 'class-validator';

import { Type } from 'class-transformer';

import { VehicleCategory } from '../enum/vehicleCategory.enum';

export class SearchVehicleDto {
  @IsNumber()
  fromLat: number;

  @IsNumber()
  fromLng: number;

  @IsNumber()
  toLat: number;

  @IsNumber()
  toLng: number;

  /**
   * Journey date
   * Format: YYYY-MM-DD
   */
  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  /**
   * Pickup time
   * Format: HH:MM
   */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  time?: string;

  /**
   * Vehicle category
   */
  @IsOptional()
  @IsEnum(VehicleCategory)
  vehicleType?: VehicleCategory;

  /**
   * Minimum seating capacity
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  seats?: number;

  /**
   * Vehicle color
   */
  @IsOptional()
  @IsString()
  color?: string;

  /**
   * AC / Non-AC
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  ac?: boolean;
}
