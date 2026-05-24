import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { VehicleEntity } from '../entity/vehicle.entity';
import { VehicleBlockEntity } from '../entity/vehicle-unavailability.entity';
import { RegisterVehicleDto } from '../dto/registerVehicle.dto';
import { UpdateVehicleDto } from '../dto/updateVehicle.dto';
import { Reason as REASON } from '../enum/reason.enum';
import { VehicleStatus } from '../enum/vehicleStatus.enum';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehicleRepository: Repository<VehicleEntity>,

    @InjectRepository(VehicleBlockEntity)
    private readonly vehicleBlockRepository: Repository<VehicleBlockEntity>,
  ) {}

  // ====================================================================
  // PRIVATE HELPERS
  // ====================================================================

  /**
   * Find a vehicle by ID or throw NotFoundException.
   */
  private async findVehicleOrThrow(id: string): Promise<VehicleEntity> {
    const vehicle = await this.vehicleRepository.findOne({ where: { id } });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID "${id}" not found`);
    }
    return vehicle;
  }

  /**
   * Verify the vehicle belongs to the owner or throw ForbiddenException.
   */
  private assertOwnership(vehicle: VehicleEntity, ownerId: string): void {
    if (vehicle.ownerId !== ownerId) {
      throw new ForbiddenException(
        'You do not have permission to modify this vehicle',
      );
    }
  }

  /**
   * Validate that startDate is before endDate.
   */
  private assertValidDateRange(start: Date, end: Date): void {
    if (start >= end) {
      throw new BadRequestException(
        'startDate must be before endDate',
      );
    }
  }

  /**
   * Convert Date to 'YYYY-MM-DD' string for TypeORM date column.
   */
  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // ====================================================================
  // VEHICLE CRUD
  // ====================================================================

  async registerVehicle(
    ownerId: string,
    dto: RegisterVehicleDto,
  ): Promise<VehicleEntity> {
    const newVehicle = this.vehicleRepository.create({ ...dto, ownerId });
    return this.vehicleRepository.save(newVehicle);
  }

  async getVehicle(id: string): Promise<VehicleEntity> {
    const vehicle = await this.vehicleRepository.findOne({
      where: { id },
      relations: ['blocks'],
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID "${id}" not found`);
    }
    return vehicle;
  }

  async listVehicles(
    ownerId?: string,
    status?: VehicleStatus,
  ): Promise<VehicleEntity[]> {
    const where: any = {};
    if (ownerId) where.ownerId = ownerId;
    if (status) where.status = status;

    return this.vehicleRepository.find({
      where,
      relations: ['blocks'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateVehicle(
    id: string,
    ownerId: string,          // ← now required, checked against vehicle
    dto: UpdateVehicleDto,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertOwnership(vehicle, ownerId);   // ← ownership check

    const updatedVehicle = this.vehicleRepository.merge(vehicle, dto);
    return this.vehicleRepository.save(updatedVehicle);
  }

  async deleteVehicle(
    id: string,
    ownerId: string,          // ← now required, checked against vehicle
  ): Promise<{ deleted: boolean }> {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertOwnership(vehicle, ownerId);   // ← ownership check

    await this.vehicleRepository.softDelete(id);
    return { deleted: true };
  }

  // ====================================================================
  // ADMIN — VEHICLE STATUS
  // ====================================================================

  async activateVehicle(id: string): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    vehicle.status = VehicleStatus.ACTIVE;
    return this.vehicleRepository.save(vehicle);
  }

  async suspendVehicle(id: string): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    vehicle.status = VehicleStatus.SUSPENDED;
    return this.vehicleRepository.save(vehicle);
  }

  // ====================================================================
  // OWNER — PERMANENT ONLINE/OFFLINE TOGGLE (no dates)
  // ====================================================================

  /**
   * Toggle a single vehicle online or offline immediately.
   * No dates involved — takes effect right now.
   */
  async updateVehicleOnlineStatus(
    id: string,
    ownerId: string,
    isAvailable: boolean,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertOwnership(vehicle, ownerId);

    vehicle.isAvailable = isAvailable;
    return this.vehicleRepository.save(vehicle);
  }

  /**
   * Toggle ALL vehicles for an owner online or offline immediately.
   * No dates involved — takes effect right now.
   */
  async updateOwnerVehiclesAvailability(
    ownerId: string,
    isAvailable: boolean,
  ): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository.find({
      where: { ownerId },
    });

    if (!vehicles.length) {
      throw new NotFoundException(
        `No vehicles found for owner with ID "${ownerId}"`,
      );
    }

    await this.vehicleRepository.update(
      { ownerId },
      { isAvailable },
    );

    return this.vehicleRepository.find({ where: { ownerId } });
  }

  // ====================================================================
  // OWNER — DATE-SPECIFIC BLOCKING (with startDate and endDate)
  // ====================================================================

  /**
   * Block a single vehicle for specific dates.
   * Does NOT touch isAvailable — search filters by date range.
   */
  async blockVehicle(
    id: string,
    ownerId: string,
    start: Date,
    end: Date,
    reason: REASON = REASON.OWNER_BLOCKED,
    bookingId?: string,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    this.assertOwnership(vehicle, ownerId);
    this.assertValidDateRange(start, end);     // ← validate dates

    const block = this.vehicleBlockRepository.create({
      vehicle,
      startDate: this.toDateString(start),
      endDate: this.toDateString(end),
      reason,
      bookingId,
    });
    await this.vehicleBlockRepository.save(block);

    return this.getVehicle(id);
  }

  /**
   * Block ALL vehicles for an owner for specific dates.
   * Does NOT touch isAvailable.
   */
  async blockAllOwnerVehicles(
    ownerId: string,
    start: Date,
    end: Date,
    reason: REASON = REASON.OWNER_BLOCKED,
  ): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository.find({
      where: { ownerId },
    });

    if (!vehicles.length) {
      throw new NotFoundException(
        `No vehicles found for owner with ID "${ownerId}"`,
      );
    }

    this.assertValidDateRange(start, end);     // ← validate dates

    const blocks = vehicles.map((vehicle) =>
      this.vehicleBlockRepository.create({
        vehicle,
        startDate: this.toDateString(start),
        endDate: this.toDateString(end),
        reason,
      }),
    );
    await this.vehicleBlockRepository.save(blocks);

    return this.vehicleRepository.find({
      where: { ownerId },
      relations: ['blocks'],
    });
  }

  /**
   * Remove a specific block by blockId.
   * Owner removes a manually created block.
   */
  async unblockVehicle(
    blockId: string,
    ownerId: string,
  ): Promise<{ unblocked: boolean }> {
    const block = await this.vehicleBlockRepository.findOne({
      where: { id: blockId },
      relations: ['vehicle'],
    });

    if (!block) {
      throw new NotFoundException(`Block with ID "${blockId}" not found`);
    }

    this.assertOwnership(block.vehicle, ownerId);  // ← ownership check

    await this.vehicleBlockRepository.delete(blockId);
    return { unblocked: true };
  }

  /**
   * Remove ALL owner-created blocks for all owner's vehicles.
   * Never removes BOOKED blocks — booking service manages those.
   */
  async unblockAllOwnerVehicles(
    ownerId: string,
  ): Promise<VehicleEntity[]> {
    const vehicles = await this.vehicleRepository.find({
      where: { ownerId },
    });

    if (!vehicles.length) {
      throw new NotFoundException(
        `No vehicles found for owner with ID "${ownerId}"`,
      );
    }

    for (const vehicle of vehicles) {
      await this.vehicleBlockRepository.createQueryBuilder()
        .delete()
        .where('vehicle_id = :vehicleId', { vehicleId: vehicle.id })
        .andWhere('reason = :reason', { reason: REASON.OWNER_BLOCKED })
        .execute();
    }

    return this.vehicleRepository.find({
      where: { ownerId },
      relations: ['blocks'],
    });
  }

  // ====================================================================
  // AVAILABILITY CHECK (used by search service)
  // ====================================================================

  /**
   * Check if a vehicle is available for a given date range.
   * Checks isAvailable flag AND overlapping blocks.
   */
   async isVehicleAvailable(
    vehicleId: string,
    start: Date,
    end: Date,
  ): Promise<boolean> {
    const vehicle = await this.vehicleRepository.findOne({
      where: {
        id: vehicleId,
        isAvailable: true,
        status: VehicleStatus.ACTIVE,
      },
    });

    if (!vehicle) return false;   // offline or not active

    // Check for any overlapping block
    const overlappingBlock = await this.vehicleBlockRepository.findOne({
      where: {
        vehicle: { id: vehicleId },
        startDate: LessThanOrEqual(this.toDateString(end)),
        endDate: MoreThanOrEqual(this.toDateString(start)),
      },
    });

    return !overlappingBlock;     // true = available, false = blocked
  }
}