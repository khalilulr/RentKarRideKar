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
  UseInterceptors,
  UploadedFiles,
  InternalServerErrorException,
} from '@nestjs/common';
import axios from 'axios';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, from } from 'rxjs';
import { mergeMap, catchError, map } from 'rxjs/operators';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VehicleOwnerGuard } from '../auth/guards/vehicle_owner.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  SearchAndCatalogServiceClient,
  SEARCH_AND_CATALOG_SERVICE_NAME,
} from '../../../../libs/types/search-and-catalog';

@Controller('vehicles')
export class SearchAndCatalogController implements OnModuleInit {
  private searchAndCatalogService: SearchAndCatalogServiceClient;

  constructor(
    @Inject('SEARCH_AND_CATALOG_SERVICE') private readonly client: ClientGrpc,
    private readonly cloudinaryService: CloudinaryService,
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

  @Get('admin/draft')
  @UseGuards(JwtAuthGuard, AdminGuard)
  getDraftVehicles(): Observable<any> {
    return this.searchAndCatalogService.listVehicles({
      ownerId: '',
      status: 'DRAFT',
    });
  }

  @Get('all')
  getAllVehicles(): Observable<any> {
    return this.searchAndCatalogService.getAllVehicles({});
  }

  @Get('rto-lookup/:plate')
  @UseGuards(JwtAuthGuard)
  async rtoLookup(@Param('plate') plate: string): Promise<any> {
    try {
      const cleanReg = plate.replace(/[\s-]/g, '').toUpperCase();
      console.log(`[RTO Gateway Lookup] Querying RegCheck API for registration: ${cleanReg}`);
      
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
        console.log(`[RTO Gateway Lookup] Verified successfully:`, vehicleData);
        return { success: true, data: vehicleData };
      } else {
        const errorMatch = xml.match(/<Message>([\s\S]*?)<\/Message>/) || xml.match(/<Vehicle>([\s\S]*?)<\/Vehicle>/);
        const errMsg = errorMatch ? errorMatch[1] : 'No vehicle JSON found in response';
        console.warn(`[RTO Gateway Lookup] Failed response parsed: ${errMsg}`);
        return { success: false, error: errMsg };
      }
    } catch (error: any) {
      console.error(`[RTO Gateway Lookup] Exception calling RegCheck API:`, error.message);
      return { success: false, error: error.message };
    }
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
  @UseInterceptors(FilesInterceptor('photos', 10))
  registerVehicle(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Observable<any> {
    const performRegister = (photos: string[]) => {
      return (this.searchAndCatalogService.registerVehicle({
        ownerId: user.userId,
        vehicleCategory: body.vehicleCategory ?? '',
        make: body.make ?? '',
        model: body.model ?? '',
        variant: body.variant ?? '',
        registrationNumber: body.registrationNumber ?? '',
        seatingCapacity: body.seatingCapacity ?? '',
        color: body.color ?? '',
        hasAC: body.hasAC ?? false,
        manufacturingYear: body.manufacturingYear ? Number(body.manufacturingYear) : 0,
        serviceRadius: body.serviceRadius ? Number(body.serviceRadius) : 0,
        homeLat: body.homeLat ? Number(body.homeLat) : 0,
        homeLng: body.homeLng ? Number(body.homeLng) : 0,
        homeAddress: body.homeAddress ?? '',
        vehiclePhotos: photos,
        fuelType: body.fuelType ?? '',
        transmission: body.transmission ?? '',
        plateType: body.plateType ?? 'WHITE',
        rtoRawDataJson: body.rtoRawDataJson ?? '{}',
      }) as Observable<any>).pipe(
        catchError((err) => {
          console.error('[SearchAndCatalogController] Error calling registerVehicle microservice:', err);
          throw new InternalServerErrorException(err.message || 'Error registering vehicle');
        }),
      );
    };

    if (files && files.length > 0) {
      return from(this.cloudinaryService.uploadFiles(files)).pipe(
        mergeMap((urls) => performRegister(urls)),
        catchError((err) => {
          console.error('[SearchAndCatalogController] Error uploading files/pipeline:', err);
          throw new InternalServerErrorException(err.message || 'Error uploading files to Cloudinary');
        }),
      );
    }

    const defaultPhotos = body.vehiclePhotos
      ? (Array.isArray(body.vehiclePhotos) ? body.vehiclePhotos : [body.vehiclePhotos])
      : [];
    return performRegister(defaultPhotos);
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
  @UseInterceptors(FilesInterceptor('photos', 10))
  updateVehicle(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Observable<any> {
    const performUpdate = (photos?: string[]) => {
      return (this.searchAndCatalogService.updateVehicle({
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
        manufacturingYear: body.manufacturingYear ? Number(body.manufacturingYear) : (undefined as any),
        serviceRadius: body.serviceRadius ? Number(body.serviceRadius) : (undefined as any),
        homeLat: body.homeLat ? Number(body.homeLat) : (undefined as any),
        homeLng: body.homeLng ? Number(body.homeLng) : (undefined as any),
        homeAddress: body.homeAddress || undefined,
        vehiclePhotos: photos !== undefined ? photos : (body.vehiclePhotos ? (Array.isArray(body.vehiclePhotos) ? body.vehiclePhotos : [body.vehiclePhotos]) : undefined),
        fuelType: body.fuelType || undefined,
        transmission: body.transmission || undefined,
      }) as Observable<any>).pipe(
        catchError((err) => {
          console.error('[SearchAndCatalogController] Error calling updateVehicle microservice:', err);
          throw new InternalServerErrorException(err.message || 'Error updating vehicle');
        }),
      );
    };

    if (files && files.length > 0) {
      return from(this.cloudinaryService.uploadFiles(files)).pipe(
        mergeMap((urls) => performUpdate(urls)),
        catchError((err) => {
          console.error('[SearchAndCatalogController] Error uploading files/pipeline:', err);
          throw new InternalServerErrorException(err.message || 'Error uploading files to Cloudinary');
        }),
      );
    }

    return performUpdate();
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

  @Patch(':id/plate-type')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  updatePlateType(
    @Param('id') id: string,
    @Body() body: any,
  ): Observable<any> {
    return this.searchAndCatalogService.updatePlateType({
      vehicleId: id,
      plateType: body.plateType,
      commercialPermitNumber: body.commercialPermitNumber,
      permitType: body.permitType,
      permitExpiryDate: body.permitExpiryDate,
    });
  }

  @Put(':id/pricing')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  setPricing(
    @Param('id') id: string,
    @Body() body: any,
  ): Observable<any> {
    return this.searchAndCatalogService.setPricing({
      vehicleId: id,
      perKmOutstation: body.perKmOutstation,
      perHourLocal: body.perHourLocal,
      minimumBookingHours: body.minimumBookingHours,
      nightChargePercentage: body.nightChargePercentage,
      eventPackage: body.eventPackage,
    });
  }

  @Get(':id/pricing')
  getPricing(
    @Param('id') id: string,
  ): Observable<any> {
    return this.searchAndCatalogService.getPricing({ vehicleId: id });
  }
}
