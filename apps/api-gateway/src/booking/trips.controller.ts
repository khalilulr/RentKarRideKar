import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Inject,
  OnModuleInit,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  Logger,
  Body,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  BookingServiceClient,
  BOOKING_SERVICE_NAME,
} from '../../../../libs/types/booking';
import { TripsGateway } from './trips.gateway';
import axios from 'axios';

@Controller()
export class TripsController implements OnModuleInit {
  private readonly logger = new Logger(TripsController.name);
  private bookingService: BookingServiceClient;

  // In-memory cache maps
  private readonly routeCache = new Map<
    string,
    { data: any; expiry: number }
  >();
  private readonly geocodeCache = new Map<
    string,
    { data: any; expiry: number }
  >();
  private readonly placeCache = new Map<
    string,
    { data: any; expiry: number }
  >();

  constructor(
    @Inject('BOOKING_SERVICE') private readonly client: ClientGrpc,
    private readonly tripsGateway: TripsGateway,
  ) {}

  onModuleInit() {
    this.bookingService =
      this.client.getService<BookingServiceClient>(BOOKING_SERVICE_NAME);
  }

  // Helper to fetch Google Maps API Key
  private getApiKey(): string {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      this.logger.error(
        'CRITICAL ERROR: GOOGLE_MAPS_API_KEY environment variable is not defined!',
      );
      throw new Error(
        'GOOGLE_MAPS_API_KEY is missing. Accessing Google Maps services is disabled.',
      );
    }
    return apiKey;
  }

  // Helper to construct simulated straight-line routing coordinates when Google API is not reachable
  private getSimulatedRoute(
    oLat: number,
    oLng: number,
    dLat: number,
    dLng: number,
  ) {
    const distanceRad = Math.acos(
      Math.sin((oLat * Math.PI) / 180) * Math.sin((dLat * Math.PI) / 180) +
        Math.cos((oLat * Math.PI) / 180) *
          Math.cos((dLat * Math.PI) / 180) *
          Math.cos(((dLng - oLng) * Math.PI) / 180),
    );
    const distanceKm = Math.round(distanceRad * 6371 * 100) / 100;
    const etaMinutes = Math.round(distanceKm * 2); // Assume 30 km/h average speed in city
    return {
      polyline: '_p~iF~ps|U_ulLnnqC_ulLnnqC',
      etaMinutes: Math.max(1, etaMinutes),
      distanceKm: Math.max(0.1, distanceKm),
    };
  }

  @Get('trips/:id/route-to-pickup')
  @UseGuards(JwtAuthGuard)
  async getRouteToPickup(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    if (!lat || !lng) {
      throw new BadRequestException(
        'Driver location lat and lng are required.',
      );
    }

    const driverLat = parseFloat(lat);
    const driverLng = parseFloat(lng);

    // Load trip by ID
    let trip: any;
    try {
      trip = await firstValueFrom(this.bookingService.getOrderVehicle({ id }));
    } catch (err: any) {
      this.logger.error(`Failed to fetch trip ${id}: ${err.message}`);
      throw new BadRequestException('Invalid trip ID or trip not found.');
    }

    // Validate that the requesting user is the assigned driver
    if (trip.assignedDriverId !== user.userId) {
      throw new ForbiddenException(
        'You are not the driver assigned to this trip.',
      );
    }

    // Check Cache
    const roundedLat = driverLat.toFixed(4);
    const roundedLng = driverLng.toFixed(4);
    const cacheKey = `route_${id}_${roundedLat}_${roundedLng}`;
    const now = Date.now();
    const cached = this.routeCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      this.logger.log(`Serving route-to-pickup from cache: ${cacheKey}`);
      return cached.data;
    }

    const pickupLat = trip.pickupLat;
    const pickupLng = trip.pickupLng;

    const apiKey = this.getApiKey();
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${driverLat},${driverLng}&destination=${pickupLat},${pickupLng}&key=${apiKey}`;

    let responseData: any;
    try {
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data?.status === 'OK' && res.data.routes?.length > 0) {
        const route = res.data.routes[0];
        const leg = route.legs[0];
        responseData = {
          polyline: route.overview_polyline.points,
          etaMinutes: Math.round(leg.duration.value / 60),
          distanceKm: parseFloat((leg.distance.value / 1000).toFixed(2)),
        };
      } else {
        this.logger.warn(
          `Google Directions returned non-OK status: ${res.data?.status}. Using simulated fallback.`,
        );
        responseData = this.getSimulatedRoute(
          driverLat,
          driverLng,
          pickupLat,
          pickupLng,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error contacting Google Directions API: ${err.message}. Using simulated fallback.`,
      );
      responseData = this.getSimulatedRoute(
        driverLat,
        driverLng,
        pickupLat,
        pickupLng,
      );
    }

    // Cache briefly for 30s
    this.routeCache.set(cacheKey, { data: responseData, expiry: now + 30000 });
    return responseData;
  }

  @Post('trips/:id/start')
  @UseGuards(JwtAuthGuard)
  async startTrip(@CurrentUser() user: any, @Param('id') id: string) {
    // 1. Call startTrip on the booking microservice
    let result: any;
    try {
      result = await firstValueFrom(
        this.bookingService.startTrip({
          orderVehicleId: id,
          driverId: user.userId,
        }),
      );
    } catch (err: any) {
      this.logger.error(`Start trip failed for ID ${id}: ${err.message}`);
      throw new BadRequestException(err.message || 'Failed to start trip.');
    }

    if (!result.success) {
      throw new BadRequestException(result.message || 'Failed to start trip.');
    }

    // 2. Call Google Directions: pickup to destination (drop)
    const pickupLat = result.pickupLat;
    const pickupLng = result.pickupLng;
    const dropLat = result.dropLat;
    const dropLng = result.dropLng;

    const apiKey = this.getApiKey();
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${pickupLat},${pickupLng}&destination=${dropLat},${dropLng}&key=${apiKey}`;

    let polyline = '_p~iF~ps|U_ulLnnqC_ulLnnqC';
    let etaMinutes = 15;

    try {
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data?.status === 'OK' && res.data.routes?.length > 0) {
        const route = res.data.routes[0];
        const leg = route.legs[0];
        polyline = route.overview_polyline.points;
        etaMinutes = Math.round(leg.duration.value / 60);
      } else {
        this.logger.warn(
          `Google Directions start trip returned non-OK status: ${res.data?.status}. Using simulated values.`,
        );
        const simulated = this.getSimulatedRoute(
          pickupLat,
          pickupLng,
          dropLat,
          dropLng,
        );
        polyline = simulated.polyline;
        etaMinutes = simulated.etaMinutes;
      }
    } catch (err: any) {
      this.logger.error(
        `Error contacting Google Directions for start trip: ${err.message}. Using simulated values.`,
      );
      const simulated = this.getSimulatedRoute(
        pickupLat,
        pickupLng,
        dropLat,
        dropLng,
      );
      polyline = simulated.polyline;
      etaMinutes = simulated.etaMinutes;
    }

    // 3. Broadcast TRIP_STARTED to WebSocket channel
    this.tripsGateway.broadcastTripStarted(
      id,
      result.orderId,
      polyline,
      etaMinutes,
    );

    return {
      status: 'IN_PROGRESS',
      polyline,
      etaMinutes,
    };
  }

  @Post('trips/:id/location')
  @UseGuards(JwtAuthGuard)
  async postTripLocation(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { lat: number; lng: number },
  ) {
    if (body.lat === undefined || body.lng === undefined) {
      throw new BadRequestException('lat and lng fields are required in body.');
    }

    // Load trip by ID to validate driver assignment and get orderId
    let trip: any;
    try {
      trip = await firstValueFrom(this.bookingService.getOrderVehicle({ id }));
    } catch (err: any) {
      this.logger.error(`Failed to fetch trip ${id}: ${err.message}`);
      throw new BadRequestException('Invalid trip ID or trip not found.');
    }

    // Validate that the requesting user is the assigned driver
    if (trip.assignedDriverId !== user.userId) {
      throw new ForbiddenException(
        'You are not the driver assigned to this trip.',
      );
    }

    // Broadcast location to WebSocket channel (rider/owner namespaces)
    this.tripsGateway.broadcastDriverLocation(
      id,
      trip.orderId,
      body.lat,
      body.lng,
    );

    return { success: true };
  }

  @Get('geocode/reverse')
  @UseGuards(JwtAuthGuard)
  async reverseGeocode(@Query('lat') lat: string, @Query('lng') lng: string) {
    if (!lat || !lng) {
      throw new BadRequestException(
        'lat and lng query parameters are required.',
      );
    }

    const latVal = parseFloat(lat);
    const lngVal = parseFloat(lng);

    const roundedLat = latVal.toFixed(4);
    const roundedLng = lngVal.toFixed(4);
    const cacheKey = `${roundedLat}_${roundedLng}`;
    const now = Date.now();

    const cached = this.geocodeCache.get(cacheKey);
    if (cached && cached.expiry > now) {
      this.logger.log(`Serving reverse geocode from cache: ${cacheKey}`);
      return cached.data;
    }

    const apiKey = this.getApiKey();
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latVal},${lngVal}&key=${apiKey}`;

    let responseData = {
      formatted_address: 'Jadugoda Main Road, Jharkhand, India',
    };

    try {
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data?.status === 'OK' && res.data.results?.length > 0) {
        responseData = {
          formatted_address: res.data.results[0].formatted_address,
        };
      } else {
        this.logger.warn(
          `Google Geocoding returned non-OK status: ${res.data?.status}. Using simulated fallback.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error contacting Google Geocoding API: ${err.message}. Using simulated fallback.`,
      );
    }

    // Cache indefinitely/for long duration (e.g. 1 hour)
    this.geocodeCache.set(cacheKey, {
      data: responseData,
      expiry: now + 3600000,
    });
    return responseData;
  }

  @Get('places/:placeId')
  @UseGuards(JwtAuthGuard)
  async getPlaceDetails(@Param('placeId') placeId: string) {
    if (!placeId) {
      throw new BadRequestException('placeId parameter is required.');
    }

    const now = Date.now();
    const cached = this.placeCache.get(placeId);
    if (cached && cached.expiry > now) {
      this.logger.log(`Serving place details from cache: ${placeId}`);
      return cached.data;
    }

    const apiKey = this.getApiKey();
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry&key=${apiKey}`;

    let responseData = {
      name: 'Tata Main Hospital',
      formatted_address: 'Jamshedpur, Jharkhand, India',
      lat: 22.8046,
      lng: 86.2029,
    };

    try {
      const res = await axios.get(url, { timeout: 5000 });
      if (res.data?.status === 'OK' && res.data.result) {
        const r = res.data.result;
        responseData = {
          name: r.name,
          formatted_address: r.formatted_address,
          lat: r.geometry?.location?.lat || 22.8046,
          lng: r.geometry?.location?.lng || 86.2029,
        };
      } else {
        this.logger.warn(
          `Google Places returned non-OK status: ${res.data?.status}. Using simulated fallback.`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error contacting Google Places API: ${err.message}. Using simulated fallback.`,
      );
    }

    // Cache place details (e.g. 1 hour)
    this.placeCache.set(placeId, { data: responseData, expiry: now + 3600000 });
    return responseData;
  }
}
