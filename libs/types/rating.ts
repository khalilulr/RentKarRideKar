import { Observable } from 'rxjs';

export const RATING_PACKAGE_NAME = 'rating';
export const RATING_SERVICE_NAME = 'RatingService';

export interface RatingServiceClient {
  submitReview(request: any): Observable<any>;
  getUserRating(request: any): Observable<any>;
  getUserReviews(request: any): Observable<any>;
  respondToReview(request: any): Observable<any>;
  cancelBooking(request: any): Observable<any>;
  getCancellationStats(request: any): Observable<any>;
  getCancellationDeadline(request: any): Observable<any>;
  getUserReputation(request: any): Observable<any>;
  likeReview(request: any): Observable<any>;
}

export interface RatingServiceController {
  submitReview(request: any): Promise<any> | Observable<any> | any;
  getUserRating(request: any): Promise<any> | Observable<any> | any;
  getUserReviews(request: any): Promise<any> | Observable<any> | any;
  respondToReview(request: any): Promise<any> | Observable<any> | any;
  cancelBooking(request: any): Promise<any> | Observable<any> | any;
  getCancellationStats(request: any): Promise<any> | Observable<any> | any;
  getCancellationDeadline(request: any): Promise<any> | Observable<any> | any;
  getUserReputation(request: any): Promise<any> | Observable<any> | any;
  likeReview(request: any): Promise<any> | Observable<any> | any;
}
