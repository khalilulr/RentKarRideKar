import { IsEnum, IsNotEmpty } from 'class-validator';
import { DocumentType } from '../enum/document_type.enum';

export class CreateKycDocDto {
  @IsEnum(DocumentType, {
    message: 'Invalid document type. Must be AADHAAR, DL, RC, etc.',
  })
  @IsNotEmpty()
  doc_type: DocumentType;
}
