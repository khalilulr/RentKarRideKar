import {
    CanActivate,
    ExecutionContext,
    Injectable,
    ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class VehicleOwnerGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Check if the user is authenticated and has the VEHICLE_OWNER role
        if (!user || !user.Roles || !user.Roles.includes('VEHICLE_OWNER')) {
            throw new ForbiddenException('Access denied. Vehicle Owner role required.');
        }

        return true;
    }
}
