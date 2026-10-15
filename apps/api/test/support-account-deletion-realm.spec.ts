import { ConfigService } from '@nestjs/config';
import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  Injectable,
} from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  SUPPORT_CASE_CATEGORY,
  type AccountRealm,
} from '@xeprime/types';
import request from 'supertest';

import { createValidationPipe } from '../src/bootstrap';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { RealmGuard } from '../src/common/guards/realm.guard';
import { SupportRequestStore } from '../src/common/support/support-request.store';
import type { RequestContext } from '../src/common/types/request-context';
import { AppConfigService } from '../src/modules/app-config/app-config.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import { CustomerSupportController } from '../src/modules/support/customer-support.controller';
import { SupportService } from '../src/modules/support/support.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { PrismaService as PrismaServiceToken } from '../src/prisma/prisma.service';

/**
 * Yêu cầu xoá tài khoản ở MỌI realm có tài khoản người dùng (05/10/2026).
 *
 * Từ ADR 0053 tài khoản partner là tài khoản riêng — và nó từng KHÔNG có đường nào gửi yêu cầu đóng
 * tài khoản của mình: `/me/support/cases` chỉ khai realm `customer`, nên trang Tài khoản & bảo mật
 * của site partner nhận 403 lệch realm. Bộ này khoá cả hai nửa của bản sửa, qua `RealmGuard` THẬT:
 *
 *  1. Đối tác mở / đọc / rút được yêu cầu xoá tài khoản của chính mình.
 *  2. Đối tác KHÔNG mở được loại yêu cầu nào khác ở hộp thư cá nhân — hỗ trợ vận hành đi qua
 *     `/support/cases` của gian hàng. Khách thì không đổi gì; nhân sự nền tảng vẫn bị chặn.
 */

const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

/** Xác thực giả — realm đọc từ DB như `AuthGuard` thật (ADR 0053). */
@Injectable()
class HeaderAuthGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    const userId = req.headers['x-test-user'];
    if (typeof userId === 'string') {
      const { realm } = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { realm: true },
      });
      req.realm = realm as AccountRealm;
      req.user = {
        id: userId,
        realm: realm as AccountRealm,
        transport: 'cookie',
        displayName: 'test',
        email: null,
        phoneVerified: true,
        sessionId: 'SESSION-DEL',
      };
    }
    return true;
  }
}

/**
 * Thông báo không thuộc phạm vi bộ này — mọi lời gọi là no-op. `then` phải là `undefined`: Nest
 * `await` giá trị provider, và một `then` là hàm biến nó thành thenable không bao giờ resolve.
 */
const silentNotifications = new Proxy(
  {},
  { get: (_target, prop) => (prop === 'then' ? undefined : async () => undefined) },
);

const ids = { partner: newId(), customer: newId(), staff: newId() };
let dbAvailable = false;
let app: INestApplication;

const as = (userId: string) => ({ 'x-test-user': userId });
const server = () => app.getHttpServer();
const deletionBody = {
  category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
  subject: 'Yêu cầu xoá tài khoản',
  description: 'Tôi muốn đóng tài khoản này.',
};
/** Một yêu cầu hỗ trợ THƯỜNG (không phải xoá tài khoản), đủ độ dài DTO đòi. */
const accountQuestion = {
  category: SUPPORT_CASE_CATEGORY.ACCOUNT,
  subject: 'Không đăng nhập được',
  description: 'Tôi không nhận được mã OTP khi đăng nhập.',
};

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    if (process.env.REQUIRE_DB === '1') throw new Error('Cần PostgreSQL ở TEST_DATABASE_URL');
    console.warn('\n[skip] Không kết nối được PostgreSQL.\n');
    return;
  }

  const realms: Record<keyof typeof ids, AccountRealm> = {
    partner: ACCOUNT_REALM.PARTNER,
    customer: ACCOUNT_REALM.CUSTOMER,
    staff: ACCOUNT_REALM.PLATFORM,
  };
  for (const [key, id] of Object.entries(ids) as [keyof typeof ids, string][]) {
    await prisma.user.create({
      data: { id, realm: realms[key], displayName: key, email: `del-${id}@xeprime.test` },
    });
  }

  const store = new SupportRequestStore();
  const audit = new AuditService(asService, store);
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomerSupportController],
    providers: [
      Reflector,
      { provide: PrismaServiceToken, useValue: asService },
      { provide: AuditService, useValue: audit },
      { provide: NotificationService, useValue: silentNotifications },
      { provide: AppConfigService, useValue: new AppConfigService(asService, audit, new ConfigService()) },
      SupportService,
      { provide: APP_GUARD, useClass: HeaderAuthGuard },
      { provide: APP_GUARD, useClass: RealmGuard },
    ],
  }).compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(false));
  await app.init();
}, 60_000);

afterAll(async () => {
  if (dbAvailable) {
    const userIds = Object.values(ids);
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.supportCase.deleteMany({ where: { openedByUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app?.close();
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Yêu cầu xoá tài khoản — tài khoản đối tác', () => {
  maybe('mở được, thấy được trong danh sách của mình, và rút được', async () => {
    const opened = await request(server())
      .post('/me/support/cases')
      .set(as(ids.partner))
      .send(deletionBody);
    expect(opened.status).toBe(201);
    expect(opened.body.category).toBe(SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION);

    const list = await request(server())
      .get('/me/support/cases')
      .query({ category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION, limit: 1 })
      .set(as(ids.partner));
    expect(list.status).toBe(200);
    expect(list.body.data[0].id).toBe(opened.body.id);

    const withdrawn = await request(server())
      .post(`/me/support/cases/${opened.body.id}/withdraw`)
      .set(as(ids.partner));
    expect(withdrawn.status).toBe(200);
  });

  maybe('KHÔNG mở được loại yêu cầu khác ở hộp thư cá nhân', async () => {
    const res = await request(server())
      .post('/me/support/cases')
      .set(as(ids.partner))
      .send(accountQuestion);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(API_ERROR_CODE.SUPPORT_CASE_CATEGORY_NOT_ALLOWED);
    expect(
      await prisma.supportCase.count({
        where: { openedByUserId: ids.partner, category: SUPPORT_CASE_CATEGORY.ACCOUNT },
      }),
    ).toBe(0);
  });
});

describe('Yêu cầu xoá tài khoản — các realm khác không đổi', () => {
  maybe('khách vẫn mở được yêu cầu hỗ trợ thường', async () => {
    const res = await request(server())
      .post('/me/support/cases')
      .set(as(ids.customer))
      .send(accountQuestion);
    expect(res.status).toBe(201);
  });

  maybe('nhân sự nền tảng bị chặn ở ranh giới realm', async () => {
    const res = await request(server())
      .post('/me/support/cases')
      .set(as(ids.staff))
      .send(deletionBody);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(API_ERROR_CODE.REALM_NOT_ALLOWED);
  });
});
