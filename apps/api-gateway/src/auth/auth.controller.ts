import { Controller, Post, Body, Get, Put, Patch, Delete, Inject, OnModuleInit, Req, Res, UnauthorizedException, BadRequestException, UseGuards, UseInterceptors, UploadedFile, InternalServerErrorException, Param, Query } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { map, Observable, from, forkJoin } from 'rxjs';
import { mergeMap, catchError, switchMap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { VehicleOwnerGuard } from './guards/vehicle_owner.guard';
import { AdminGuard } from './guards/admin.guard';
import { CurrentUser } from './decorators/current-user.decorator';

// IMPORTANT: Use regular imports for Request objects to avoid metadata errors
import type {
  SendOtpRequest,
  VerifyOtpRequest,
  LogoutRequest,
  UpdateMeRequest,
  SwitchPerspectiveRequest,
  LoginAdminRequest,
  CreateDemoAdminRequest,
} from '../../../../libs/types/auth-service';

// Use type imports for the interfaces/responses
import type {
  AuthServiceController,
  MessageResponse,
  AuthResponse,
  GetMeResponse,
  UpdateMeResponse,
} from '../../../../libs/types/auth-service';

@Controller()
export class AuthController implements OnModuleInit {
  private authService: any;
  private verificationService: any;
  private searchAndCatalogService: any;
  private referralPrice = 500;

  constructor(
    @Inject('AUTH_SERVICE') private readonly client: ClientGrpc,
    @Inject('VERIFICATION_SERVICE') private readonly verificationClient: ClientGrpc,
    @Inject('SEARCH_AND_CATALOG_SERVICE') private readonly searchClient: ClientGrpc,
    private readonly jwtService: JwtService,
    private readonly cloudinaryService: CloudinaryService,
  ) { }

  onModuleInit() {
    this.authService = this.client.getService<any>('AuthService');
    this.verificationService = this.verificationClient.getService<any>('VerificationService');
    this.searchAndCatalogService = this.searchClient.getService<any>('SearchAndCatalogService');
  }

  @Post('auth/send-otp')
  sendOtp(@Body() body: SendOtpRequest): Observable<MessageResponse> {
    return this.authService.sendOtp(body) as unknown as Observable<MessageResponse>;
  }

  @Post('auth/verify-otp')
  verifyOtp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: VerifyOtpRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.mobile || !body.otp) {
      throw new BadRequestException('Request body with mobile and otp is required');
    }

    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.verifyOtp(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        // 1. Set the refresh token in an HTTP-only cookie
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true, // Prevents client-side JS from reading the cookie (XSS protection)
          secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
          sameSite: 'strict', // CSRF protection
          maxAge: 7 * 24 * 60 * 60 * 1000, // e.g., 7 days in milliseconds
        });

        // 2. Strip the refreshToken and transform enums in user object
        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('auth/admin/login')
  loginAdmin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginAdminRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.email || !body.password) {
      throw new BadRequestException('Request body with email and password is required');
    }
    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.loginAdmin(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('auth/admin/demo')
  createDemoAdmin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: CreateDemoAdminRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.email || !body.password) {
      throw new BadRequestException('Request body with email and password is required');
    }
    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.createDemoAdmin(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('auth/refresh-token')
  refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {

    // Extract token from cookies
    const tokenFromCookie = req.cookies['refreshToken'];

    if (!tokenFromCookie) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }

    // Verify refresh token signature at Gateway (Single Source of Truth)
    try {
      const payload = this.jwtService.verify(tokenFromCookie);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type in cookie');
      }
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const grpcRequest = {
      refreshToken: tokenFromCookie,
      ipAddress,
      userAgent,
    };

    return (this.authService.refreshToken(grpcRequest) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        // Update the cookie with the newly generated refresh token
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Return only the user and new access token, with transformed enums
        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('auth/logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Observable<MessageResponse> {
    const tokenFromCookie = req.cookies?.['refreshToken'];

    if (!tokenFromCookie) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const logoutRequest: LogoutRequest = {
      userId: user.userId,
      jti: user.id,
      tokenExp: Number(user.exp),
      refreshToken: tokenFromCookie,
    };

    return (this.authService.logout(logoutRequest) as Observable<MessageResponse>).pipe(
      map((response) => {
        // Clear the refresh token cookie
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });

        return response;
      })
    );
  }

  @Post('auth/logout-all-devices')
  @UseGuards(JwtAuthGuard)
  logoutAllDevices(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response
  ): Observable<MessageResponse> {
    const logoutAllRequest = {
      userId: user.userId,
    };

    return (this.authService.logoutAllDevices(logoutAllRequest) as Observable<MessageResponse>).pipe(
      map((response) => {
        // Clear the refresh token cookie for this current device
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });

        return response;
      })
    );
  }

  @Get('auth/me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any): Observable<GetMeResponse> {
    return (this.authService.getMe({ userId: user.userId }) as Observable<GetMeResponse>).pipe(
      map(res => ({ ...res, user: this.mapUserResponse(res.user) }))
    );
  }


  @Put('auth/me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('profilePicture'))
  updateMe(
    @CurrentUser() user: any,
    @Body() body: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Observable<UpdateMeResponse> {
    const grpcRequest: UpdateMeRequest = { userId: user.userId };
    if (body.name !== undefined) {
      grpcRequest.name = body.name;
    }
    if (body.roles?.length) {
      grpcRequest.roles = body.roles
        .map((r: string) => String(r).toUpperCase());
    }
    if (body.activePerspective !== undefined) {
      grpcRequest.activePerspective = String(body.activePerspective).toUpperCase();
    }
    if (body.bankAccountNumber !== undefined) {
      grpcRequest.bankAccountNumber = body.bankAccountNumber;
    }
    if (body.bankAccountHolderName !== undefined) {
      grpcRequest.bankAccountHolderName = body.bankAccountHolderName;
    }
    if (body.bankName !== undefined) {
      grpcRequest.bankName = body.bankName;
    }
    if (body.bankIfscCode !== undefined) {
      grpcRequest.bankIfscCode = body.bankIfscCode;
    }

    const performUpdate = (profileUrl?: string) => {
      if (profileUrl) {
        grpcRequest.profileImage = profileUrl;
      } else if (body.profileImage !== undefined) {
        grpcRequest.profileImage = body.profileImage;
      } else if (body.profilePicture !== undefined) {
        grpcRequest.profileImage = body.profilePicture;
      }

      let update$ = (this.authService.updateMe(grpcRequest) as Observable<UpdateMeResponse>).pipe(
        map(res => ({ ...res, user: this.mapUserResponse(res.user) })),
        catchError((err) => {
          console.error('[AuthController] Error calling updateMe microservice:', err);
          throw new InternalServerErrorException(err.message || 'Error updating profile');
        }),
      );

      if (body.kycStatus === 'APPROVED' || body.kycStatus === 'VERIFIED') {
        update$ = update$.pipe(
          switchMap((res) => {
            return (this.verificationService.getVerificationStatus({
              userId: user.userId,
              role: 'VEHICLE_OWNER',
            }) as Observable<any>).pipe(
              switchMap((statusRes) => {
                if (statusRes && statusRes.verificationId) {
                  return (this.verificationService.approveVerification({
                    verificationId: statusRes.verificationId,
                    adminUserId: user.userId,
                  }) as Observable<any>).pipe(
                    map(() => {
                      if (res.user) {
                        res.user.kycStatus = 'VERIFIED';
                      }
                      return res;
                    }),
                    catchError((err) => {
                      console.error('[AuthController] Error auto-approving verification:', err);
                      return [res];
                    })
                  );
                }
                return [res];
              }),
              catchError((err) => {
                console.error('[AuthController] Error fetching status for auto-approval:', err);
                return [res];
              })
            );
          })
        );
      }

      return update$;
    };

    if (file) {
      return from(this.cloudinaryService.uploadFile(file)).pipe(
        mergeMap((url) => performUpdate(url)),
        catchError((err) => {
          console.error('[AuthController] Error in upload/pipeline:', err);
          throw new InternalServerErrorException(err.message || 'Error uploading file to Cloudinary');
        }),
      );
    }

    return performUpdate();
  }


  @Put('auth/switch-perspective')
  @UseGuards(JwtAuthGuard)
  switchPerspective(
    @CurrentUser() user: any,
    @Body() body: any
  ): Observable<UpdateMeResponse> {
    const perspective = body.perspective ?? body.activePerspective;
    if (!perspective) {
      throw new BadRequestException('perspective is required');
    }

    const grpcRequest: SwitchPerspectiveRequest = {
      userId: user.userId,
      perspective: String(perspective).toUpperCase(),
    };

    return (this.authService.switchPerspective(grpcRequest) as Observable<UpdateMeResponse>).pipe(
      map(res => ({ ...res, user: this.mapUserResponse(res.user) }))
    );
  }

  @Post('rides/search')
  @UseGuards(JwtAuthGuard)
  searchRides(@Body() body: any): Observable<any> {
    return this.searchAndCatalogService.searchVehicles({
      from: (body.fromLat && body.fromLng) ? `${body.fromLat},${body.fromLng}` : '',
      to: (body.toLat && body.toLng) ? `${body.toLat},${body.toLng}` : '',
      date: body.date ?? '',
      time: body.time ?? '',
      vehicleType: body.vehicleType ?? '',
      seats: body.seats ? parseInt(body.seats, 10) : 0,
      color: body.color ?? '',
      ac: body.ac !== undefined ? (String(body.ac) === 'true' || body.ac === true) : undefined,
    });
  }

  @Get('auth/drivers/search')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  searchDriver(@Query('query') query: string): Observable<any> {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }
    return (this.authService.searchDriver({ query }) as Observable<any>).pipe(
      map(res => {
        if (res.drivers) {
          res.drivers = res.drivers.map(d => this.mapUserResponse(d));
        }
        return res;
      })
    );
  }

  @Post('auth/drivers/trusted/invite')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  inviteDriver(
    @CurrentUser() user: any,
    @Body('driverId') driverId: string,
  ): Observable<any> {
    if (!driverId) {
      throw new BadRequestException('driverId is required');
    }
    return this.authService.inviteDriver({ ownerId: user.userId, driverId }) as Observable<any>;
  }

  @Get('auth/drivers/trusted/invitations')
  @UseGuards(JwtAuthGuard)
  listInvitations(
    @CurrentUser() user: any,
    @Query('type') type?: string,
  ): Observable<any> {
    const requestType = type === 'received' ? 'received' : 'sent';
    return (this.authService.listInvitations({ userId: user.userId, type: requestType }) as Observable<any>).pipe(
      map(res => {
        if (res.invitations) {
          res.invitations = res.invitations.map(inv => {
            if (inv.targetUser) {
              inv.targetUser = this.mapUserResponse(inv.targetUser);
            }
            return inv;
          });
        }
        return res;
      })
    );
  }

  @Patch('auth/drivers/trusted/invitations/:id')
  @UseGuards(JwtAuthGuard)
  respondToInvitation(
    @CurrentUser() user: any,
    @Param('id') invitationId: string,
    @Body('status') status: string,
  ): Observable<any> {
    if (!status || (status !== 'ACCEPTED' && status !== 'REJECTED')) {
      throw new BadRequestException('status must be ACCEPTED or REJECTED');
    }
    return this.authService.respondToInvitation({
      driverId: user.userId,
      invitationId,
      status,
    }) as Observable<any>;
  }

  @Get('drivers/trusted/my')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  getMyTrustedDrivers(@CurrentUser() user: any): Observable<any> {
    return this.authService.getMyTrustedDrivers({ ownerId: user.userId });
  }

  @Delete('drivers/trusted/:id')
  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  removeTrustedDriver(
    @CurrentUser() user: any,
    @Param('id') driverId: string,
  ): Observable<any> {
    return this.authService.removeTrustedDriver({ ownerId: user.userId, driverId });
  }

  @Post('me/addresses')
  @UseGuards(JwtAuthGuard)
  saveAddress(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.saveAddress({
      userId: user.userId,
      label: body.label,
      type: body.type,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
    });
  }

  @Post('user/locations')
  @UseGuards(JwtAuthGuard)
  addSavedLocation(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.saveAddress({
      userId: user.userId,
      label: body.label,
      type: body.type || 'OTHER',
      address: body.address,
      lat: body.lat,
      lng: body.lng,
    });
  }

  @Get('me/addresses')
  @UseGuards(JwtAuthGuard)
  getAddresses(@CurrentUser() user: any): Observable<any> {
    return this.authService.getAddresses({ userId: user.userId });
  }

  @Get('user/locations')
  @UseGuards(JwtAuthGuard)
  getSavedLocations(@CurrentUser() user: any): Observable<any> {
    return this.authService.getAddresses({ userId: user.userId });
  }

  @Put('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  updateAddress(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.updateAddress({
      userId: user.userId,
      addressId,
      label: body.label,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
    });
  }

  @Put('user/locations/:id')
  @UseGuards(JwtAuthGuard)
  updateSavedLocation(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.updateAddress({
      userId: user.userId,
      addressId,
      label: body.label,
      address: body.address,
      lat: body.lat,
      lng: body.lng,
    });
  }

  @Delete('me/addresses/:id')
  @UseGuards(JwtAuthGuard)
  deleteAddress(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Observable<any> {
    return this.authService.deleteAddress({ userId: user.userId, addressId });
  }

  @Delete('user/locations/:id')
  @UseGuards(JwtAuthGuard)
  deleteSavedLocation(
    @CurrentUser() user: any,
    @Param('id') addressId: string,
  ): Observable<any> {
    return this.authService.deleteAddress({ userId: user.userId, addressId });
  }

  @Post('me/device-token')
  @UseGuards(JwtAuthGuard)
  registerDeviceToken(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.registerDeviceToken({
      userId: user.userId,
      token: body.token,
      platform: body.platform,
    });
  }

  @Delete('me/device-token')
  @UseGuards(JwtAuthGuard)
  removeDeviceToken(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.removeDeviceToken({
      userId: user.userId,
      token: body.token,
    });
  }

  @Get('referrals/me')
  @UseGuards(JwtAuthGuard)
  getReferrals(@CurrentUser() user: any): Observable<any> {
    return (this.authService.getReferrals({ userId: user.userId }) as Observable<any>).pipe(
      map((res: any) => {
        if (res.earningsJson) {
          try {
            res.earnings = JSON.parse(res.earningsJson);
            delete res.earningsJson;
          } catch (e) {}
        }
        if (res.referralHistoryJson) {
          try {
            res.referralHistory = JSON.parse(res.referralHistoryJson);
            delete res.referralHistoryJson;
          } catch (e) {}
        }
        return res;
      })
    );
  }

  @Get('user/referral')
  @UseGuards(JwtAuthGuard)
  getReferralCode(@CurrentUser() user: any): Observable<any> {
    return (this.authService.getReferrals({ userId: user.userId }) as Observable<any>).pipe(
      map((res: any) => {
        if (res.earningsJson) {
          try {
            res.earnings = JSON.parse(res.earningsJson);
            delete res.earningsJson;
          } catch (e) {}
        }
        if (res.referralHistoryJson) {
          try {
            res.referralHistory = JSON.parse(res.referralHistoryJson);
            delete res.referralHistoryJson;
          } catch (e) {}
        }
        return res;
      })
    );
  }

  @Get('refer-price')
  getReferralPrice() {
    return { amount: this.referralPrice };
  }

  @Post('refer-price')
  @UseGuards(JwtAuthGuard, AdminGuard)
  addReferralPrice(@Body() body: { amount: number }) {
    const amount = body.amount;
    if (amount === undefined || isNaN(Number(amount))) {
      throw new BadRequestException('amount is required and must be a number');
    }
    this.referralPrice = Number(amount);
    return { success: true, amount: this.referralPrice };
  }

  @Post('referrals/apply')
  @UseGuards(JwtAuthGuard)
  applyReferral(
    @CurrentUser() user: any,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.applyReferral({
      userId: user.userId,
      referralCode: body.referralCode,
    });
  }

  @Get('me/wallet')
  @UseGuards(JwtAuthGuard)
  getWallet(@CurrentUser() user: any): Observable<any> {
    return (this.authService.getWallet({ userId: user.userId }) as Observable<any>).pipe(
      map((res: any) => {
        if (res.transactionsJson) {
          try {
            res.transactions = JSON.parse(res.transactionsJson);
            delete res.transactionsJson;
          } catch (e) {}
        }
        return res;
      })
    );
  }

  @Get('admin/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminGetUsers(
    @Query('role') role?: string,
    @Query('kycStatus') kycStatus?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Observable<any> {
    return this.authService.adminGetUsers({
      role: role || '',
      kycStatus: kycStatus || '',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    }).pipe(
      map((res: any) => {
        if (res.users) {
          res.users = res.users.map(u => this.mapUserResponse(u));
        }
        return res;
      })
    );
  }

  @Patch('admin/users/:id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminUpdateUserStatus(
    @Param('id') userId: string,
    @Body() body: any,
  ): Observable<any> {
    return this.authService.adminUpdateUserStatus({
      userId,
      action: body.action,
      reason: body.reason,
    });
  }

  @Get('owner/onboarding-status')
  @UseGuards(JwtAuthGuard)
  getOwnerOnboardingStatus(@CurrentUser() user: any): Observable<any> {
    const userId = user.userId;

    const auth$ = (this.authService.getMe({ userId }) as unknown as Observable<any>).pipe(
      map(res => {
        const u = res?.user;
        return {
          bankAccountNumber: u?.bankAccountNumber || '',
          bankAccountHolderName: u?.bankAccountHolderName || '',
          bankName: u?.bankName || '',
          bankIfscCode: u?.bankIfscCode || '',
        };
      }),
      catchError(err => {
        console.error('[AuthController] Error fetching owner profile for onboarding:', err);
        return [{ bankAccountNumber: '', bankAccountHolderName: '', bankName: '', bankIfscCode: '' }];
      })
    );

    const kyc$ = (this.verificationService.getVerificationStatus({
      userId,
      role: 'VEHICLE_OWNER',
    }) as unknown as Observable<any>).pipe(
      catchError(err => {
        console.error('[AuthController] Error fetching owner KYC for onboarding:', err);
        return [{ status: 'NONE', documents: [], missingDocs: [] }];
      })
    );

    const vehicles$ = (this.searchAndCatalogService.getMyVehicles({ ownerId: userId }) as unknown as Observable<any>).pipe(
      switchMap((vehiclesRes: any) => {
        const vehicles = vehiclesRes?.vehicles || [];
        if (vehicles.length === 0) {
          return from([[]]);
        }
        const vehicleStatusObservables = vehicles.map((v: any) =>
          (this.verificationService.getVehicleVerificationStatus({
            vehicleId: v.id,
            role: 'VEHICLE_OWNER',
          }) as unknown as Observable<any>).pipe(
            map((statusRes: any) => ({
              ...v,
              verification: statusRes,
            })),
            catchError(err => {
              console.error(`[AuthController] Error fetching verification status for vehicle ${v.id}:`, err);
              return [{
                ...v,
                verification: { status: 'NONE', documents: [], missingDocs: [] }
              }];
            })
          )
        );
        return forkJoin(vehicleStatusObservables);
      }),
      catchError(err => {
        console.error('[AuthController] Error fetching owner vehicles for onboarding:', err);
        return [[]];
      })
    );

    return forkJoin({
      bankDetails: auth$,
      userKyc: kyc$,
      vehicles: vehicles$,
    }).pipe(
      map(({ bankDetails, userKyc, vehicles }: any) => {
        const kycStatusString = (userKyc?.status || 'NOT_SUBMITTED').toUpperCase();
        const kycVerified = kycStatusString === 'APPROVED' || kycStatusString === 'VERIFIED';
        const hasVehicle = vehicles.length > 0;
        const docsVerified = hasVehicle && vehicles.every((v: any) => {
          const vKyc = (v.verification?.status || '').toUpperCase();
          return vKyc === 'APPROVED' || vKyc === 'VERIFIED';
        });
        const bankAdded = !!bankDetails.bankAccountNumber;

        return {
          kyc: {
            status: kycStatusString,
            verified: kycVerified,
          },
          vehicle: {
            registered: hasVehicle,
            count: vehicles.length,
          },
          docs: {
            status: hasVehicle ? (docsVerified ? 'APPROVED' : 'PENDING') : 'NOT_SUBMITTED',
            verified: docsVerified,
          },
          bank: {
            added: bankAdded,
            details: bankAdded ? {
              bankName: bankDetails.bankName,
              accountLast4: bankDetails.bankAccountNumber.slice(-4),
            } : null,
          },
          ready: kycVerified && hasVehicle && docsVerified && bankAdded,
        };
      })
    );
  }

  /**
   * Transforms numeric gRPC enums back to strings for the REST client.
   */
  private mapUserResponse(user: any) {
    if (!user) return user;

    const roleMapping = {
      0: 'PASSENGER',
      1: 'DRIVER',
      2: 'ADMIN',
      3: 'VEHICLE_OWNER',
    };

    const kycMapping = {
      0: 'PENDING',
      1: 'APPROVED',
      2: 'REJECTED',
    };

    if (user.roles) {
      user.roles = user.roles.map(r => typeof r === 'number' ? roleMapping[r] : r);
    }

    if (typeof user.activePerspective === 'number') {
      user.activePerspective = roleMapping[user.activePerspective];
    }

    if (typeof user.kycStatus === 'number') {
      user.kycStatus = kycMapping[user.kycStatus];
    }

    return user;
  }

}


