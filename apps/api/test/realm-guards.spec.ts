import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  SUPPORT_CAPABILITY,
  SUPPORT_CONTEXT_HEADER,
  type AccountRealm,
} from '@xeprime/types';
import { Public, Realms, SupportAction } from '../src/common/decorators';
import { OriginGuard } from '../src/common/guards/origin.guard';
import { RealmGuard } from '../src/common/guards/realm.guard';
import type { RequestContext } from '../src/common/types/request-context';
import { RequestRealmService } from '../src/modules/auth/request-realm.service';

/**
 * Hai guard ranh giới của ADR 0053 — unit thuần, không DB.
 *
 *  - `RealmGuard`: mỗi route khai realm phục vụ; mặc định TỪ CHỐI; ngoại lệ duy nhất là phiên hỗ
 *    trợ gian hàng của nhân sự nền tảng (ADR 0050) trên handler có `@SupportAction`.
 *  - `OriginGuard`: request ghi bằng cookie phải đến từ ĐÚNG site của realm — ba site cùng là một
 *    "site" theo SameSite, nên cookie `lax` vẫn đi kèm một POST chéo site; chỉ phép so origin chặn.
 */
const C = ACCOUNT_REALM.CUSTOMER;
const P = ACCOUNT_REALM.PARTNER;
const PL = ACCOUNT_REALM.PLATFORM;

/** Controller giả — metadata đặt bằng CHÍNH decorator production. */
@Realms(C)
class CustomerController {
  book() {}
  @Public()
  publicPreview() {}
}

@Realms(P)
class PartnerController {
  list() {}
  @SupportAction(SUPPORT_CAPABILITY.VEHICLE_VIEW)
  supportedList() {}
}

class UndeclaredController {
  anything() {}
}

function ctxFor(
  controller: new () => object,
  handler: string,
  req: Partial<RequestContext>,
): ExecutionContext {
  const proto = controller.prototype as Record<string, () => void>;
  return {
    getType: () => 'http',
    getHandler: () => proto[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: <T>() => ({ headers: {}, ...req }) as T }),
  } as unknown as ExecutionContext;
}

function user(realm: AccountRealm, transport: 'cookie' | 'bearer' = 'cookie') {
  return {
    id: '01J00000000000000000000USR',
    realm,
    displayName: 'u',
    email: null,
    phoneVerified: true,
    sessionId: 'S',
    transport,
  };
}

function expectForbidden(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code });
    return;
  }
  throw new Error(`Mong đợi 403 ${code} nhưng guard cho qua`);
}

describe('RealmGuard', () => {
  const guard = new RealmGuard(new Reflector());

  it('route KHÔNG khai @Realms ⇒ từ chối (mặc định đóng)', () => {
    expectForbidden(
      () => guard.canActivate(ctxFor(UndeclaredController, 'anything', { user: user(C) })),
      API_ERROR_CODE.REALM_NOT_ALLOWED,
    );
  });

  it('tài khoản đúng realm ⇒ qua', () => {
    expect(guard.canActivate(ctxFor(CustomerController, 'book', { user: user(C) }))).toBe(true);
  });

  it('tài khoản partner gọi route chỉ của khách ⇒ REALM_NOT_ALLOWED', () => {
    expectForbidden(
      () => guard.canActivate(ctxFor(CustomerController, 'book', { user: user(P) })),
      API_ERROR_CODE.REALM_NOT_ALLOWED,
    );
  });

  it('route công khai: site partner gọi chức năng chỉ có ở site khách ⇒ từ chối', () => {
    expectForbidden(
      () => guard.canActivate(ctxFor(CustomerController, 'publicPreview', { realm: P })),
      API_ERROR_CODE.REALM_NOT_ALLOWED,
    );
  });

  it('route công khai gọi từ app native (không có realm site) ⇒ đi tiếp như cũ', () => {
    expect(guard.canActivate(ctxFor(CustomerController, 'publicPreview', {}))).toBe(true);
  });

  describe('phiên hỗ trợ gian hàng (ADR 0050)', () => {
    const supportHeaders = { [SUPPORT_CONTEXT_HEADER]: '01J0000000000000000000CTX' };

    it('nhân sự nền tảng + x-support-context + handler @SupportAction ⇒ tới được cổng kiểm phiên', () => {
      expect(
        guard.canActivate(
          ctxFor(PartnerController, 'supportedList', { user: user(PL), headers: supportHeaders }),
        ),
      ).toBe(true);
    });

    it('thiếu @SupportAction ở handler ⇒ từ chối dù có header', () => {
      expectForbidden(
        () =>
          guard.canActivate(
            ctxFor(PartnerController, 'list', { user: user(PL), headers: supportHeaders }),
          ),
        API_ERROR_CODE.REALM_NOT_ALLOWED,
      );
    });

    it('thiếu header phiên hỗ trợ ⇒ từ chối', () => {
      expectForbidden(
        () => guard.canActivate(ctxFor(PartnerController, 'supportedList', { user: user(PL) })),
        API_ERROR_CODE.REALM_NOT_ALLOWED,
      );
    });

    it('tài khoản KHÁCH mang header hỗ trợ không được hưởng ngoại lệ', () => {
      expectForbidden(
        () =>
          guard.canActivate(
            ctxFor(PartnerController, 'supportedList', { user: user(C), headers: supportHeaders }),
          ),
        API_ERROR_CODE.REALM_NOT_ALLOWED,
      );
    });
  });
});

