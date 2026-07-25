import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Patch,
  Inject,
  OnModuleInit,
  Req,
  Res,
  UseGuards,
  Query,
  UploadedFile,
  UseInterceptors,
  Param,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable, from, forkJoin } from 'rxjs';
import { mergeMap, catchError, map, switchMap } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { VerificationServiceClient } from '../../../../libs/types/verification';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { AuthServiceController } from '../../../../libs/types/auth-service';
import {
  SearchAndCatalogServiceClient,
  SEARCH_AND_CATALOG_SERVICE_NAME,
} from '../../../../libs/types/search-and-catalog';

@Controller()
export class VerificationController implements OnModuleInit {
  private verificationService: VerificationServiceClient;
  private authService: AuthServiceController;
  private searchAndCatalogService: SearchAndCatalogServiceClient;

  constructor(
    @Inject('VERIFICATION_SERVICE') private readonly client: ClientGrpc,
    @Inject('AUTH_SERVICE') private readonly authClient: ClientGrpc,
    @Inject('SEARCH_AND_CATALOG_SERVICE')
    private readonly searchClient: ClientGrpc,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  onModuleInit() {
    this.verificationService =
      this.client.getService<VerificationServiceClient>('VerificationService');
    this.authService =
      this.authClient.getService<AuthServiceController>('AuthService');
    this.searchAndCatalogService =
      this.searchClient.getService<SearchAndCatalogServiceClient>(
        SEARCH_AND_CATALOG_SERVICE_NAME,
      );
  }

  @Post('kyc/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadDoc(
    @CurrentUser() user: any,
    @Query('role') role: string,
    @Query('documentType') documentType: string,
    @Query('vehicleId') vehicleId: string | undefined, // NEW
    @UploadedFile() file: Express.Multer.File,
  ): Observable<any> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return from(this.cloudinaryService.uploadFile(file)).pipe(
      mergeMap((fileUrl) => {
        return this.verificationService.uploadDoc({
          userId: user.userId,
          role: role.toUpperCase(),
          docType: documentType.toUpperCase(),
          fileUrl,
          vehicleId: vehicleId ?? '', // NEW — empty string if not provided
        });
      }),
      catchError((err) => {
        console.error('[VerificationController] Error uploading KYC doc:', err);
        throw new InternalServerErrorException(
          err.message || 'Error processing document upload',
        );
      }),
    );
  }

