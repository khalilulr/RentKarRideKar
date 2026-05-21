import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Check if the user is authenticated and has the ADMIN role
    if (!user || !user.Roles || !user.Roles.includes('ADMIN')) {
      throw new ForbiddenException('Access denied. Admin role required.');
    }

    return true;
  }
}
