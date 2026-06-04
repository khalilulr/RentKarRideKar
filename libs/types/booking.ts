import { Observable } from 'rxjs';

export const BOOKING_PACKAGE_NAME = 'booking';
export const BOOKING_SERVICE_NAME = 'BookingService';

export interface BookingServiceClient {
  addToCart(request: any): Observable<any>;
  viewCart(request: any): Observable<any>;
  removeCartItem(request: any): Observable<any>;
  clearCart(request: any): Observable<any>;
  createOrder(request: any): Observable<any>;
  listOrders(request: any): Observable<any>;
  getOrderDetails(request: any): Observable<any>;
  ownerAccept(request: any): Observable<any>;
  ownerReject(request: any): Observable<any>;
  ownerRemoveDriver(request: any): Observable<any>;
  driverAccept(request: any): Observable<any>;
  driverReject(request: any): Observable<any>;
  driverArrive(request: any): Observable<any>;
  verifyOtp(request: any): Observable<any>;
  completeVehicleTrip(request: any): Observable<any>;
  completeOrder(request: any): Observable<any>;
  cancelOrder(request: any): Observable<any>;
  ownerCancelVehicle(request: any): Observable<any>;
  confirmPayment(request: any): Observable<any>;
}

export interface BookingServiceController {
  addToCart(request: any): Promise<any> | Observable<any> | any;
  viewCart(request: any): Promise<any> | Observable<any> | any;
  removeCartItem(request: any): Promise<any> | Observable<any> | any;
  clearCart(request: any): Promise<any> | Observable<any> | any;
  createOrder(request: any): Promise<any> | Observable<any> | any;
  listOrders(request: any): Promise<any> | Observable<any> | any;
  getOrderDetails(request: any): Promise<any> | Observable<any> | any;
  ownerAccept(request: any): Promise<any> | Observable<any> | any;
  ownerReject(request: any): Promise<any> | Observable<any> | any;
  ownerRemoveDriver(request: any): Promise<any> | Observable<any> | any;
  driverAccept(request: any): Promise<any> | Observable<any> | any;
  driverReject(request: any): Promise<any> | Observable<any> | any;
  driverArrive(request: any): Promise<any> | Observable<any> | any;
  verifyOtp(request: any): Promise<any> | Observable<any> | any;
  completeVehicleTrip(request: any): Promise<any> | Observable<any> | any;
  completeOrder(request: any): Promise<any> | Observable<any> | any;
  cancelOrder(request: any): Promise<any> | Observable<any> | any;
  ownerCancelVehicle(request: any): Promise<any> | Observable<any> | any;
  confirmPayment(request: any): Promise<any> | Observable<any> | any;
}
