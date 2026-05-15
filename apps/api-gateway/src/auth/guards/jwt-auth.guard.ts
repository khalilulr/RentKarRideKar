import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token missing');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      if (payload.type !== 'access') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check specific Token Blacklist (JTI)
      const isBlacklisted = await this.redisService.get(`blacklist:token:${payload.id}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('This specific session has been revoked');
      }

      // Check "Logout All" with timestamp
      const logoutAllTimestamp = await this.redisService.get(`blacklist:all:${payload.userId}`);
      if (logoutAllTimestamp) {
        const logoutTime = parseInt(logoutAllTimestamp, 10);
        // If token was issued BEFORE or AT THE SAME TIME as the logout-all event, it's invalid
        if (payload.iat <= logoutTime) {
          throw new UnauthorizedException('All sessions were revoked. Please login again.');
        }
      }

      // Attach to request
      request['user'] = payload;
      request['accessToken'] = token;
    } catch (error:any) {
      this.logger.error(`Token verification failed: ${error.message}`);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
