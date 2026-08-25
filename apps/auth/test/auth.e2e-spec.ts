import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import cookieParser from 'cookie-parser';
import { DataSource } from 'typeorm';
import { Msg91Service } from 'apps/common/src/msg91.service';
import { TransformInterceptor } from 'apps/common/src/transform.interceptor';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let refreshToken: string;

  // Mock Msg91Service to avoid real SMS calls and allow predictable testing
  const mockMsg91Service = {
    sendOtp: jest.fn().mockResolvedValue({ type: 'success' }),
    verifyOtp: jest.fn().mockResolvedValue({ type: 'success' }),
  };

  beforeAll(async () => {
    jest.setTimeout(60000);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Msg91Service)
      .useValue(mockMsg91Service)
      .compile();

    app = moduleFixture.createNestApplication();

    // Essential Middlewares & Pipes (Matching Main.ts)
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    dataSource = moduleFixture.get<DataSource>(DataSource);
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Database Cleanup: Truncate tables before each test for a "Clean Slate"
    const entities = dataSource.entityMetadatas;
    for (const entity of entities) {
      const repository = dataSource.getRepository(entity.name);
      await repository.query(
        `TRUNCATE "${entity.tableName}" RESTART IDENTITY CASCADE;`,
      );
    }
    jest.clearAllMocks();
  });

  describe('Passenger Journey: Authentication Lifecycle', () => {
    const mobile = '+918409253381';
    const otp = '7895';

    it('should register/login, refresh token, and logout successfully', async () => {
      // 1. Send OTP
      const sendOtpRes = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ mobile });

      expect(sendOtpRes.status).toBe(200);
      expect(sendOtpRes.body.success).toBe(true);

      // 2. Verify OTP (Login)
      const verifyOtpRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .set('User-Agent', 'supertest-agent')
        .send({ mobile, otp });

      expect(verifyOtpRes.status).toBe(200);
      expect(verifyOtpRes.body.data.accessToken).toBeDefined();
      expect(verifyOtpRes.header['set-cookie']).toBeDefined();

      accessToken = verifyOtpRes.body.data.accessToken;
      refreshToken = verifyOtpRes.header['set-cookie'][0]
        .split(';')[0]
        .split('=')[1];

      // 3. Refresh Token (Rotation)
      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('User-Agent', 'supertest-agent')
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.accessToken).not.toBe(accessToken); // Should be new

      accessToken = refreshRes.body.data.accessToken;
      refreshToken = refreshRes.header['set-cookie'][0]
        .split(';')[0]
        .split('=')[1];

      // 4. Get Profile (Verify Access Token works)
      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.mobile).toBe(mobile);

      // 5. Logout
      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Cookie', [`refreshToken=${refreshToken}`]);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.data.message).toContain('successfully');

      // 6. Blacklist Verification: Used token should now fail
      const invalidMeRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(invalidMeRes.status).toBe(401);
    });

    it('should invalidate all sessions on logout-all', async () => {
      // Login first
      const verifyOtpRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .set('User-Agent', 'supertest-agent')
        .send({ mobile, otp });
      const token = verifyOtpRes.body.data.accessToken;

      // Call logout-all
      const logoutAllRes = await request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutAllRes.status).toBe(200);

      // Verify token is blacklisted
      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(401);
    });
  });

  describe('User Management: Profile & Perspectives', () => {
    it('should update profile and switch perspective correctly', async () => {
      // 1. Login
      const loginRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .set('User-Agent', 'supertest-agent')
        .send({ mobile: '+918409253381', otp: '7895' });

      let token = loginRes.body.data.accessToken;

      // 2. Update Profile Name
      const updateMeRes = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Ashif' });

      expect(updateMeRes.status).toBe(200);
      expect(updateMeRes.body.data.user.name).toBe('Ashif');

      token = updateMeRes.body.data.accessToken;

      // 3. Add VEHICLE_OWNER role
      const addRoleRes = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ roles: ['PASSENGER', 'VEHICLE_OWNER'] });

      expect(addRoleRes.status).toBe(200);
      token = addRoleRes.body.data.accessToken;
      expect(addRoleRes.body.data.user.roles).toContain('VEHICLE_OWNER');

      // 4. Switch Perspective
      const switchRes = await request(app.getHttpServer())
        .patch('/auth/switch-perspective')
        .set('Authorization', `Bearer ${token}`)
        .send({ perspective: 'VEHICLE_OWNER' });

      expect(switchRes.status).toBe(200);
      expect(switchRes.body.data.user.activePerspective).toBe('VEHICLE_OWNER');
      expect(switchRes.body.data.accessToken).toBeDefined();
    });
  });
});
