import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { CatalogService } from '../service/catalog.service';
import * as types from '../../../../libs/types/search-and-catalog';
import { RegisterVehicleDto } from '../dto/registerVehicle.dto';
import { UpdateVehicleDto } from '../dto/updateVehicle.dto';

function mapVehicle(v: any): types.Vehicle {
  return {
    id: v.id,
    ownerId: v.ownerId,
    vehicleCategory: v.vehicleCategory,
    make: v.make,
    model: v.model,
    variant: v.variant || '',
    registrationNumber: v.registrationNumber,
    seatingCapacity: v.seatingCapacity,
    color: v.color,
    hasAC: v.hasAC,
    manufacturingYear: v.manufacturingYear,
    serviceRadius: v.serviceRadius,
    homeLat: v.homeLat ? parseFloat(v.homeLat.toString()) : 0,
    homeLng: v.homeLng ? parseFloat(v.homeLng.toString()) : 0,
    homeAddress: v.homeAddress,
    vehiclePhotos: v.vehiclePhotos || [],
    status: v.status,
    isAvailable: v.isAvailable,
    fuelType: v.fuelType || '',
    transmission: v.transmission || '',
    plateType: v.plateType || 'WHITE',
    commercialPermitNumber: v.commercialPermitNumber || '',
    permitType: v.permitType || '',
    permitExpiryDate: (v.permitExpiryDate instanceof Date) ? v.permitExpiryDate.toISOString() : (v.permitExpiryDate ? new Date(v.permitExpiryDate).toISOString() : ''),
    perKmOutstation: v.perKmOutstation ? parseFloat(v.perKmOutstation.toString()) : 0,
    perHourLocal: v.perHourLocal ? parseFloat(v.perHourLocal.toString()) : 0,
    minimumBookingHours: v.minimumBookingHours || 4,
    nightChargePercentage: v.nightChargePercentage || 20,
    eventPackage: typeof v.eventPackage === 'string' ? JSON.parse(v.eventPackage) : (v.eventPackage || null),
    advancePercentage: v.advancePercentage || 25,
    rtoRawDataJson: v.rtoRawData ? JSON.stringify(v.rtoRawData) : '{}',
    createdAt: (v.createdAt instanceof Date) ? v.createdAt.toISOString() : (v.createdAt || ''),
    updatedAt: (v.updatedAt instanceof Date) ? v.updatedAt.toISOString() : (v.updatedAt || ''),
    blocks: (v.blocks || []).map((b: any) => ({
      id: b.id,
      startDate: b.startDate,
      endDate: b.endDate,
      reason: b.reason,
      bookingId: b.bookingId || '',
      createdAt: (b.createdAt instanceof Date) ? b.createdAt.toISOString() : (b.createdAt || ''),
    })),
  };
}

@Controller()
export class CatalogController implements Partial<types.SearchAndCatalogServiceController> {
  constructor(private readonly catalogService: CatalogService) {}

  @GrpcMethod('SearchAndCatalogService', 'RegisterVehicle')
  async registerVehicle(request: types.RegisterVehicleRequest): Promise<types.VehicleResponse> {
    const dto: RegisterVehicleDto = {
      vehicleCategory: request.vehicleCategory as any,
      make: request.make,
      model: request.model,
      variant: request.variant,
      registrationNumber: request.registrationNumber,
      seatingCapacity: request.seatingCapacity as any,
      color: request.color,
      hasAC: request.hasAC,
      manufacturingYear: request.manufacturingYear,
      serviceRadius: request.serviceRadius,
      homeLat: request.homeLat,
      homeLng: request.homeLng,
      homeAddress: request.homeAddress,
      vehiclePhotos: request.vehiclePhotos,
      fuelType: request.fuelType,
      transmission: request.transmission,
    };
    const vehicle = await this.catalogService.registerVehicle(request.ownerId, dto);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'GetVehicle')
  async getVehicle(request: types.GetVehicleRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.catalogService.getVehicle(request.id);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'ListVehicles')
  async listVehicles(request: types.ListVehiclesRequest): Promise<types.ListVehiclesResponse> {
    const vehicles = await this.catalogService.listVehicles(
      request.ownerId || undefined,
      request.status as any || undefined,
    );
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'UpdateVehicle')
  async updateVehicle(request: types.UpdateVehicleRequest): Promise<types.VehicleResponse> {
    const { id, ownerId, ...dto } = request;
    const updateDto: UpdateVehicleDto = dto as any;
    const vehicle = await this.catalogService.updateVehicle(id, ownerId, updateDto);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'DeleteVehicle')
  async deleteVehicle(request: types.DeleteVehicleRequest): Promise<types.DeleteVehicleResponse> {
    return this.catalogService.deleteVehicle(request.id, request.ownerId);
  }

