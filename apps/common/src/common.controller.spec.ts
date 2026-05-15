import { Test, TestingModule } from '@nestjs/testing';
import { CommonController } from './common.controller';
import { CommonService } from './common.service';

describe('CommonController', () => {
  let commonController: CommonController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [CommonController],
      providers: [CommonService],
    }).compile();

    commonController = app.get<CommonController>(CommonController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(commonController.getHello()).toBe('Hello World!');
    });
  });
});
