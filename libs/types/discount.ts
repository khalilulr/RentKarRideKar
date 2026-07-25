import { Observable } from 'rxjs';

export const DISCOUNT_PACKAGE_NAME = 'discount';
export const DISCOUNT_SERVICE_NAME = 'DiscountService';

export interface DiscountServiceClient {
  createOffer(request: any): Observable<any>;
  toggleOffer(request: any): Observable<any>;
  listOffers(request: any): Observable<any>;
  validateCode(request: any): Observable<any>;
  checkEligibility(request: any): Observable<any>;
  getOfferHistory(request: any): Observable<any>;
  recordOfferUsage(request: any): Observable<any>;
  applyReferral(request: any): Observable<any>;
}

export interface DiscountServiceController {
  createOffer(request: any): Promise<any> | Observable<any> | any;
  toggleOffer(request: any): Promise<any> | Observable<any> | any;
  listOffers(request: any): Promise<any> | Observable<any> | any;
  validateCode(request: any): Promise<any> | Observable<any> | any;
  checkEligibility(request: any): Promise<any> | Observable<any> | any;
  getOfferHistory(request: any): Promise<any> | Observable<any> | any;
  recordOfferUsage(request: any): Promise<any> | Observable<any> | any;
  applyReferral(request: any): Promise<any> | Observable<any> | any;
}