  @GrpcMethod('SearchAndCatalogService', 'ActivateVehicle')
  async activateVehicle(request: types.ActivateVehicleRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.catalogService.activateVehicle(request.id);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'SuspendVehicle')
  async suspendVehicle(request: types.SuspendVehicleRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.catalogService.suspendVehicle(request.id);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'UpdateVehicleOnlineStatus')
  async updateVehicleOnlineStatus(request: types.UpdateVehicleOnlineStatusRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.catalogService.updateVehicleOnlineStatus(
      request.id,
      request.ownerId,
      request.isAvailable,
    );
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'UpdateOwnerVehiclesAvailability')
  async updateOwnerVehiclesAvailability(request: types.UpdateOwnerVehiclesAvailabilityRequest): Promise<types.ListVehiclesResponse> {
    const vehicles = await this.catalogService.updateOwnerVehiclesAvailability(
      request.ownerId,
      request.isAvailable,
    );
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'BlockVehicle')
  async blockVehicle(request: types.BlockVehicleRequest): Promise<types.VehicleResponse> {
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    const vehicle = await this.catalogService.blockVehicle(
      request.id,
      request.ownerId,
      start,
      end,
      request.reason as any || undefined,
      request.bookingId || undefined,
    );
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'BlockAllOwnerVehicles')
  async blockAllOwnerVehicles(request: types.BlockAllOwnerVehiclesRequest): Promise<types.ListVehiclesResponse> {
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    const vehicles = await this.catalogService.blockAllOwnerVehicles(
      request.ownerId,
      start,
      end,
      request.reason as any || undefined,
    );
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'UnblockVehicle')
  async unblockVehicle(request: types.UnblockVehicleRequest): Promise<types.UnblockVehicleResponse> {
    return this.catalogService.unblockVehicle(request.blockId, request.ownerId);
  }

  @GrpcMethod('SearchAndCatalogService', 'UnblockAllOwnerVehicles')
  async unblockAllOwnerVehicles(request: types.UnblockAllOwnerVehiclesRequest): Promise<types.ListVehiclesResponse> {
    const vehicles = await this.catalogService.unblockAllOwnerVehicles(request.ownerId);
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'IsVehicleAvailable')
  async isVehicleAvailable(request: types.IsVehicleAvailableRequest): Promise<types.IsVehicleAvailableResponse> {
    const start = new Date(request.startDate);
    const end = new Date(request.endDate);
    const isAvailable = await this.catalogService.isVehicleAvailable(
      request.vehicleId,
      start,
      end,
    );
    return { isAvailable };
  }

  @GrpcMethod('SearchAndCatalogService', 'UpdatePlateType')
  async updatePlateType(request: types.UpdatePlateTypeRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.catalogService.updatePlateType(
      request.vehicleId,
      request.plateType,
      request.commercialPermitNumber,
      request.permitType,
      request.permitExpiryDate ? new Date(request.permitExpiryDate) : undefined,
    );
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'SetPricing')
  async setPricing(request: types.SetPricingRequest): Promise<types.VehicleResponse> {
    const eventPkg = typeof request.eventPackage === 'string'
      ? JSON.parse(request.eventPackage)
      : request.eventPackage;

    const vehicle = await this.catalogService.setPricing(
      request.vehicleId,
      request.perKmOutstation,
      request.perHourLocal,
      request.minimumBookingHours,
      request.nightChargePercentage,
      eventPkg,
    );
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'GetPricing')
  async getPricing(request: types.GetPricingRequest): Promise<types.GetPricingResponse> {
    const pricing = await this.catalogService.getPricing(request.vehicleId);
    return {
      vehicleId: request.vehicleId,
      pricing: pricing,
    };
  }
}