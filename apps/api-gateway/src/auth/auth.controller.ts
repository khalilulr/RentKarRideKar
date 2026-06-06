import { Controller, Post, Body, Get, Put, Patch, Inject, OnModuleInit, Req, Res, UnauthorizedException, BadRequestException, UseGuards } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { map, Observable } from 'rxjs';
import type { Request, Response } from 'express';
import { JwtService } from '@nestjs/jwt';

import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

// IMPORTANT: Use regular imports for Request objects to avoid metadata errors
import type {
  SendOtpRequest,
  VerifyOtpRequest,
  LogoutRequest,
  UpdateMeRequest,
  SwitchPerspectiveRequest,
  LoginAdminRequest,
  CreateDemoAdminRequest,
} from '../../../../libs/types/auth-service';

// Use type imports for the interfaces/responses
import type {
  AuthServiceController,
  MessageResponse,
  AuthResponse,
  GetMeResponse,
  UpdateMeResponse,
} from '../../../../libs/types/auth-service';

@Controller('auth')
export class AuthController implements OnModuleInit {
  private authService: AuthServiceController;

  constructor(
    @Inject('AUTH_SERVICE') private readonly client: ClientGrpc,
    private readonly jwtService: JwtService,
  ) { }

  onModuleInit() {
    this.authService = this.client.getService<AuthServiceController>('AuthService');
  }

  @Post('send-otp')
  sendOtp(@Body() body: SendOtpRequest): Observable<MessageResponse> {
    return this.authService.sendOtp(body) as unknown as Observable<MessageResponse>;
  }

  @Post('verify-otp')
  verifyOtp(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: VerifyOtpRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.mobile || !body.otp) {
      throw new BadRequestException('Request body with mobile and otp is required');
    }

    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.verifyOtp(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        // 1. Set the refresh token in an HTTP-only cookie
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true, // Prevents client-side JS from reading the cookie (XSS protection)
          secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
          sameSite: 'strict', // CSRF protection
          maxAge: 7 * 24 * 60 * 60 * 1000, // e.g., 7 days in milliseconds
        });

        // 2. Strip the refreshToken and transform enums in user object
        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('admin/login')
  loginAdmin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginAdminRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.email || !body.password) {
      throw new BadRequestException('Request body with email and password is required');
    }
    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.loginAdmin(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('admin/demo')
  createDemoAdmin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: CreateDemoAdminRequest
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {
    if (!body || !body.email || !body.password) {
      throw new BadRequestException('Request body with email and password is required');
    }
    body.ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    body.userAgent = req.headers['user-agent'] || 'unknown';

    return (this.authService.createDemoAdmin(body) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('refresh-token')
  refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Observable<Omit<AuthResponse, 'refreshToken'>> {

    // Extract token from cookies
    const tokenFromCookie = req.cookies['refreshToken'];

    if (!tokenFromCookie) {
      throw new UnauthorizedException('Refresh token not found in cookies');
    }

    // Verify refresh token signature at Gateway (Single Source of Truth)
    try {
      const payload = this.jwtService.verify(tokenFromCookie);
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type in cookie');
      }
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown') as string;
    const userAgent = req.headers['user-agent'] || 'unknown';

    const grpcRequest = {
      refreshToken: tokenFromCookie,
      ipAddress,
      userAgent,
    };

    return (this.authService.refreshToken(grpcRequest) as Observable<AuthResponse>).pipe(
      map((response: AuthResponse) => {
        // Update the cookie with the newly generated refresh token
        res.cookie('refreshToken', response.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // Return only the user and new access token, with transformed enums
        const { refreshToken, user, ...clientResponse } = response;
        return {
          ...clientResponse,
          user: this.mapUserResponse(user),
        };
      }),
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @CurrentUser() user: any,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Observable<MessageResponse> {
    const tokenFromCookie = req.cookies?.['refreshToken'];

    if (!tokenFromCookie) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const logoutRequest: LogoutRequest = {
      userId: user.userId,
      jti: user.id,
      tokenExp: Number(user.exp),
      refreshToken: tokenFromCookie,
    };

    return (this.authService.logout(logoutRequest) as Observable<MessageResponse>).pipe(
      map((response) => {
        // Clear the refresh token cookie
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });

        return response;
      })
    );
  }

  @Post('logout-all-devices')
  @UseGuards(JwtAuthGuard)
  logoutAllDevices(
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response
  ): Observable<MessageResponse> {
    const logoutAllRequest = {
      userId: user.userId,
    };

    return (this.authService.logoutAllDevices(logoutAllRequest) as Observable<MessageResponse>).pipe(
      map((response) => {
        // Clear the refresh token cookie for this current device
        res.clearCookie('refreshToken', {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
        });

        return response;
      })
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: any): Observable<GetMeResponse> {
    return (this.authService.getMe({ userId: user.userId }) as Observable<GetMeResponse>).pipe(
      map(res => ({ ...res, user: this.mapUserResponse(res.user) }))
    );
  }

  
  @Put('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @CurrentUser() user: any,
    @Body() body: any
  ): Observable<UpdateMeResponse> {
    const grpcRequest: UpdateMeRequest = { userId: user.userId };
    console.log(body);
    if (body.name !== undefined) {
      grpcRequest.name = body.name;
    }
    if (body.profileImage !== undefined) {
      grpcRequest.profileImage = body.profileImage;
    } else if (body.profilePicture !== undefined) {
      grpcRequest.profileImage = body.profilePicture;
    }
    if (body.roles?.length) {
      grpcRequest.roles = body.roles.map((r: string) => String(r).toUpperCase());
    }
    if (body.activePerspective !== undefined) {
      grpcRequest.activePerspective = String(body.activePerspective).toUpperCase();
    }

    return (this.authService.updateMe(grpcRequest) as Observable<UpdateMeResponse>).pipe(
      map(res => ({ ...res, user: this.mapUserResponse(res.user) }))
    );
  }

 
  @Put('switch-perspective')
  @UseGuards(JwtAuthGuard)
  switchPerspective(
    @CurrentUser() user: any,
    @Body() body: any
  ): Observable<UpdateMeResponse> {
    const perspective = body.perspective ?? body.activePerspective;
    if (!perspective) {
      throw new BadRequestException('perspective is required');
    }

    const grpcRequest: SwitchPerspectiveRequest = {
      userId: user.userId,
      perspective: String(perspective).toUpperCase(),
    };

    return (this.authService.switchPerspective(grpcRequest) as Observable<UpdateMeResponse>).pipe(
      map(res => ({ ...res, user: this.mapUserResponse(res.user) }))
    );
  }

  /**
   * Transforms numeric gRPC enums back to strings for the REST client.
   */
  private mapUserResponse(user: any) {
    if (!user) return user;

    const roleMapping = {
      0: 'PASSENGER',
      1: 'DRIVER',
      2: 'ADMIN',
      3: 'VEHICLE_OWNER',
    };

    const kycMapping = {
      0: 'PENDING',
      1: 'APPROVED',
      2: 'REJECTED',
    };

    if (user.roles) {
      user.roles = user.roles.map(r => typeof r === 'number' ? roleMapping[r] : r);
    }

    if (typeof user.activePerspective === 'number') {
      user.activePerspective = roleMapping[user.activePerspective];
    }

    if (typeof user.kycStatus === 'number') {
      user.kycStatus = kycMapping[user.kycStatus];
    }

    return user;
  }

}


