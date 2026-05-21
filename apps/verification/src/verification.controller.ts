import { Controller } from '@nestjs/common';
import { VerificationService } from './verification.service';
import { Role } from './enum/role.enum';
import { DocumentType } from './enum/document_type.enum';
import { DocumentStatus } from './enum/document_status.enum';
import { KycStatus } from './enum/kycStatus.enum';
import { VerificationServiceControllerMethods } from '../../../libs/types/verification';
import type {
  VerificationServiceController,
  UploadDocRequest,
  GetVerificationStatusRequest,
  SubmitKycDocRequest,
  Empty,
  ReviewDocumentRequest,
  RejectVerificationRequest,
  ApproveVerificationRequest,
  SubmitVehicleDocsRequest,
} from '../../../libs/types/verification';
import { GrpcMethod } from '@nestjs/microservices';

@Controller()
@VerificationServiceControllerMethods()
export class VerificationController implements VerificationServiceController {
  constructor(
    private readonly verificationService: VerificationService,
  ) { }


  @GrpcMethod('VerificationService', 'UploadDoc')
  async uploadDoc(request: UploadDocRequest) {
    return this.verificationService.uploadDoc(
      request.userId,
      request.role as Role,
      request.docType as DocumentType,
      request.fileUrl,
      request.vehicleId || undefined,  // pass vehicleId if present
    );
  }

  @GrpcMethod('VerificationService', 'GetVerificationStatus')
  async getVerificationStatus(request: GetVerificationStatusRequest) {
    return this.verificationService.getVerificationStatus(
      request.userId,
      request.role as Role,
    );
  }

  @GrpcMethod('VerificationService', 'SubmitKycDoc')
  async submitKycDoc(request: SubmitKycDocRequest) {
    return this.verificationService.submitKycDoc(
      request.userId,
      request.role as Role,
    );
  }

  @GrpcMethod('VerificationService', 'PendingStatusDocs')
  async pendingStatusDocs(request: Empty) {
    return this.verificationService.pendingStatusDocs();
  }

  @GrpcMethod('VerificationService', 'ReviewDocument')
  async reviewDocument(request: ReviewDocumentRequest) {
    return this.verificationService.reviewDocument(
      request.documentId,
      request.adminUserId,
      request.status as DocumentStatus,
      request.rejectionReason,
    );
  }

  @GrpcMethod('VerificationService', 'RejectVerification')
  async rejectVerification(request: RejectVerificationRequest) {
    return this.verificationService.rejectVerification(
      request.verificationId,
      request.adminUserId,
      request.rejectionReason,
    );
  }

  @GrpcMethod('VerificationService', 'ApproveVerification')
  async approveVerification(request: ApproveVerificationRequest) {
    return this.verificationService.approveVerification(
      request.verificationId,
      request.adminUserId,
    );
  }

  @GrpcMethod('VerificationService', 'SubmitVehicleDocs')
  async submitVehicleDocs(request: SubmitVehicleDocsRequest) {
    return this.verificationService.submitVehicleDocs(
      request.vehicleId,
      request.role as Role,
    );
  }
}
