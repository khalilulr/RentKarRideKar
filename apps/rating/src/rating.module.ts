import { Module } from '@nestjs/common';
import { RatingController } from './rating.controller';
import { RatingService } from './rating.service';

@Module({
  imports: [],
  controllers: [RatingController],
  providers: [RatingService],
})
export class RatingModule {}