describe('OriginGuard', () => {
  function configWith(values: Record<string, unknown>): ConfigService {
    const all: Record<string, unknown> = {
      APP_WEB_URL: 'https://xeprime.vn',
      WEB_PARTNER_URL: 'https://partner.xeprime.vn',
      WEB_ADMIN_URL: 'https://admin.xeprime.vn',
      NODE_ENV: 'production',
      CORS_ORIGINS: ['https://xeprime.vn', 'https://partner.xeprime.vn'],
      ...values,
    };
    return {
      get: (key: string) => all[key],
      getOrThrow: (key: string) => {
        if (all[key] === undefined) throw new Error(`missing ${key}`);
        return all[key];
      },
    } as unknown as ConfigService;
  }
  function guardWith(values: Record<string, unknown> = {}): OriginGuard {
    const config = configWith(values);
    return new OriginGuard(new RequestRealmService(config), config);
  }
  const post = (realm: AccountRealm, headers: Record<string, string>, transport?: 'bearer') =>
    ctxFor(PartnerController, 'list', {
      method: 'POST',
      user: user(realm, transport),
      headers,
    });

  it('POST bằng cookie từ đúng site của realm ⇒ qua', () => {
    expect(guardWith().canActivate(post(P, { origin: 'https://partner.xeprime.vn' }))).toBe(true);
  });

  it('cookie partner bị một trang ở xeprime.vn bắn POST sang ⇒ ORIGIN_NOT_ALLOWED', () => {
    expectForbidden(
      () => guardWith().canActivate(post(P, { origin: 'https://xeprime.vn' })),
      API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
    );
  });

  it('không có Origin thì đọc Referer; thiếu cả hai ⇒ từ chối', () => {
    expect(
      guardWith().canActivate(post(PL, { referer: 'https://admin.xeprime.vn/admin/users?x=1' })),
    ).toBe(true);
    expectForbidden(() => guardWith().canActivate(post(PL, {})), API_ERROR_CODE.ORIGIN_NOT_ALLOWED);
    expectForbidden(
      () => guardWith().canActivate(post(PL, { origin: 'null' })),
      API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
    );
  });

  it('GET không bị chặn; Bearer (app native) không có CSRF để chặn', () => {
    const get = ctxFor(PartnerController, 'list', { method: 'GET', user: user(P), headers: {} });
    expect(guardWith().canActivate(get)).toBe(true);
    expect(guardWith().canActivate(post(P, {}, 'bearer'))).toBe(true);
  });

  it('production KHÔNG nhận origin chỉ vì nó có trong CORS_ORIGINS', () => {
    expectForbidden(
      () => guardWith().canActivate(post(C, { origin: 'https://partner.xeprime.vn' })),
      API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
    );
  });

  it('máy dev nhận thêm origin LAN khai ở CORS_ORIGINS', () => {
    const dev = guardWith({
      NODE_ENV: 'development',
      APP_WEB_URL: 'http://localhost:3000',
      WEB_PARTNER_URL: 'http://localhost:3000/manage',
      CORS_ORIGINS: ['http://localhost:3000', 'http://192.168.1.210:3000'],
    });
    expect(dev.canActivate(post(P, { origin: 'http://localhost:3000' }))).toBe(true);
    expect(dev.canActivate(post(P, { origin: 'http://192.168.1.210:3000' }))).toBe(true);
    expectForbidden(
      () => dev.canActivate(post(P, { origin: 'http://evil.test' })),
      API_ERROR_CODE.ORIGIN_NOT_ALLOWED,
    );
  });
});
