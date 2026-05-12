import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { jwtPayloadAccessDTO } from '../../dto/jwt-payload-access.dto';
import { v4 as uuidv4 } from 'uuid';
import { jwtPayloadRefreshDTO } from '../../dto/jwt-payload-refresh.dto';
import { RedisService } from 'apps/common/src/redis/redis.service';
import { User } from '../../entity/user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';


@Injectable()
export class JwtService {
    private readonly logger = new Logger(JwtService.name);
    constructor(
        private jwtService: NestJwtService,
        private redisService: RedisService
    ) { }

    generateAccessToken(payload: jwtPayloadAccessDTO) {
        const jti = uuidv4();
        const payload_with_id = {
            id: jti,
            ...payload
        }
        return this.jwtService.sign(payload_with_id, {
            expiresIn: '1h'
        });
    }

    generateRefreshToken(payload: jwtPayloadRefreshDTO) {
        const jti = uuidv4();
        const payload_with_id = {
            id: jti,
            ...payload
        }
        return this.jwtService.sign(payload_with_id, {
            expiresIn: '7d'
        });
    }

    async decodeToken(token: string) {
        try {
            // 1. Verify signature and expiry synchronously
            const payload = this.jwtService.verify(token);

            // Industry level: Check if the token ID is in the blacklist (Redis)
            if (payload.type === 'access') {
                // 1. Check specific Token Blacklist (JTI)
                const isBlacklisted = await this.redisService.get(`blacklist:token:${payload.id}`);
                if (isBlacklisted) {
                    throw new UnauthorizedException('This specific session has been revoked');
                }

                // 2. Check "Logout All" with timestamp
                const logoutAllTimestamp = await this.redisService.get(`blacklist:all:${payload.userId}`);
                if (logoutAllTimestamp) {
                    const logoutTime = parseInt(logoutAllTimestamp, 10);
                    // If token was issued BEFORE the logout-all event, it's invalid
                    if (payload.iat < logoutTime) {
                        throw new UnauthorizedException('All sessions were revoked. Please login again.');
                    }
                }
            }

            return payload;
        } catch (error) {
            this.logger.error(`Token verification failed: ${error.message}`);
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
}



