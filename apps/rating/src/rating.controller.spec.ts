import { Test, TestingModule } from '@nestjs/testing';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

describe('RatingController', () => {
  let ratingController: RatingController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [RatingController],
      providers: [RatingService],
    }).compile();

    ratingController = app.get<RatingController>(RatingController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(ratingController.getHello()).toBe('Hello World!');
    });
  });
});
