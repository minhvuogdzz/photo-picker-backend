import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { SubscriptionCron } from '../src/subscription/subscription.cron';
import { migrateUsernames } from '../src/auth/username-migration';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Resource Optimization Verifications (e2e & unit)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Showcase Edge Caching Contract', () => {
    it('GET /showcase should return 200 with Edge CDN Cache-Control headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/showcase')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(Array.isArray(response.body.data)).toBe(true);

      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toContain('public');
      expect(cacheControl).toContain('max-age=15');
      expect(cacheControl).toContain('s-maxage=60');
      expect(cacheControl).toContain('stale-while-revalidate=120');

      // Ensure aggressive no-store/no-cache headers are gone
      expect(response.headers['pragma']).toBeUndefined();
      expect(response.headers['expires']).toBeUndefined();
    });
  });

  describe('Backend Health Check Endpoint', () => {
    it('GET /health should return 200 with status ok (liveness)', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('service', 'photo-picker-backend');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');

      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toContain('no-cache');
      expect(cacheControl).toContain('no-store');
    });

    it('GET /health?readiness=true should return readiness status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health?readiness=true')
        .expect(200);

      expect(response.body).toHaveProperty('service', 'photo-picker-backend');
      expect(['ok', 'degraded']).toContain(response.body.status);
      expect(response.body).toHaveProperty('database');
    });
  });

  describe('Subscription Cron In-Process Guard', () => {
    it('handleCron() should skip execution when ENABLE_INTERNAL_CRON is not set', async () => {
      const mockPrisma = {
        subscription: {
          findMany: jest.fn(),
          update: jest.fn(),
        },
      } as any;

      const mockSync = {
        emitToUser: jest.fn(),
      } as any;

      const cron = new SubscriptionCron(mockPrisma, mockSync);
      delete process.env.ENABLE_INTERNAL_CRON;

      await cron.handleCron();

      expect(mockPrisma.subscription.findMany).not.toHaveBeenCalled();
    });

    it('lockExpiredSubscriptions() should update expired subs and emit event', async () => {
      const mockPrisma = {
        subscription: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'sub1', userId: 'u1', status: 'ACTIVE' },
          ]),
          update: jest.fn().mockResolvedValue({ id: 'sub1', status: 'EXPIRED' }),
        },
      } as any;

      const mockSync = {
        emitToUser: jest.fn(),
      } as any;

      const cron = new SubscriptionCron(mockPrisma, mockSync);
      await cron.lockExpiredSubscriptions();

      expect(mockPrisma.subscription.findMany).toHaveBeenCalled();
      expect(mockPrisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub1' },
        data: { status: 'EXPIRED' },
      });
      expect(mockSync.emitToUser).toHaveBeenCalledWith('u1', 'subscriptionExpired', {});
    });
  });

  describe('Username Migration Cold Start Optimization', () => {
    it('migrateUsernames() should return early if findFirst finds no user missing username', async () => {
      const mockPrisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn(),
          update: jest.fn(),
        },
      } as any;

      const result = await migrateUsernames(mockPrisma);

      expect(result.updatedCount).toBe(0);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ username: null }, { username: '' }],
        },
        select: { id: true },
      });
      // Crucial: findMany MUST NOT be called when no users need migration
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });
});
