import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from './enum/role.enum';
import { KycVerificationEntity } from './entity/kyc-verification.entity';
import { DocumentEntity } from './entity/document.entity';
import { KycStatus } from './enum/kycStatus.enum';
import { DocumentType } from './enum/document_type.enum';
import { DocumentStatus } from './enum/document_status.enum';


@Injectable()
export class VerificationService {
 private requiredDocs: Record<Role, DocumentType[]> = {
  [Role.DRIVER]: [DocumentType.AADHAAR, DocumentType.DRIVING_LICENSE, DocumentType.SELFIE],
  [Role.VEHICLE_OWNER]: [DocumentType.AADHAAR, DocumentType.VEHICLE_RC, DocumentType.INSURANCE],
 }

  constructor(
    @InjectRepository(KycVerificationEntity)
    private readonly kycRepository: Repository<KycVerificationEntity>,
    @InjectRepository(DocumentEntity)
    private readonly docRepository: Repository<DocumentEntity>,
  ) {}

  /**
   * Main logic for uploading and linking documents
   */
  async uploadDoc(userId: string, role: Role, docType: DocumentType, fileUrl: string) {
    // 1. Find an existing PENDING verification or create a new one
    let verification = await this.kycRepository.findOne({
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

    // 2. Check if this document type was already uploaded for this specific verification
    const existingDoc = await this.docRepository.findOne({
        where: { verification: { id: verification.id }, documentType: docType }
    });

    if (existingDoc) {
        // Option: Update existing doc URL if they are re-uploading
        existingDoc.documentUrl = fileUrl;
        await this.docRepository.save(existingDoc);
        return this.getVerificationStatus(userId, role);
    }

    // 3. Create and save the new document record
    const newDoc = this.docRepository.create({
      documentType: docType,
      documentUrl: fileUrl,
      verification: verification,
    });

    await this.docRepository.save(newDoc);

    // 4. Return completion status to the frontend
    return this.getVerificationStatus(userId, role);
  }

  /**
   * Returns what is missing for a specific role
   */
  async getVerificationStatus(userId: string, role: Role) {
    const verification = await this.kycRepository.findOne({
      where: { userId, role },
      relations: ['documents'],
      order: { createdAt: 'DESC' } // Get the most recent attempt
    });

    if (!verification) {
      return { 
        verificationId: "", 
        status: KycStatus.NONE as string, 
        rejectionReason: "", 
        isComplete: false, 
        missingDocs: this.requiredDocs[role] as string[],
        documents: [],
      };
    }

    const uploadedTypes = verification.documents.map((d) => d.documentType);
    const missing = this.requiredDocs[role].filter(
      (type) => !uploadedTypes.includes(type),
    );

    return {
      verificationId: verification.id,
      status: verification.status as string,
      rejectionReason: verification.rejectionReason || "",
      isComplete: missing.length === 0,
      missingDocs: missing as string[],
      documents: verification.documents.map((d) => ({
        documentId: d.id,
        documentType: d.documentType,
        documentUrl: d.documentUrl,
        status: d.status,
        rejectionReason: d.rejectionReason || "",
        uploadedAt: d.createdAt ? d.createdAt.toISOString() : new Date().toISOString(),
      })),
    };
  }

  async submitKycDoc(userId: string, role: Role) {
    const kycDetail = await this.kycRepository.findOne({
      where: {
        userId,
        role,
      },
      relations: ['documents'],
    });

    if (!kycDetail) {
      throw new NotFoundException('KYC details not found');
    }

    // Required documents for this role
    const requiredDocuments = this.requiredDocs[role];

    if (!requiredDocuments || requiredDocuments.length === 0) {
      throw new BadRequestException(
        `No KYC requirements configured for role ${role}`,
      );
    }

    // Uploaded document types
    const uploadedDocumentTypes = kycDetail.documents.map(
      (doc) => doc.documentType,
    );

    // Find missing documents
    const missingDocuments = requiredDocuments.filter(
      (requiredDoc) => !uploadedDocumentTypes.includes(requiredDoc),
    );

    if (missingDocuments.length > 0) {
      throw new BadRequestException({
        message: 'Some required documents are missing',
        missingDocuments,
      });
    }

    // Mark KYC as submitted/pending review
    kycDetail.status = KycStatus.PENDING;

    await this.kycRepository.save(kycDetail);

    return {
      message: 'KYC submitted successfully',
      role,
      status: kycDetail.status,
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
      data: pendingVerifications.map(v => ({
        verificationId: v.id,
        userId: v.userId,
        role: v.role,
        status: v.status,
        submittedAt: v.submittedAt ? v.submittedAt.toISOString() : v.createdAt.toISOString(),
        rejectionReason: v.rejectionReason || "",
        documents: v.documents.map(d => ({
          documentId: d.id,
          documentType: d.documentType,
          documentUrl: d.documentUrl,
          status: d.status,
          rejectionReason: d.rejectionReason || "",
          uploadedAt: d.createdAt.toISOString(),
        })),
      })),
    };
  }

  async reviewDocument(documentId: string, adminUserId: string, status: DocumentStatus, rejectionReason?: string) {
    const doc = await this.docRepository.findOne({
      where: { id: documentId },
      relations: ['verification'],
    });

    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    doc.status = status;
    if (rejectionReason) {
      doc.rejectionReason = rejectionReason;
    }
    await this.docRepository.save(doc);

    // If the admin rejects a mandatory document, update the overall verification status from PENDING to REJECTED
    if (doc.verification && doc.verification.status === KycStatus.PENDING) {
      const role = doc.verification.role;
      const mandatoryDocs = this.requiredDocs[role] || [];
      if (status === DocumentStatus.REJECTED && mandatoryDocs.includes(doc.documentType)) {
        doc.verification.status = KycStatus.REJECTED;
        doc.verification.rejectionReason = rejectionReason || `Mandatory document ${doc.documentType} was rejected.`;
        doc.verification.reviewedBy = adminUserId;
        doc.verification.reviewedAt = new Date();
        await this.kycRepository.save(doc.verification);
      } else if (status === DocumentStatus.APPROVED) {
        // If the admin approved this document, check if all mandatory documents are now APPROVED
        const allDocs = await this.docRepository.find({
          where: { verification: { id: doc.verification.id } }
        });
        const approvedTypes = allDocs
          .filter((d) => d.status === DocumentStatus.APPROVED)
          .map((d) => d.documentType);
        
        const allMandatoryApproved = mandatoryDocs.every((type) => approvedTypes.includes(type));
        if (allMandatoryApproved) {
          doc.verification.status = KycStatus.VERIFIED;
          doc.verification.reviewedBy = adminUserId;
          doc.verification.reviewedAt = new Date();
          await this.kycRepository.save(doc.verification);
        }
      }
    }

    return {
      message: 'Document reviewed',
      data: {
        documentId: doc.id,
        documentType: doc.documentType,
        status: doc.status,
        rejectionReason: doc.rejectionReason || "",
        verificationId: doc.verification.id,
      },
    };
  }

  async rejectVerification(verificationId: string, adminUserId: string, rejectionReason: string) {
    const verification = await this.kycRepository.findOne({
      where: { id: verificationId },
      relations: ['documents'],
    });

    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    verification.status = KycStatus.REJECTED;
    verification.rejectionReason = rejectionReason || 'Rejected by Admin';
    verification.reviewedBy = adminUserId;
    verification.reviewedAt = new Date();
    await this.kycRepository.save(verification);

    // Also reject all of its documents that are currently PENDING
    if (verification.documents && verification.documents.length > 0) {
      for (const doc of verification.documents) {
        if (doc.status === DocumentStatus.PENDING) {
          doc.status = DocumentStatus.REJECTED;
          doc.rejectionReason = rejectionReason || 'Verification rejected by Admin';
          await this.docRepository.save(doc);
        }
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
      throw new NotFoundException('Verification not found');
    }

    verification.status = KycStatus.VERIFIED;
    verification.rejectionReason = '';
    verification.reviewedBy = adminUserId;
    verification.reviewedAt = new Date();
    await this.kycRepository.save(verification);

    // Also approve all of its documents that are currently PENDING
    if (verification.documents && verification.documents.length > 0) {
      for (const doc of verification.documents) {
        if (doc.status === DocumentStatus.PENDING) {
          doc.status = DocumentStatus.APPROVED;
          await this.docRepository.save(doc);
        }
      }
    }

    return {
      message: 'Verification approved successfully',
      verificationId: verification.id,
      status: verification.status,
    };
  }

}