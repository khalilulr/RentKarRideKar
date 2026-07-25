import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import request from 'supertest';
import { ApiGatewayModule } from './../src/api-gateway.module';
import cookieParser from 'cookie-parser';
import { of } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'apps/common/src/redis/redis.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let redisService: RedisService;

  const mockAuthService = {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    logoutAllDevices: jest.fn(),
    getMe: jest.fn(),
    updateMe: jest.fn(),
    switchPerspective: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider('AUTH_SERVICE')
      .useValue({
        getService: () => mockAuthService,
      })
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider('REDIS_CLIENT')
      .useValue({}) // Mock client
      .compile();

    app = moduleFixture.createNestApplication();

    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    jwtService = moduleFixture.get<JwtService>(JwtService);
    redisService = moduleFixture.get<RedisService>(RedisService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Optionally clear Redis if needed, but we'll use unique JTIs or mock them
  });

  describe('Authentication Flow', () => {
    const mockUser = {
      id: 'user-123',
      mobile: '+918409253381',
      name: 'Ashif',
      roles: ['PASSENGER'],
      activePerspective: 'PASSENGER',
    };

    it('should verify OTP and set refresh token cookie', async () => {
      const accessToken = jwtService.sign({
        userId: mockUser.id,
        Roles: mockUser.roles,
        activePerspective: mockUser.activePerspective,
        type: 'access',
        id: 'jti-1',
      });
      const refreshToken = jwtService.sign({
        userId: mockUser.id,
        type: 'refresh',
        id: 'jti-2',
      });

      mockAuthService.verifyOtp.mockReturnValue(
        of({
          user: mockUser,
          accessToken,
          refreshToken,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ mobile: mockUser.mobile, otp: '1234' });

      expect(res.status).toBe(201); // Post returns 201 by default in Nest
      expect(res.body.accessToken).toBe(accessToken);
      expect(res.header['set-cookie']).toBeDefined();
      expect(res.header['set-cookie'][0]).toContain('refreshToken=');
    });

    it('should allow access with valid token', async () => {
      const accessToken = jwtService.sign({
        userId: mockUser.id,
        Roles: mockUser.roles,
        activePerspective: mockUser.activePerspective,
        type: 'access',
        id: 'jti-3',
      });

      mockAuthService.getMe.mockReturnValue(of({ user: mockUser }));

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(mockUser.id);
    });

    it('should reject blacklisted token', async () => {
      const jti = 'jti-blacklisted';
      const accessToken = jwtService.sign({
        userId: mockUser.id,
        Roles: mockUser.roles,
        activePerspective: mockUser.activePerspective,
        type: 'access',
        id: jti,
      });

      // Simulate blacklisting in Redis
      mockRedisService.get.mockImplementation(async (key) => {
        if (key === `blacklist:token:${jti}`) return 'true';
        return null;
      });

      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('revoked');
    });

    it('should refresh token using cookie', async () => {
      const oldRefreshToken = jwtService.sign({
        userId: mockUser.id,
        type: 'refresh',
        id: 'jti-old',
      });
      const newAccessToken = jwtService.sign({
        userId: mockUser.id,
        Roles: mockUser.roles,
        activePerspective: mockUser.activePerspective,
        type: 'access',
        id: 'jti-new-access',
      });
      const newRefreshToken = jwtService.sign({
        userId: mockUser.id,
        type: 'refresh',
        id: 'jti-new-refresh',
      });

      mockAuthService.refreshToken.mockReturnValue(
        of({
          user: mockUser,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        }),
      );

      const res = await request(app.getHttpServer())
        .post('/auth/refresh-token')
        .set('Cookie', [`refreshToken=${oldRefreshToken}`]);

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBe(newAccessToken);
      expect(res.header['set-cookie'][0]).toContain(
        `refreshToken=${newRefreshToken}`,
      );
    });

    it('should reject invalid refresh token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh-token')
        .set('Cookie', [`refreshToken=invalid-token`]);

      expect(res.status).toBe(401);
    });

    it('should logout and clear cookie', async () => {
      const jti = 'jti-logout';
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const accessToken = jwtService.sign({
        userId: mockUser.id,
        Roles: mockUser.roles,
        activePerspective: mockUser.activePerspective,
        type: 'access',
        id: jti,
        exp,
      });
      const refreshToken = jwtService.sign({
        userId: mockUser.id,
        type: 'refresh',
        id: 'jti-refresh',
      });

      mockAuthService.logout.mockReturnValue(of({ message: 'Logged out' }));

      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(res.status).toBe(201);
      expect(res.header['set-cookie'][0]).toContain('refreshToken=;'); // Cookie cleared
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUser.id,
          jti: jti,
        }),
      );
    });
  });
});
