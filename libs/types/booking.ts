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
  getBooking(request: any): Observable<any>;
  getOrderVehicles(request: any): Observable<any>;
  updateBookingStatus(request: any): Observable<any>;
  confirmPayment(request: any): Observable<any>;
  assignDriver(request: any): Observable<any>;
  getOwnerEarnings(request: any): Observable<any>;
  getPayoutHistory(request: any): Observable<any>;
  downloadEarningsStatement(request: any): Observable<any>;
  getDriverEarnings(request: any): Observable<any>;
  raiseDispute(request: any): Observable<any>;
  getDispute(request: any): Observable<any>;
  adminGetDisputes(request: any): Observable<any>;
  adminResolveDispute(request: any): Observable<any>;
  getOrderOtp(request: any): Observable<any>;
  payBalance(request: any): Observable<any>;
  adminGetAnalytics(request: any): Observable<any>;
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
  getBooking(request: any): Promise<any> | Observable<any> | any;
  getOrderVehicles(request: any): Promise<any> | Observable<any> | any;
  updateBookingStatus(request: any): Promise<any> | Observable<any> | any;
  confirmPayment(request: any): Promise<any> | Observable<any> | any;
  assignDriver(request: any): Promise<any> | Observable<any> | any;
  getOwnerEarnings(request: any): Promise<any> | Observable<any> | any;
  getPayoutHistory(request: any): Promise<any> | Observable<any> | any;
  downloadEarningsStatement(request: any): Promise<any> | Observable<any> | any;
  getDriverEarnings(request: any): Promise<any> | Observable<any> | any;
  raiseDispute(request: any): Promise<any> | Observable<any> | any;
  getDispute(request: any): Promise<any> | Observable<any> | any;
  adminGetDisputes(request: any): Promise<any> | Observable<any> | any;
  adminResolveDispute(request: any): Promise<any> | Observable<any> | any;
  getOrderOtp(request: any): Promise<any> | Observable<any> | any;
  payBalance(request: any): Promise<any> | Observable<any> | any;
  adminGetAnalytics(request: any): Promise<any> | Observable<any> | any;
}
