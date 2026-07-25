import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VehicleEntity } from '../entity/vehicle.entity';
import { SearchVehicleDto } from '../dto/searchVehicle.dto';
import { CatalogService } from './catalog.service';
import { VehicleStatus } from '../enum/vehicleStatus.enum';
import { RedisService } from 'apps/common/src/redis/redis.service';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehicleRepository: Repository<VehicleEntity>,
    private readonly catalogService: CatalogService, // Injecting CatalogService for availability checks
    private readonly redisService: RedisService,
  ) {}

  async searchVehicles(dto: SearchVehicleDto): Promise<VehicleEntity[]> {
    const cacheKey = `search:query:${JSON.stringify(dto)}`;
    try {
      const cached = await this.redisService.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      // log or ignore redis error to fallback to DB
    }

    const qb = this.vehicleRepository
      .createQueryBuilder('v')
      .where('v.status = :status', {
        status: VehicleStatus.ACTIVE,
      })
      .andWhere('v.isAvailable = :isAvailable', {
        isAvailable: true,
      });

    /**
     * Pickup location filter
     */
    if (dto.fromLat && dto.fromLng) {
      qb.andWhere(
        `
      (
        6371 * acos(
          cos(radians(:fromLat)) *
          cos(radians(v.homeLat)) *
          cos(radians(v.homeLng) - radians(:fromLng)) +
          sin(radians(:fromLat)) *
          sin(radians(v.homeLat))
        )
      ) <= "v"."service_radius"
      `,
        {
          fromLat: dto.fromLat,
          fromLng: dto.fromLng,
        },
      );
    }

    /**
     * Vehicle category
     */
    if (dto.vehicleType && dto.vehicleType.toUpperCase() !== 'ALL') {
      qb.andWhere('v.vehicleCategory = :vehicleCategory', {
        vehicleCategory: dto.vehicleType,
      });
    }

    /**
     * Seating capacity
     */
    if (dto.seats) {
      let allowedCapacities: string[] = [];
      if (dto.seats <= 5) {
        allowedCapacities = ['FOUR_FIVE', 'SIX_SEVEN', 'EIGHT_PLUS'];
      } else if (dto.seats <= 7) {
        allowedCapacities = ['SIX_SEVEN', 'EIGHT_PLUS'];
      } else {
        allowedCapacities = ['EIGHT_PLUS'];
      }

      qb.andWhere('v.seatingCapacity IN (:...allowedCapacities)', {
        allowedCapacities,
      });
    }

    /**
     * Color
     */
    if (dto.color) {
      qb.andWhere('LOWER(v.color) = LOWER(:color)', {
        color: dto.color,
      });
    }

    /**
     * AC filter
     */
    if (dto.ac !== undefined) {
      qb.andWhere('v.hasAC = :ac', {
        ac: dto.ac,
      });
    }

    const vehicles = await qb.getMany();

    /**
     * Date availability check
     */
    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();

    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();

    const availableVehicles = await Promise.all(
      vehicles.map(async (vehicle) => {
        const isAvailable = await this.catalogService.isVehicleAvailable(
          vehicle.id,
          startDate,
          endDate,
        );

        if (!isAvailable) {
          return null;
        }

        return this.transformVehicleResponse(vehicle);
      }),
    );

    const filteredVehicles = availableVehicles.filter(
      (vehicle): vehicle is VehicleEntity => vehicle !== null,
    );

    try {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(filteredVehicles),
        120,
      );
    } catch (err) {
      // ignore write error
    }

    return filteredVehicles;
  }

  // Owner viewing their own fleet: needs to see their vehicles
  async getMyVehicles(ownerId: string): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository.find({
      where: { ownerId: ownerId },
    });

    return vehicles;
  }

  // Public/Customer viewing a single vehicle details
  async getVehicleById(id: string): Promise<VehicleEntity> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id, status: VehicleStatus.ACTIVE }, // Filters out unavailable vehicles for search
    });

    if (!vehicle) {
      throw new NotFoundException(`Vehicle not found or no longer available.`);
    }

    return this.transformVehicleResponse(vehicle);
  }

  // Geospatial Search: Find vehicles inside a specific city or radius
  async searchVehiclesByCity(
    lat: number,
    lng: number,
  ): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository
      .createQueryBuilder('v')
      .where('v.status = :status', {
        status: VehicleStatus.ACTIVE,
      })
      .andWhere('v.isAvailable = :isAvailable', {
        isAvailable: true,
      })
      .andWhere(
        `
      (
        6371 * acos(
          cos(radians(:lat)) *
          cos(radians(v.homeLat)) *
          cos(radians(v.homeLng) - radians(:lng)) +
          sin(radians(:lat)) *
          sin(radians(v.homeLat))
        )
      ) <= 50
      `,
        {
          lat,
          lng,
        },
      )
      .getMany();

    return vehicles.map((vehicle) => this.transformVehicleResponse(vehicle));
  }

  async getAllVehicles(): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository.find({
      where: {
        status: VehicleStatus.ACTIVE,
        isAvailable: true,
      },
      order: { createdAt: 'DESC' },
    });
    return vehicles.map((v) => this.transformVehicleResponse(v));
  }

  private transformVehicleResponse(vehicle: VehicleEntity): VehicleEntity {
    return vehicle;
  }
}
