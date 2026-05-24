import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { SearchService } from '../service/search.service';
import * as types from '../../../../libs/types/search-and-catalog';
import { SearchVehicleDto } from '../dto/searchVehicle.dto';

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
export class SearchController implements Partial<types.SearchAndCatalogServiceController> {
  constructor(private readonly searchService: SearchService) {}

  @GrpcMethod('SearchAndCatalogService', 'SearchVehicles')
  async searchVehicles(request: types.SearchVehiclesRequest): Promise<types.ListVehiclesResponse> {
    const fromCoords = request.from.split(',').map((s) => parseFloat(s.trim()));
    const toCoords = request.to.split(',').map((s) => parseFloat(s.trim()));

    const dto: SearchVehicleDto = {
      fromLat: fromCoords[0] || 0,
      fromLng: fromCoords[1] || 0,
      toLat: toCoords[0] || 0,
      toLng: toCoords[1] || 0,
      startDate: request.date,
      endDate: request.date,
      time: request.time || undefined,
      vehicleType: request.vehicleType as any || undefined,
      seats: request.seats || undefined,
      color: request.color || undefined,
      ac: request.ac !== undefined ? request.ac : undefined,
    };

    const vehicles = await this.searchService.searchVehicles(dto);
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'GetMyVehicles')
  async getMyVehicles(request: types.GetMyVehiclesRequest): Promise<types.ListVehiclesResponse> {
    const vehicles = await this.searchService.getMyVehicles(request.ownerId);
    return { vehicles: vehicles.map(mapVehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'GetVehicleById')
  async getVehicleById(request: types.GetVehicleByIdRequest): Promise<types.VehicleResponse> {
    const vehicle = await this.searchService.getVehicleById(request.id);
    return { vehicle: mapVehicle(vehicle) };
  }

  @GrpcMethod('SearchAndCatalogService', 'SearchVehiclesByCity')
  async searchVehiclesByCity(request: types.SearchVehiclesByCityRequest): Promise<types.ListVehiclesResponse> {
    const coords = request.city.split(',').map((s) => parseFloat(s.trim()));
    if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
      const [lat, lng] = coords;
      const vehicles = await this.searchService.searchVehiclesByCity(lat, lng);
      return { vehicles: vehicles.map(mapVehicle) };
    } else {
      return { vehicles: [] };
    }
  }
}
