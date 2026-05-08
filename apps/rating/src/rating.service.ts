import { Injectable } from '@nestjs/common';

@Injectable()
export class RatingService {
  getHello(): string {
    return 'Hello World!';
  }
}
