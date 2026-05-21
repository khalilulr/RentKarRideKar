import { Controller, Post, Body, Get, Put, Patch, Inject, OnModuleInit, Req, Res, UseGuards, Query, UploadedFile, UseInterceptors, Param, BadRequestException } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { VerificationServiceClient } from '../../../../libs/types/verification';

@Controller('kyc')
export class VerificationController implements OnModuleInit {
  private verificationService: VerificationServiceClient;

  constructor(
    @Inject('VERIFICATION_SERVICE') private readonly client: ClientGrpc,
  ) { }

  onModuleInit() {
    this.verificationService = this.client.getService<VerificationServiceClient>('VerificationService');
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadDoc(
    @CurrentUser() user: any,
    @Query('role') role: string,
    @Query('documentType') documentType: string,
    @Query('vehicleId') vehicleId: string | undefined,  // NEW
    @UploadedFile() file: Express.Multer.File,
  ): Observable<any> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const fileUrl = file.path || file.filename || file.originalname;

    return this.verificationService.uploadDoc({
      userId: user.userId,
      role: role.toUpperCase(),
      docType: documentType.toUpperCase(),
      fileUrl,
      vehicleId: vehicleId ?? '',   // NEW — empty string if not provided
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

  @Patch('submit')
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

  @Get('admin/pending')
  @UseGuards(JwtAuthGuard, AdminGuard)
  pendingStatusDocs(): Observable<any> {
    return this.verificationService.pendingStatusDocs({});
  }

  @Patch('admin/documents/:id')
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
      rejectionReason: body.rejectionReason ? body.rejectionReason : "",
    });
  }

  @Patch('admin/verifications/:id/reject')
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

  @Patch('admin/verifications/:id/approve')
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

  @Patch('submit-vehicle')
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
}
