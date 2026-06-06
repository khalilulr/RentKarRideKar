import { Observable } from 'rxjs';

export const COMMUNICATION_PACKAGE_NAME = 'communication';
export const COMMUNICATION_SERVICE_NAME = 'CommunicationService';

export interface CommunicationServiceClient {
  openChatRooms(request: any): Observable<any>;
  activateCallProxy(request: any): Observable<any>;
  deactivateCallProxy(request: any): Observable<any>;
  closeChatRooms(request: any): Observable<any>;
  archiveChatRooms(request: any): Observable<any>;
  verifyChatAccess(request: any): Observable<any>;
}

export interface CommunicationServiceController {
  openChatRooms(request: any): Promise<any> | Observable<any> | any;
  activateCallProxy(request: any): Promise<any> | Observable<any> | any;
  deactivateCallProxy(request: any): Promise<any> | Observable<any> | any;
  closeChatRooms(request: any): Promise<any> | Observable<any> | any;
  archiveChatRooms(request: any): Promise<any> | Observable<any> | any;
  verifyChatAccess(request: any): Promise<any> | Observable<any> | any;
}
