import { Test, TestingModule } from '@nestjs/testing';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

describe('VerificationController', () => {
  let verificationController: VerificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerificationController],
      providers: [
        { provide: VerificationService, useValue: {} },
      ],
    }).compile();

    verificationController = module.get<VerificationController>(VerificationController);
  });

  it('should be defined', () => {
    expect(verificationController).toBeDefined();
  });
});