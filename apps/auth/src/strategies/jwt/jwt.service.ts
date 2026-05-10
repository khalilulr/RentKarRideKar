import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { jwtPayloadAccessDTO,  } from '../../dto/jwt-payload-access.dto';
import { v4 as uuidv4 } from 'uuid';
import { jwtPayloadRefreshDTO } from '../../dto/jwt-payload-refresh.dto';

@Injectable()
export class JwtService {
    constructor(private jwtService: NestJwtService) {}

    generateAccessToken(payload: jwtPayloadAccessDTO){
        const jti = uuidv4(); 
        const payload_with_id={
            id: jti,
            ...payload
        }
        return this.jwtService.sign(payload_with_id);
    }

    generateRefreshToken(payload: jwtPayloadRefreshDTO){
        const jti = uuidv4(); 
        const payload_with_id={
            id: jti,
            ...payload
        }
        return this.jwtService.sign(payload_with_id, {
            expiresIn: '7d'
        });
    }
    verifyToken(token: string) {
        try {
            return this.jwtService.verify(token);
        } catch (error) {
            throw new UnauthorizedException('Invalid token type');
        }
    }
}