  @Post('user/kyc/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadUserKyc(
    @CurrentUser() user: any,
    @Query('documentType') documentType: string,
    @UploadedFile() file: Express.Multer.File,
  ): Observable<any> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return from(this.cloudinaryService.uploadFile(file)).pipe(
      mergeMap((fileUrl) => {
        return this.verificationService.uploadUserKyc({
          userId: user.userId,
          docType: documentType.toUpperCase(),
          fileUrl,
        });
      }),
      catchError((err) => {
        console.error(
          '[VerificationController] Error uploading user KYC doc:',
          err,
        );
        throw new InternalServerErrorException(
          err.message || 'Error processing document upload',
        );
      }),
    );
  }

  @Get('user/kyc/status')
  @UseGuards(JwtAuthGuard)
  getUserKycStatus(@CurrentUser() user: any): Observable<any> {
    return this.verificationService.getUserKycStatus({
      userId: user.userId,
    });
  }

  @Get('kyc/status')
  @UseGuards(JwtAuthGuard)
  getKycStatus(@CurrentUser() user: any): Observable<any> {
    return this.verificationService.getUserKycStatus({
      userId: user.userId,
    });
  }

  @Patch('user/kyc/submit')
  @UseGuards(JwtAuthGuard)
  submitUserKyc(@CurrentUser() user: any): Observable<any> {
    return this.verificationService.submitUserKyc({
      userId: user.userId,
    });
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getVerificationStatus(
    @CurrentUser() user: any,
    @Query('role') role: string,
  ): Observable<any> {
    return this.verificationService.getVerificationStatus({
      userId: user.userId,
      role,
    });
  }

  @Get('kyc/status/:vehicleId')
  @UseGuards(JwtAuthGuard)
  getVehicleVerificationStatus(
    @Param('vehicleId') vehicleId: string,
  ): Observable<any> {
    return this.verificationService.getVehicleVerificationStatus({
      vehicleId,
      role: 'VEHICLE_OWNER',
    });
  }

  @Get('kyc/vehicle/:vehicleId')
  @UseGuards(JwtAuthGuard)
  getVehicleDocs(
    @Param('vehicleId') vehicleId: string,
    @Query('status') status?: string,
  ): Observable<any> {
    return from(
      this.verificationService.getVehicleVerificationStatus({
        vehicleId,
        role: 'VEHICLE_OWNER',
      }),
    ).pipe(
      map((res: any) => {
        if (status && res && res.documents) {
          const queryStatus = status.toUpperCase();
          res.documents = res.documents.filter(
            (doc: any) => doc.status.toUpperCase() === queryStatus,
          );
        }
        return res;
      }),
    );
  }

  @Patch('kyc/submit')
  @UseGuards(JwtAuthGuard)
  submitKyc(
    @CurrentUser() user: any,
    @Body('role') role: string,
  ): Observable<any> {
    return this.verificationService.submitKycDoc({
      userId: user.userId,
      role,
    });
  }

  @Get('kyc/admin/pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  pendingStatusDocs(): Observable<any> {
    return this.verificationService.pendingStatusDocs({});
  }

  @Patch('kyc/admin/documents/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  reviewDocument(
    @Param('id') documentId: string,
    @CurrentUser() admin: any,
    @Body() body: { status: string; rejectionReason?: string },
  ): Observable<any> {
    return this.verificationService.reviewDocument({
      documentId,
      adminUserId: admin.userId,
      status: body.status,
      rejectionReason: body.rejectionReason ? body.rejectionReason : '',
    });
  }

  @Patch('kyc/admin/verifications/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  rejectVerification(
    @Param('id') verificationId: string,
    @CurrentUser() admin: any,
    @Body() body: { rejectionReason: string },
  ): Observable<any> {
    return this.verificationService.rejectVerification({
      verificationId,
      adminUserId: admin.userId,
      rejectionReason: body.rejectionReason,
    });
  }

  @Patch('kyc/admin/verifications/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  approveVerification(
    @Param('id') verificationId: string,
    @CurrentUser() admin: any,
  ): Observable<any> {
    return this.verificationService.approveVerification({
      verificationId,
      adminUserId: admin.userId,
    });
  }

  @Patch('kyc/submit-vehicle')
  @UseGuards(JwtAuthGuard)
  submitVehicleDocs(
    @Query('vehicleId') vehicleId: string,
    @Body('role') role: string,
  ): Observable<any> {
    return this.verificationService.submitVehicleDocs({
      vehicleId,
      role,
    });
  }

  @Get('kyc/owner/summary')
  @UseGuards(JwtAuthGuard)
  getOwnerSummary(@CurrentUser() user: any): Observable<any> {
    const userId = user.userId;

    // 1. Get bank details from auth service
    const auth$ = (
      this.authService.getMe({ userId }) as unknown as Observable<any>
    ).pipe(
      map((res) => {
        const u = res?.user;
        return {
          bankAccountNumber: u?.bankAccountNumber || '',
          bankAccountHolderName: u?.bankAccountHolderName || '',
          bankName: u?.bankName || '',
          bankIfscCode: u?.bankIfscCode || '',
        };
      }),
      catchError((err) => {
        console.error(
          '[VerificationController] Error fetching owner profile:',
          err,
        );
        return [
          {
            bankAccountNumber: '',
            bankAccountHolderName: '',
            bankName: '',
            bankIfscCode: '',
          },
        ];
      }),
    );

    // 2. Get owner personal KYC status/docs
    const kyc$ = (
      this.verificationService.getUserKycStatus({
        userId,
      }) as unknown as Observable<any>
    ).pipe(
      catchError((err) => {
        console.error(
          '[VerificationController] Error fetching owner KYC:',
          err,
        );
        return [{ status: 'NONE', documents: [], missingDocs: [] }];
      }),
    );

    // 3. Get owner's vehicles and map each vehicle to its verification status/docs
    const vehicles$ = (
      this.searchAndCatalogService.getMyVehicles({
        ownerId: userId,
      }) as unknown as Observable<any>
    ).pipe(
      switchMap((vehiclesRes: any) => {
        const vehicles = vehiclesRes?.vehicles || [];
        if (vehicles.length === 0) {
          return from([[]]);
        }
        const vehicleStatusObservables = vehicles.map((v: any) =>
          (
            this.verificationService.getVehicleVerificationStatus({
              vehicleId: v.id,
              role: 'VEHICLE_OWNER',
            }) as unknown as Observable<any>
          ).pipe(
            map((statusRes: any) => ({
              ...v,
              verification: statusRes,
            })),
            catchError((err) => {
              console.error(
                `[VerificationController] Error fetching verification status for vehicle ${v.id}:`,
                err,
              );
              return [
                {
                  ...v,
                  verification: {
                    status: 'NONE',
                    documents: [],
                    missingDocs: [],
                  },
                },
              ];
            }),
          ),
        );
        return forkJoin(vehicleStatusObservables);
      }),
      catchError((err) => {
        console.error(
          '[VerificationController] Error fetching owner vehicles:',
          err,
        );
        return [[]];
      }),
    );

    return forkJoin({
      bankDetails: auth$,
      userKyc: kyc$,
      vehicles: vehicles$,
    });
  }
}
