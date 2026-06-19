import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

/**
 * Filter to catch gRPC errors and format them as clean REST responses.
 */
@Catch()
export class RpcExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = exception.details || exception.message || 'Internal server error';

    // Map gRPC status codes to HTTP status codes
    if (exception && typeof exception.code === 'number') {
      switch (exception.code) {
        case 3: // INVALID_ARGUMENT
        case 9: // FAILED_PRECONDITION
        case 11: // OUT_OF_RANGE
          status = HttpStatus.BAD_REQUEST;
          break;
        case 5: // NOT_FOUND
          status = HttpStatus.NOT_FOUND;
          break;
        case 7: // PERMISSION_DENIED
          status = HttpStatus.FORBIDDEN;
          break;
        case 16: // UNAUTHENTICATED
          status = HttpStatus.UNAUTHORIZED;
          break;
        case 6: // ALREADY_EXISTS
        case 10: // ABORTED
          status = HttpStatus.CONFLICT;
          break;
        case 8: // RESOURCE_EXHAUSTED
          status = HttpStatus.TOO_MANY_REQUESTS;
          break;
        case 14: // UNAVAILABLE
          status = HttpStatus.SERVICE_UNAVAILABLE;
          break;
        case 12: // UNIMPLEMENTED
          status = HttpStatus.NOT_IMPLEMENTED;
          break;
      }
    } else if (exception && typeof exception.getStatus === 'function') {
      // It's a standard HTTP exception
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'object' && res.message ? res.message : res;
    }

    response.status(status).json({
      statusCode: status,
      success: false,
      message: message,
    });
  }
}
