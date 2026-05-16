import { Injectable, Logger } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { jwtPayloadAccessDTO } from '../../dto/jwt-payload-access.dto';
import { v4 as uuidv4 } from 'uuid';
import { jwtPayloadRefreshDTO } from '../../dto/jwt-payload-refresh.dto';


@Injectable()
export class JwtService {
    private readonly logger = new Logger(JwtService.name);
    constructor(
        private jwtService: NestJwtService,
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

    decodeToken(token: string) {
        return this.jwtService.decode(token);
    }
}




