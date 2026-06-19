import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './enum/role.enum';
import { KycVerificationEntity } from './entity/kyc-verification.entity';
import { DocumentEntity } from './entity/document.entity';
import { KycStatus } from './enum/kycStatus.enum';
import { DocumentType } from './enum/document_type.enum';
import { DocumentStatus } from './enum/document_status.enum';
import type { ClientGrpc } from '@nestjs/microservices';
import { RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class VerificationService implements OnModuleInit {
  private communicationService: any;

  /**
   * Required docs for USER KYC — keyed by role.
   * Vehicle owners only need personal identity docs here.
   * Their vehicle docs are handled separately via requiredVehicleDocs.
   */
  private requiredUserDocs: Record<string, DocumentType[]> = {
    [Role.DRIVER]: [
      DocumentType.AADHAAR_FRONT,
      DocumentType.AADHAAR_BACK,
      DocumentType.DRIVING_LICENSE,
      DocumentType.SELFIE,
    ],
    [Role.VEHICLE_OWNER]: [
      DocumentType.AADHAAR_FRONT,
      DocumentType.AADHAAR_BACK,
      DocumentType.SELFIE,
    ],
  };

  /**
   * Required docs for VEHICLE verification — same for every vehicle.
   * Checked when owner submits a specific vehicle for review.
   */
  private requiredVehicleDocs: DocumentType[] = [
    DocumentType.RC_BOOK,
    DocumentType.INSURANCE,
    DocumentType.PUC_CERTIFICATE,
    DocumentType.FITNESS_CERT,
    DocumentType.PERMIT,
  ];

  constructor(
    @InjectRepository(KycVerificationEntity)
    private readonly kycRepository: Repository<KycVerificationEntity>,
    @InjectRepository(DocumentEntity)
    private readonly docRepository: Repository<DocumentEntity>,
    @Inject('COMMUNICATION_SERVICE')
    private readonly communicationClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.communicationService = this.communicationClient.getService<any>('CommunicationService');
  }

  async sendNotification(userId: string, title: string, content: string, channel = 'both') {
    try {
      if (this.communicationService && typeof this.communicationService.sendNotification === 'function') {
        await lastValueFrom(
          this.communicationService.sendNotification({
            userId,
            title,
            content,
            channel,
            delayMinutes: 0,
          }),
        );
      }
    } catch (e: any) {
      console.error('[VerificationService] Failed to send notification via gRPC:', e.message);
    }
  }

  /**
   * Upload a document.
   * - If vehicleId is provided: this is a vehicle document upload.
   *   Find or create a verification record keyed by vehicleId + role.
   * - If vehicleId is absent: this is a user KYC upload.
   *   Find or create a verification record keyed by userId + role.
   */
  async uploadDoc(
    userId: string,
    role: Role,
    docType: DocumentType,
    fileUrl: string,
    vehicleId?: string,
  ) {
    let verification: KycVerificationEntity | null;

    if (vehicleId) {
      // Vehicle document upload — find by vehicleId + role
      verification = await this.kycRepository.findOne({
        where: { vehicleId, role, status: KycStatus.PENDING },
      });

      if (!verification) {
        verification = this.kycRepository.create({
          userId,   // owner's userId for reference
          vehicleId,
          role,
          status: KycStatus.PENDING,
        });
        await this.kycRepository.save(verification);
      }
    } else {
      // User KYC upload — find by userId + role
      verification = await this.kycRepository.findOne({
        where: { userId, role, status: KycStatus.PENDING },
      });

      if (!verification) {
        verification = this.kycRepository.create({
          userId,
          role,
          status: KycStatus.PENDING,
        });
        await this.kycRepository.save(verification);
      }
    }

    // Check if this document type was already uploaded — if so, update URL
    const existingDoc = await this.docRepository.findOne({
      where: { verification: { id: verification.id }, documentType: docType },
    });

    if (existingDoc) {
      existingDoc.documentUrl = fileUrl;
      existingDoc.status = DocumentStatus.PENDING; // reset status on re-upload
      await this.docRepository.save(existingDoc);
    } else {
      const newDoc = this.docRepository.create({
        documentType: docType,
        documentUrl: fileUrl,
        verification,
      });
      await this.docRepository.save(newDoc);
    }

    // Return current status
    if (vehicleId) {
      return this.getVehicleVerificationStatus(vehicleId, role);
    }
    return this.getVerificationStatus(userId, role);
  }

  /**
   * Returns user KYC status for a specific role.
   */
  async getVerificationStatus(userId: string, role: Role) {
    const verification = await this.kycRepository.findOne({
      where: { userId, role },
      relations: ['documents'],
      order: { createdAt: 'DESC' },
    });

    const requiredDocs = this.requiredUserDocs[role] ?? [];

    if (!verification) {
      return {
        verificationId: '',
        status: KycStatus.NONE as string,
        rejectionReason: '',
        isComplete: false,
        missingDocs: requiredDocs as string[],
        documents: [],
      };
    }

    const uploadedTypes = verification.documents.map((d) => d.documentType);
    const missing = requiredDocs.filter((type) => !uploadedTypes.includes(type));

    return {
      verificationId: verification.id,
      status: verification.status as string,
      rejectionReason: verification.rejectionReason || '',
      isComplete: missing.length === 0,
      missingDocs: missing as string[],
      documents: verification.documents.map((d) => ({
        documentId: d.id,
        documentType: d.documentType,
        documentUrl: d.documentUrl,
        status: d.status,
        rejectionReason: d.rejectionReason || '',
        uploadedAt: d.createdAt
          ? d.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  /**
   * Returns vehicle document verification status for a specific vehicle.
   */
  async getVehicleVerificationStatus(vehicleId: string, role: Role) {
    const verification = await this.kycRepository.findOne({
      where: { vehicleId, role },
      relations: ['documents'],
      order: { createdAt: 'DESC' },
    });

    const requiredDocs = this.requiredVehicleDocs;

    if (!verification) {
      return {
        verificationId: '',
        vehicleId,
        status: KycStatus.NONE as string,
        rejectionReason: '',
        isComplete: false,
        missingDocs: requiredDocs as string[],
        documents: [],
      };
    }

    const uploadedTypes = verification.documents.map((d) => d.documentType);
    const missing = requiredDocs.filter((type) => !uploadedTypes.includes(type));

    return {
      verificationId: verification.id,
      vehicleId,
      status: verification.status as string,
      rejectionReason: verification.rejectionReason || '',
      isComplete: missing.length === 0,
      missingDocs: missing as string[],
      documents: verification.documents.map((d) => ({
        documentId: d.id,
        documentType: d.documentType,
        documentUrl: d.documentUrl,
        status: d.status,
        rejectionReason: d.rejectionReason || '',
        uploadedAt: d.createdAt
          ? d.createdAt.toISOString()
          : new Date().toISOString(),
      })),
    };
  }

  /**
   * Submit user KYC for admin review.
   * Checks all required user docs are uploaded before submitting.
   */
  async submitKycDoc(userId: string, role: Role) {
    const kycDetail = await this.kycRepository.findOne({
      where: { userId, role },
      relations: ['documents'],
    });

    if (!kycDetail) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: 'KYC details not found',
      });
    }

    const requiredDocuments = this.requiredUserDocs[role];

    if (!requiredDocuments || requiredDocuments.length === 0) {
      throw new RpcException({
        code: 3, // INVALID_ARGUMENT
        message: `No KYC requirements configured for role ${role}`,
      });
    }

    const uploadedDocumentTypes = kycDetail.documents.map(
      (doc) => doc.documentType,
    );

    const missingDocuments = requiredDocuments.filter(
      (requiredDoc) => !uploadedDocumentTypes.includes(requiredDoc),
    );

    if (missingDocuments.length > 0) {
      throw new RpcException({
        code: 3, // INVALID_ARGUMENT
        message: `Some required documents are missing: ${missingDocuments.join(', ')}`,
      });
    }

    kycDetail.status = KycStatus.PENDING;
    kycDetail.submittedAt = new Date();
    await this.kycRepository.save(kycDetail);

    await this.sendNotification(
      userId,
      'KYC Verification Pending',
      'Your KYC document submission is complete and pending admin review.',
      'both',
    );

    return {
      message: 'KYC submitted successfully',
      role,
      status: kycDetail.status,
    };
  }

  /**
   * Submit vehicle documents for admin review.
   * Checks all required vehicle docs are uploaded before submitting.
   */
  async submitVehicleDocs(vehicleId: string, role: Role) {
    const verification = await this.kycRepository.findOne({
      where: { vehicleId, role },
      relations: ['documents'],
    });

    if (!verification) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: 'Vehicle verification record not found',
      });
    }

    const uploadedDocumentTypes = verification.documents.map(
      (doc) => doc.documentType,
    );

    const missingDocuments = this.requiredVehicleDocs.filter(
      (requiredDoc) => !uploadedDocumentTypes.includes(requiredDoc),
    );

    if (missingDocuments.length > 0) {
      throw new RpcException({
        code: 3, // INVALID_ARGUMENT
        message: `Some required vehicle documents are missing: ${missingDocuments.join(', ')}`,
      });
    }

    verification.status = KycStatus.PENDING;
    verification.submittedAt = new Date();
    await this.kycRepository.save(verification);

    await this.sendNotification(
      verification.userId,
      'Vehicle Verification Pending',
      `Your vehicle documents submission (Vehicle ID: ${vehicleId}) is complete and pending admin review.`,
      'both',
    );

    return {
      message: 'Vehicle documents submitted successfully',
      vehicleId,
      status: verification.status,
    };
  }

  async pendingStatusDocs() {
    const pendingVerifications = await this.kycRepository.find({
      where: { status: KycStatus.PENDING },
      relations: ['documents'],
    });

    return {
      message: 'Pending documents fetched',
      total: pendingVerifications.length,
      data: pendingVerifications.map((v) => ({
        verificationId: v.id,
        userId: v.userId,
        vehicleId: v.vehicleId || '',
        role: v.role,
        status: v.status,
        submittedAt: v.submittedAt
          ? v.submittedAt.toISOString()
          : v.createdAt.toISOString(),
        rejectionReason: v.rejectionReason || '',
        documents: v.documents.map((d) => ({
          documentId: d.id,
          documentType: d.documentType,
          documentUrl: d.documentUrl,
          status: d.status,
          rejectionReason: d.rejectionReason || '',
          uploadedAt: d.createdAt.toISOString(),
        })),
      })),
    };
  }

  async reviewDocument(
    documentId: string,
    adminUserId: string,
    status: DocumentStatus,
    rejectionReason?: string,
  ) {
    const doc = await this.docRepository.findOne({
      where: { id: documentId },
      relations: ['verification'],
    });

    if (!doc) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: 'Document not found',
      });
    }

    doc.status = status;
    if (rejectionReason) {
      doc.rejectionReason = rejectionReason;
    }
    await this.docRepository.save(doc);

    if (doc.verification && doc.verification.status === KycStatus.PENDING) {
      const role = doc.verification.role;
      // Use correct required docs list based on whether this is vehicle or user verification
      const mandatoryDocs = doc.verification.vehicleId
        ? this.requiredVehicleDocs
        : (this.requiredUserDocs[role] ?? []);

      if (
        status === DocumentStatus.REJECTED &&
        mandatoryDocs.includes(doc.documentType)
      ) {
        doc.verification.status = KycStatus.REJECTED;
        doc.verification.rejectionReason =
          rejectionReason ||
          `Mandatory document ${doc.documentType} was rejected.`;
        doc.verification.reviewedBy = adminUserId;
        doc.verification.reviewedAt = new Date();
        await this.kycRepository.save(doc.verification);

        await this.sendNotification(
          doc.verification.userId,
          'Document Verification Rejected',
          `Your document ${doc.documentType} was rejected. Reason: ${doc.verification.rejectionReason}. Please complete your KYC verification.`,
          'both',
        );
      } else if (status === DocumentStatus.APPROVED) {
        const allDocs = await this.docRepository.find({
          where: { verification: { id: doc.verification.id } },
        });
        const approvedTypes = allDocs
          .filter((d) => d.status === DocumentStatus.APPROVED)
          .map((d) => d.documentType);

        const allMandatoryApproved = mandatoryDocs.every((type) =>
          approvedTypes.includes(type),
        );

        if (allMandatoryApproved) {
          doc.verification.status = KycStatus.VERIFIED;
          doc.verification.reviewedBy = adminUserId;
          doc.verification.reviewedAt = new Date();
          await this.kycRepository.save(doc.verification);

          if (doc.verification.vehicleId) {
            await this.sendNotification(
              doc.verification.userId,
              'Vehicle Verification Approved',
              `Your vehicle verification (Vehicle ID: ${doc.verification.vehicleId}) has been approved by the admin.`,
              'both',
            );
          } else {
            await this.sendNotification(
              doc.verification.userId,
              'KYC Approved',
              'Your KYC verification has been approved by the admin.',
              'both',
            );
          }
        }
      }
    }

    return {
      message: 'Document reviewed',
      data: {
        documentId: doc.id,
        documentType: doc.documentType,
        status: doc.status,
        rejectionReason: doc.rejectionReason || '',
        verificationId: doc.verification.id,
      },
    };
  }

  async rejectVerification(
    verificationId: string,
    adminUserId: string,
    rejectionReason: string,
  ) {
    const verification = await this.kycRepository.findOne({
      where: { id: verificationId },
      relations: ['documents'],
    });

    if (!verification) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: 'Verification not found',
      });
    }

    verification.status = KycStatus.REJECTED;
    verification.rejectionReason = rejectionReason || 'Rejected by Admin';
    verification.reviewedBy = adminUserId;
    verification.reviewedAt = new Date();
    await this.kycRepository.save(verification);

    if (verification.vehicleId) {
      await this.sendNotification(
        verification.userId,
        'Vehicle Documents Rejected',
        `Your vehicle documents verification (Vehicle ID: ${verification.vehicleId}) has been rejected by the admin. Reason: ${verification.rejectionReason}`,
        'both',
      );
    } else {
      await this.sendNotification(
        verification.userId,
        'KYC Verification Rejected',
        `Your KYC verification has been rejected by the admin. Reason: ${verification.rejectionReason}`,
        'both',
      );
    }

    for (const doc of verification.documents ?? []) {
      if (doc.status === DocumentStatus.PENDING) {
        doc.status = DocumentStatus.REJECTED;
        doc.rejectionReason =
          rejectionReason || 'Verification rejected by Admin';
        await this.docRepository.save(doc);
      }
    }

    return {
      message: 'Verification rejected successfully',
      verificationId: verification.id,
      status: verification.status,
      rejectionReason: verification.rejectionReason,
    };
  }

  async approveVerification(verificationId: string, adminUserId: string) {
    const verification = await this.kycRepository.findOne({
      where: { id: verificationId },
      relations: ['documents'],
    });

    if (!verification) {
      throw new RpcException({
        code: 5, // NOT_FOUND
        message: 'Verification not found',
      });
    }

    verification.status = KycStatus.VERIFIED;
    verification.rejectionReason = '';
    verification.reviewedBy = adminUserId;
    verification.reviewedAt = new Date();
    await this.kycRepository.save(verification);

    if (verification.vehicleId) {
      await this.sendNotification(
        verification.userId,
        'Vehicle Verification Approved',
        `Your vehicle verification (Vehicle ID: ${verification.vehicleId}) has been approved by the admin.`,
        'both',
      );
    } else {
      await this.sendNotification(
        verification.userId,
        'KYC Approved',
        'Your KYC verification has been approved by the admin.',
        'both',
      );
    }

    for (const doc of verification.documents ?? []) {
      if (doc.status === DocumentStatus.PENDING) {
        doc.status = DocumentStatus.APPROVED;
        await this.docRepository.save(doc);
      }
    }

    return {
      message: 'Verification approved successfully',
      verificationId: verification.id,
      status: verification.status,
    };
  }
}