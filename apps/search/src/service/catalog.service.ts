import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { VehicleEntity } from '../entity/vehicle.entity';
import { VehicleBlockEntity } from '../entity/vehicle-unavailability.entity';
import { RegisterVehicleDto } from '../dto/registerVehicle.dto';
import { UpdateVehicleDto } from '../dto/updateVehicle.dto';
import { Reason as REASON } from '../enum/reason.enum';
import { VehicleStatus } from '../enum/vehicleStatus.enum';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private communicationService: any;

  constructor(
    @InjectRepository(VehicleEntity)
    private readonly vehicleRepository: Repository<VehicleEntity>,

    @InjectRepository(VehicleBlockEntity)
    private readonly vehicleBlockRepository: Repository<VehicleBlockEntity>,

    @Inject('COMMUNICATION_SERVICE')
    private readonly communicationClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.communicationService = this.communicationClient.getService<any>('CommunicationService');
  }

  async sendNotification(userId: string, title: string, content: string, channel = 'both') {
    try {
      if (this.communicationService && typeof this.communicationService.sendNotification === 'function') {
        await lastValueFrom(
          this.communicationService.sendNotification({
            userId,
            title,
            content,
            channel,
            delayMinutes: 0,
          }),
        );
      }
    } catch (e: any) {
      console.error('[CatalogService] Failed to send notification via gRPC:', e.message);
    }
  }

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
    let rtoRawData: any = null;

    if (dto['rtoRawDataJson'] && dto['rtoRawDataJson'] !== '{}') {
      try {
        rtoRawData = JSON.parse(dto['rtoRawDataJson']);
        this.logger.log(`[RTO Verification] Saved pre-fetched RTO data for vehicle ${dto.registrationNumber}.`);
      } catch (err: any) {
        this.logger.error(`[RTO Verification] Failed to parse rtoRawDataJson: ${err.message}`);
      }
    }

    // Fallback: Perform real-time RTO lookup check if not passed or parse failed
    if (!rtoRawData && dto.registrationNumber) {
      const rtoData = await this.performRtoLookup(dto.registrationNumber);
      if (rtoData) {
        rtoRawData = rtoData;
        this.logger.log(`[RTO Verification] Vehicle ${dto.registrationNumber} verified successfully via real-time RTO Lookup.`);
      } else {
        this.logger.warn(`[RTO Verification] Vehicle ${dto.registrationNumber} could not be verified in real-time. Proceeding with manual admin review.`);
      }
    }

    const cleanDto = { ...dto };
    delete cleanDto['rtoRawDataJson'];

    const newVehicle = this.vehicleRepository.create({
      ...cleanDto,
      ownerId,
      status: VehicleStatus.DRAFT,
      isAvailable: false,
      rtoRawData,
    });
    return this.vehicleRepository.save(newVehicle);
  }

  private async performRtoLookup(registrationNumber: string): Promise<any> {
    try {
      this.logger.log(`[RTO Lookup] Querying RegCheck API for registration: ${registrationNumber}`);
      
      const cleanReg = registrationNumber.replace(/[\s-]/g, '').toUpperCase();
      
      const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
<soap:Body>
    <CheckIndia xmlns="http://regcheck.org.uk">
        <RegistrationNumber>${cleanReg}</RegistrationNumber>
        <username>md_khalilul_rahman</username>
    </CheckIndia>
</soap:Body>
</soap:Envelope>`;

      const response = await axios.post('https://www.regcheck.org.uk/api/reg.asmx', xmlPayload, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: 'http://regcheck.org.uk/CheckIndia',
        },
        timeout: 8000,
      });

      const xml = response.data;
      const match = xml.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/);
      if (match && match[1]) {
        const vehicleJsonString = match[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'");
        const vehicleData = JSON.parse(vehicleJsonString);
        this.logger.log(`[RTO Lookup] Verified details: ${JSON.stringify(vehicleData)}`);
        return vehicleData;
      } else {
        const errorMatch = xml.match(/<Message>([\s\S]*?)<\/Message>/) || xml.match(/<Vehicle>([\s\S]*?)<\/Vehicle>/);
        const errMsg = errorMatch ? errorMatch[1] : 'No vehicle JSON found in response';
        this.logger.warn(`[RTO Lookup] Failed to parse vehicle details. Response: ${errMsg}`);
        return null;
      }
    } catch (error: any) {
      this.logger.error(`[RTO Lookup] Error contacting RegCheck API: ${error.message}`);
      return null;
    }
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

    if (dto.isAvailable === true && vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException(
        'Vehicle cannot be active (available) while in DRAFT/non-ACTIVE status.',
      );
    }

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
    const saved = await this.vehicleRepository.save(vehicle);

    await this.sendNotification(
      saved.ownerId,
      'Vehicle Activated',
      `Your vehicle ${saved.make} ${saved.model} (${saved.registrationNumber}) has been approved and activated by the admin!`,
      'both',
    );

    return saved;
  }

  async suspendVehicle(id: string): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(id);
    vehicle.status = VehicleStatus.SUSPENDED;
    vehicle.isAvailable = false;
    const saved = await this.vehicleRepository.save(vehicle);

    await this.sendNotification(
      saved.ownerId,
      'Vehicle Suspended',
      `Your vehicle ${saved.make} ${saved.model} (${saved.registrationNumber}) has been suspended by the admin.`,
      'both',
    );

    return saved;
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

    if (isAvailable && vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException(
        'Only active vehicles can be set to online/available.',
      );
    }

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

    if (isAvailable) {
      await this.vehicleRepository.update(
        { ownerId, status: VehicleStatus.ACTIVE },
        { isAvailable: true },
      );
    } else {
      await this.vehicleRepository.update(
        { ownerId },
        { isAvailable: false },
      );
    }

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

    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot block a vehicle that is not ACTIVE.',
      );
    }

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

    const activeVehicles = vehicles.filter(
      (vehicle) => vehicle.status === VehicleStatus.ACTIVE,
    );

    if (activeVehicles.length === 0) {
      throw new BadRequestException(
        'No active vehicles found to block.',
      );
    }

    this.assertValidDateRange(start, end);     // ← validate dates

    const blocks = activeVehicles.map((vehicle) =>
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

  async updatePlateType(
    vehicleId: string,
    plateType: string,
    commercialPermitNumber?: string,
    permitType?: string,
    permitExpiryDate?: Date,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(vehicleId);
    vehicle.plateType = plateType;
    if (commercialPermitNumber !== undefined) vehicle.commercialPermitNumber = commercialPermitNumber;
    if (permitType !== undefined) vehicle.permitType = permitType;
    if (permitExpiryDate !== undefined) vehicle.permitExpiryDate = permitExpiryDate;
    return this.vehicleRepository.save(vehicle);
  }

  async setPricing(
    vehicleId: string,
    perKmOutstation?: number,
    perHourLocal?: number,
    minimumBookingHours?: number,
    nightChargePercentage?: number,
    eventPackage?: any,
  ): Promise<VehicleEntity> {
    const vehicle = await this.findVehicleOrThrow(vehicleId);
    if (perKmOutstation !== undefined) vehicle.perKmOutstation = perKmOutstation;
    if (perHourLocal !== undefined) vehicle.perHourLocal = perHourLocal;
    if (minimumBookingHours !== undefined) vehicle.minimumBookingHours = minimumBookingHours;
    if (nightChargePercentage !== undefined) vehicle.nightChargePercentage = nightChargePercentage;
    if (eventPackage !== undefined) vehicle.eventPackage = eventPackage;
    return this.vehicleRepository.save(vehicle);
  }

  async getPricing(vehicleId: string): Promise<any> {
    const vehicle = await this.findVehicleOrThrow(vehicleId);
    return {
      perKmOutstation: vehicle.perKmOutstation ? parseFloat(vehicle.perKmOutstation.toString()) : 0,
      perHourLocal: vehicle.perHourLocal ? parseFloat(vehicle.perHourLocal.toString()) : 0,
      minimumBookingHours: vehicle.minimumBookingHours || 4,
      nightChargePercentage: vehicle.nightChargePercentage || 20,
      eventPackage: vehicle.eventPackage || { halfDay: 0, fullDay: 0, weddingPackage: 0 },
      advancePercentage: vehicle.advancePercentage || 25,
      cancellationPolicy: "Free cancellation before 24 hours. 25% advance forfeited after that.",
    };
  }
}