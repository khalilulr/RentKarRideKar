import { Injectable, BadRequestException, NotFoundException, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

import { Cart } from './entities/cart.entity';
import { CartItem } from './entities/cart-item.entity';
import { PricingService } from '../pricing/pricing.service';
import {
  SearchAndCatalogServiceClient,
  SEARCH_AND_CATALOG_SERVICE_NAME,
} from 'libs/types/search-and-catalog';
import {
  AuthServiceClient,
  AUTH_SERVICE_NAME,
} from 'libs/types/auth-service';

@Injectable()
export class CartService implements OnModuleInit {
  private searchAndCatalogService: SearchAndCatalogServiceClient;
  private authService: AuthServiceClient;

  constructor(
    @InjectRepository(Cart)
    private readonly cartRepository: Repository<Cart>,
    @InjectRepository(CartItem)
    private readonly cartItemRepository: Repository<CartItem>,
    private readonly pricingService: PricingService,
    @Inject('SEARCH_AND_CATALOG_SERVICE') private readonly searchClient: ClientGrpc,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.searchAndCatalogService =
      this.clientGetService<SearchAndCatalogServiceClient>(
        this.searchClient,
        SEARCH_AND_CATALOG_SERVICE_NAME,
      );
    this.authService =
      this.clientGetService<AuthServiceClient>(
        this.authClient,
        AUTH_SERVICE_NAME,
      );
  }

  private clientGetService<T extends object>(client: ClientGrpc, name: string): T {
    try {
      return client.getService<T>(name);
    } catch (e) {
      return {} as T;
    }
  }

  // Haversine formula to check service radius
  private getDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  async getOrCreateCart(passengerId: string): Promise<Cart> {
    let cart = await this.cartRepository.findOne({
      where: { passengerId },
      relations: ['items'],
    });
    if (!cart) {
      cart = this.cartRepository.create({ passengerId, items: [] });
      await this.cartRepository.save(cart);
    }
    return cart;
  }

  async addToCart(passengerId: string, body: any) {
    const {
      vehicleId,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropAddress,
      dropLat,
      dropLng,
      pickupDatetime,
      tripType,
      returnDatetime,
      totalDays,
    } = body;

    // 1. Fetch vehicle from catalog microservice
    let vehicleResponse;
    try {
      vehicleResponse = await lastValueFrom(
        this.searchAndCatalogService.getVehicleById({ id: vehicleId }),
      );
    } catch (e) {
      throw new BadRequestException({
        error: 'VEHICLE_NOT_FOUND',
        message: 'Vehicle not found.',
      });
    }

    const vehicle = vehicleResponse?.vehicle;
    if (!vehicle || vehicle.status !== 'ACTIVE') {
      throw new BadRequestException({
        error: 'VEHICLE_UNAVAILABLE',
        message: 'This vehicle is not currently active or available.',
      });
    }

    // 2. Check if operates in the area
    const distance = this.getDistanceInKm(
      pickupLat,
      pickupLng,
      vehicle.homeLat,
      vehicle.homeLng,
    );
    const serviceRadius = vehicle.serviceRadius || 10;
    if (distance > serviceRadius) {
      const area = pickupAddress.split(',')[0].trim();
      throw new BadRequestException({
        error: 'OUT_OF_SERVICE_AREA',
        message: `This vehicle does not operate in ${area}.`,
      });
    }

    // 3. Check if already in cart
    const cart = await this.getOrCreateCart(passengerId);
    const alreadyInCart = cart.items.some((item) => item.vehicleId === vehicleId);
    if (alreadyInCart) {
      throw new BadRequestException({
        error: 'ALREADY_IN_CART',
        message: 'This vehicle is already in your cart.',
      });
    }

    // 4. Double check date availability (gRPC call)
    let isAvailableRes;
    try {
      const start = new Date(pickupDatetime).toISOString().split('T')[0];
      const end = returnDatetime
        ? new Date(returnDatetime).toISOString().split('T')[0]
        : start;
      isAvailableRes = await lastValueFrom(
        this.searchAndCatalogService.isVehicleAvailable({
          vehicleId,
          startDate: start,
          endDate: end,
        }),
      );
    } catch (e) {
      isAvailableRes = { isAvailable: true };
    }

    if (isAvailableRes && !isAvailableRes.isAvailable) {
      throw new BadRequestException({
        error: 'VEHICLE_UNAVAILABLE',
        message: 'This vehicle is already booked for these dates. Try another date or vehicle.',
      });
    }

    // 5. Calculate and lock pricing
    const pricing = this.pricingService.calculatePricing(totalDays || 1);
    const cartExpiryDurationMs = this.pricingService.getCartExpiryDurationMs();

    const expiresAt = new Date(Date.now() + cartExpiryDurationMs);

    const cartItem = this.cartItemRepository.create({
      cart,
      vehicleId,
      pickupAddress,
      pickupLat,
      pickupLng,
      dropAddress,
      dropLat,
      dropLng,
      pickupDatetime: new Date(pickupDatetime),
      tripType,
      returnDatetime: returnDatetime ? new Date(returnDatetime) : undefined,
      totalDays: totalDays || 1,
      expiresAt,
      // Lock exact prices
      lockedBaseFare: pricing.breakdown.baseFare,
      lockedDriverFees: pricing.breakdown.driverFees,
      lockedTotalPrice: pricing.total,
      priceLockedAt: new Date(),
    });

    await this.cartItemRepository.save(cartItem);

    let ownerName = 'Rajesh Kumar';
    let ownerRating = 4.6;
    try {
      const ownerRes = await lastValueFrom(
        this.authService.getMe({ userId: vehicle.ownerId }),
      );
      if (ownerRes?.user) {
        ownerName = ownerRes.user.name || ownerName;
      }
    } catch (e) {}

    return {
      cartItemId: cartItem.id,
      vehicle: {
        id: vehicle.id,
        make: vehicle.make,
        model: vehicle.model,
        variant: vehicle.variant || 'VXI',
        color: vehicle.color,
        registrationNumber: vehicle.registrationNumber,
        seatingCapacity: vehicle.seatingCapacity,
        hasAC: vehicle.hasAC,
        rating: 4.8,
        totalTrips: 23,
        photos: vehicle.vehiclePhotos || [],
      },
      owner: {
        id: vehicle.ownerId,
        name: ownerName,
        rating: ownerRating,
      },
      pricing: {
        total: pricing.total,
        breakdown: pricing.breakdown,
        advanceRequired: pricing.advanceRequired,
      },
      pickupDatetime: cartItem.pickupDatetime.toISOString(),
      tripType: cartItem.tripType,
      expiresAt: cartItem.expiresAt.toISOString(),
    };
  }

  async viewCart(passengerId: string) {
    const cart = await this.getOrCreateCart(passengerId);
    const items:any = [];
    let totalAmount = 0;
    let totalAdvance = 0;

    for (const item of cart.items) {
      let vehicle;
      try {
        const vehicleRes = await lastValueFrom(
          this.searchAndCatalogService.getVehicleById({ id: item.vehicleId }),
        );
        vehicle = vehicleRes?.vehicle;
      } catch (e) {}

      let ownerName = 'Rajesh Kumar';
      let ownerRating = 4.6;
      if (vehicle) {
        try {
          const ownerRes = await lastValueFrom(
            this.authService.getMe({ userId: vehicle.ownerId }),
          );
          if (ownerRes?.user) {
            ownerName = ownerRes.user.name || ownerName;
          }
        } catch (e) {}
      }

      // Read directly from the locked cart prices snapshot
      const price = Number(item.lockedTotalPrice);
      const advanceRequired = Math.round(price * 0.25);
      totalAmount += price;
      totalAdvance += advanceRequired;

      const pickupArea = item.pickupAddress.split(',')[0].trim();
      const dropArea = item.dropAddress.split(',')[0].trim();

      items.push({
        cartItemId: item.id,
        vehicle: {
          id: item.vehicleId,
          make: vehicle?.make || 'Maruti Suzuki',
          model: vehicle?.model || 'Ertiga',
          color: vehicle?.color || 'WHITE',
          seatingCapacity: vehicle?.seatingCapacity || 'SIX_SEVEN',
          rating: 4.8,
          photos: vehicle?.vehiclePhotos || [],
        },
        owner: {
          name: ownerName,
          rating: ownerRating,
        },
        pickupDatetime: item.pickupDatetime.toISOString(),
        route: `${pickupArea} → ${dropArea}`,
        tripType: item.tripType,
        price,
        expiresAt: item.expiresAt.toISOString(),
      });
    }

    const minExpiresAt = cart.items.length > 0
      ? new Date(Math.min(...cart.items.map((i) => i.expiresAt.getTime())))
      : new Date();

    return {
      cartId: cart.id,
      items,
      summary: {
        totalVehicles: items.length,
        totalAmount,
        totalAdvance,
      },
      expiresAt: minExpiresAt.toISOString(),
    };
  }

  async removeCartItem(passengerId: string, cartItemId: string) {
    const cart = await this.getOrCreateCart(passengerId);
    const item = await this.cartItemRepository.findOne({
      where: { id: cartItemId, cartId: cart.id },
    });
    if (!item) {
      throw new NotFoundException({
        error: 'CART_ITEM_NOT_FOUND',
        message: 'This item is not in your cart.',
      });
    }

    await this.cartItemRepository.remove(item);

    const updated = await this.viewCart(passengerId);
    return {
      message: 'Vehicle removed from cart',
      cartItemId,
      updatedCart: updated.summary,
    };
  }

  async clearCart(passengerId: string) {
    const cart = await this.getOrCreateCart(passengerId);
    const count = cart.items.length;
    if (count > 0) {
      await this.cartItemRepository.remove(cart.items);
    }
    return {
      message: 'Cart cleared',
      removedItems: count,
    };
  }
}
