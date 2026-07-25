// enum/document_status.enum.ts
export enum DocumentStatus {
  PENDING = 'PENDING', // just uploaded, awaiting review
  APPROVED = 'APPROVED', // admin approved this doc
  REJECTED = 'REJECTED', // admin rejected, needs re-upload
}
