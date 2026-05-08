import { Controller, Get } from '@nestjs/common';
import { RatingService } from './rating.service';

@Controller()
export class RatingController {
  constructor(private readonly ratingService: RatingService) {}

  @Get()
  getHello(): string {
    return this.ratingService.getHello();
  }
}
