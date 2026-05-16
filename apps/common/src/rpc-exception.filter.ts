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

    // gRPC error details are typically in the 'details' field
    const message = exception.details || exception.message || 'Internal server error';
    
    // We can map specific gRPC codes to HTTP statuses if needed, 
    // but for now we default to 500 as requested for the custom message.
    const status = HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      success: false,
      message: message,
    });
  }
}
