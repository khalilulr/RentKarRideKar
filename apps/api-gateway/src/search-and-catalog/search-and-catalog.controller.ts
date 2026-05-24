import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from '../auth/guards/vehicle_owner.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  SearchAndCatalogServiceClient,
  SEARCH_AND_CATALOG_SERVICE_NAME,
} from '../../../../libs/types/search-and-catalog';

@Controller('vehicles')
export class SearchAndCatalogController implements OnModuleInit {
  private searchAndCatalogService: SearchAndCatalogServiceClient;

  constructor(
    @Inject('SEARCH_AND_CATALOG_SERVICE') private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.searchAndCatalogService = this.client.getService<SearchAndCatalogServiceClient>(
      SEARCH_AND_CATALOG_SERVICE_NAME,
    );
  }

  // ==========================================================================
  // STATIC / CONSTANT ROUTES FIRST (To prevent collisions with wildcards)
  // ==========================================================================

  // 1. GET ROUTES

  @Get('search')
  searchVehicles(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
    @Query('vehicleType') vehicleType?: string,
    @Query('seats') seats?: string,
    @Query('color') color?: string,
    @Query('ac') ac?: string,
  ): Observable<any> {
    return this.searchAndCatalogService.searchVehicles({
      from: from ?? '',
      to: to ?? '',
      date: date ?? '',
      time: time ?? '',
      vehicleType: vehicleType ?? '',
      seats: seats ? parseInt(seats, 10) : 0,
      color: color ?? '',
      ac: ac !== undefined ? ac === 'true' : undefined,
    });
  }

  @Get('owner/my')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  getMyVehicles(@CurrentUser() user: any): Observable<any> {
    return this.searchAndCatalogService.getMyVehicles({ ownerId: user.userId });
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  listVehicles(
    @Query('ownerId') ownerId?: string,
    @Query('status') status?: string,
  ): Observable<any> {
    return this.searchAndCatalogService.listVehicles({
      ownerId: ownerId ?? '',
      status: status ?? '',
    });
  }

  // 2. POST ROUTES

  @Post('owner/block')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  blockAllOwnerVehicles(
    @CurrentUser() user: any,
    @Body() body: { startDate: string; endDate: string; reason?: string },
  ): Observable<any> {
    return this.searchAndCatalogService.blockAllOwnerVehicles({
      ownerId: user.userId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason ?? '',
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  registerVehicle(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.searchAndCatalogService.registerVehicle({
      ownerId: user.userId,
      vehicleCategory: body.vehicleCategory ?? '',
      make: body.make ?? '',
      model: body.model ?? '',
      variant: body.variant ?? '',
      registrationNumber: body.registrationNumber ?? '',
      seatingCapacity: body.seatingCapacity ?? '',
      color: body.color ?? '',
      hasAC: body.hasAC ?? false,
      manufacturingYear: body.manufacturingYear ?? 0,
      serviceRadius: body.serviceRadius ?? 0,
      homeLat: body.homeLat ?? 0,
      homeLng: body.homeLng ?? 0,
      homeAddress: body.homeAddress ?? '',
      vehiclePhotos: body.vehiclePhotos ?? [],
    });
  }

  // 3. PATCH ROUTES

  @Patch('owner/online-status')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  updateOwnerVehiclesAvailability(
    @CurrentUser() user: any,
    @Body('isAvailable') isAvailable: boolean,
  ): Observable<any> {
    return this.searchAndCatalogService.updateOwnerVehiclesAvailability({
      ownerId: user.userId,
      isAvailable,
    });
  }

  // 4. DELETE ROUTES

  @Delete('owner/blocks')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  unblockAllOwnerVehicles(@CurrentUser() user: any): Observable<any> {
    return this.searchAndCatalogService.unblockAllOwnerVehicles({
      ownerId: user.userId,
    });
  }

  @Delete('blocks/:blockId')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  unblockVehicle(
    @Param('blockId') blockId: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.searchAndCatalogService.unblockVehicle({
      blockId,
      ownerId: user.userId,
    });
  }

  // ==========================================================================
  // DYNAMIC / WILDCARD PARAMETER ROUTES LAST
  // ==========================================================================

  @Get('city/:city')
  searchVehiclesByCity(@Param('city') city: string): Observable<any> {
    return this.searchAndCatalogService.searchVehiclesByCity({ city });
  }

  @Get('owner/:id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  getVehicleOwnerDetail(@Param('id') id: string): Observable<any> {
    return this.searchAndCatalogService.getVehicle({ id });
  }

  @Get(':id/available')
  isVehicleAvailable(
    @Param('id') vehicleId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ): Observable<any> {
    return this.searchAndCatalogService.isVehicleAvailable({
      vehicleId,
      startDate,
      endDate,
    });
  }

  @Get(':id')
  getVehicleById(@Param('id') id: string): Observable<any> {
    return this.searchAndCatalogService.getVehicleById({ id });
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  updateVehicle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.searchAndCatalogService.updateVehicle({
      id,
      ownerId: user.userId,
      vehicleCategory: body.vehicleCategory || undefined,
      make: body.make || undefined,
      model: body.model || undefined,
      variant: body.variant || undefined,
      registrationNumber: body.registrationNumber || undefined,
      seatingCapacity: body.seatingCapacity || undefined,
      color: body.color || undefined,
      hasAC: body.hasAC !== undefined ? body.hasAC : undefined,
      manufacturingYear: body.manufacturingYear || undefined,
      serviceRadius: body.serviceRadius || undefined,
      homeLat: body.homeLat || undefined,
      homeLng: body.homeLng || undefined,
      homeAddress: body.homeAddress || undefined,
      vehiclePhotos: body.vehiclePhotos || undefined,
    });
  }

  @Post(':id/block')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  blockVehicle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: { startDate: string; endDate: string; reason?: string; bookingId?: string },
  ): Observable<any> {
    return this.searchAndCatalogService.blockVehicle({
      id,
      ownerId: user.userId,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason ?? '',
      bookingId: body.bookingId ?? '',
    });
  }

  @Patch(':id/online-status')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  updateVehicleOnlineStatus(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body('isAvailable') isAvailable: boolean,
  ): Observable<any> {
    return this.searchAndCatalogService.updateVehicleOnlineStatus({
      id,
      ownerId: user.userId,
      isAvailable,
    });
  }

  @Patch(':id/activate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  activateVehicle(@Param('id') id: string): Observable<any> {
    return this.searchAndCatalogService.activateVehicle({ id });
  }

  @Patch(':id/suspend')
  @UseGuards(JwtAuthGuard, AdminGuard)
  suspendVehicle(@Param('id') id: string): Observable<any> {
    return this.searchAndCatalogService.suspendVehicle({ id });
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  deleteVehicle(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Observable<any> {
    return this.searchAndCatalogService.deleteVehicle({
      id,
      ownerId: user.userId,
    });
  }
}
