import { Observable } from "rxjs";
import { GrpcMethod, GrpcStreamMethod } from "@nestjs/microservices";

export const protobufPackage = "verification";

export interface Empty {}

export interface UploadDocRequest {
  userId: string;
  role: string;
  docType: string;
  fileUrl: string;
}

export interface GetVerificationStatusRequest {
  userId: string;
  role: string;
}

export interface VerificationStatusResponse {
  verificationId: string;
  status: string;
  rejectionReason: string;
  isComplete: boolean;
  missingDocs: string[];
  documents: Document[];
}

export interface SubmitKycDocRequest {
  userId: string;
  role: string;
}

export interface SubmitKycDocResponse {
  message: string;
  role: string;
  status: string;
}

export interface PendingStatusDocsResponse {
  message: string;
  total: number;
  data: PendingUserDetail[];
}

export interface PendingUserDetail {
  verificationId: string;
  userId: string;
  role: string;
  status: string;
  submittedAt: string;
  rejectionReason: string;
  documents: Document[];
}

export interface Document {
  documentId: string;
  documentType: string;
  documentUrl: string;
  status: string;
  rejectionReason: string;
  uploadedAt: string;
}

export interface ReviewDocumentRequest {
  documentId: string;
  adminUserId: string;
  status: string;
  rejectionReason: string;
}

export interface ReviewDocumentResponse {
  message: string;
  data: ReviewDocumentData | undefined;
}

export interface ReviewDocumentData {
  documentId: string;
  documentType: string;
  status: string;
  rejectionReason: string;
  verificationId: string;
}

export interface RejectVerificationRequest {
  verificationId: string;
  adminUserId: string;
  rejectionReason: string;
}

export interface RejectVerificationResponse {
  message: string;
  verificationId: string;
  status: string;
  rejectionReason: string;
}

export interface ApproveVerificationRequest {
  verificationId: string;
  adminUserId: string;
}

export interface ApproveVerificationResponse {
  message: string;
  verificationId: string;
  status: string;
}

export const VERIFICATION_PACKAGE_NAME = "verification";

export interface VerificationServiceClient {
  uploadDoc(request: UploadDocRequest): Observable<VerificationStatusResponse>;
  getVerificationStatus(request: GetVerificationStatusRequest): Observable<VerificationStatusResponse>;
  submitKycDoc(request: SubmitKycDocRequest): Observable<SubmitKycDocResponse>;
  pendingStatusDocs(request: Empty): Observable<PendingStatusDocsResponse>;
  reviewDocument(request: ReviewDocumentRequest): Observable<ReviewDocumentResponse>;
  rejectVerification(request: RejectVerificationRequest): Observable<RejectVerificationResponse>;
  approveVerification(request: ApproveVerificationRequest): Observable<ApproveVerificationResponse>;
}

export interface VerificationServiceController {
  uploadDoc(request: UploadDocRequest): Promise<VerificationStatusResponse> | Observable<VerificationStatusResponse> | VerificationStatusResponse;
  getVerificationStatus(request: GetVerificationStatusRequest): Promise<VerificationStatusResponse> | Observable<VerificationStatusResponse> | VerificationStatusResponse;
  submitKycDoc(request: SubmitKycDocRequest): Promise<SubmitKycDocResponse> | Observable<SubmitKycDocResponse> | SubmitKycDocResponse;
  pendingStatusDocs(request: Empty): Promise<PendingStatusDocsResponse> | Observable<PendingStatusDocsResponse> | PendingStatusDocsResponse;
  reviewDocument(request: ReviewDocumentRequest): Promise<ReviewDocumentResponse> | Observable<ReviewDocumentResponse> | ReviewDocumentResponse;
  rejectVerification(request: RejectVerificationRequest): Promise<RejectVerificationResponse> | Observable<RejectVerificationResponse> | RejectVerificationResponse;
  approveVerification(request: ApproveVerificationRequest): Promise<ApproveVerificationResponse> | Observable<ApproveVerificationResponse> | ApproveVerificationResponse;
}

export function VerificationServiceControllerMethods() {
  return function (constructor: Function) {
    const grpcMethods: string[] = [
      "uploadDoc",
      "getVerificationStatus",
      "submitKycDoc",
      "pendingStatusDocs",
      "reviewDocument",
      "rejectVerification",
      "approveVerification",
    ];
    for (const method of grpcMethods) {
      const descriptor: any = Reflect.getOwnPropertyDescriptor(constructor.prototype, method);
      GrpcMethod("VerificationService", method)(constructor.prototype[method], method, descriptor);
    }
    const grpcStreamMethods: string[] = [];
    for (const method of grpcStreamMethods) {
      const descriptor: any = Reflect.getOwnPropertyDescriptor(constructor.prototype, method);
      GrpcStreamMethod("VerificationService", method)(constructor.prototype[method], method, descriptor);
    }
  };
}

export const VERIFICATION_SERVICE_NAME = "VerificationService";
