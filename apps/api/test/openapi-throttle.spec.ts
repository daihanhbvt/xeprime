import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { collectRouteAccess, type RouteAccess } from '../src/openapi/route-access';

/**
 * Hạn mức của các CỬA DÒ — và việc tài liệu nói đúng con số đó.
 *
 * Hai lỗ hổng im lặng mà spec này canh:
 *
 *  1. **Web lỏng hơn native.** `AuthController` và `MobileAuthController` gọi CÙNG
 *     `AuthService.loginWithPassword`. Trước 07/09/2026 web không khai `@Throttle` nên rơi về mức
 *     chung 120 req/phút, trong khi native là 5 — kẻ dò mật khẩu chỉ việc đổi URL và được gấp 24
 *     lần số lần đoán. Không có bộ đếm sai mật khẩu nào phía sau (`ACCOUNT_LOCKED` chỉ phản ánh
 *     `users.status` do admin đặt), nên rate limit là lớp phòng thủ CÒN LẠI, không phải lớp phụ.
 *  2. **Tài liệu trôi khỏi decorator.** `enhance-document.ts` từng in cứng "120 request / 60 giây"
 *     cho MỌI endpoint. Nay nó đọc `route.rateLimit`, mà cái đó đọc metadata của `@nestjs/throttler`
 *     bằng các chuỗi khoá chép tay (`THROTTLER:LIMITdefault`…). Bản nâng cấp nào đổi khoá sẽ làm
 *     `rateLimit` lặng lẽ thành `null` và tài liệu quay về nói 120 — case đầu tiên dưới đây đỏ.
 *
 * Chạy ở `preview: true`: chỉ quét metadata, không đụng DB.
 */

/** Cửa dò và mức phải giữ. Đổi số ở đây là một quyết định, không phải một lần gõ nhầm. */
const EXPECTED_LIMIT: Readonly<Record<string, number>> = {
  // Đăng nhập bằng mật khẩu — web và native phải BẰNG NHAU.
  AuthController_login: 5,
  MobileAuthController_login: 5,
  // Đăng ký: dò `PHONE_TAKEN` để biết số nào đã có tài khoản.
  AuthController_register: 5,
  MobileAuthController_register: 5,
  // Quên mật khẩu: mỗi request gửi một email tới địa chỉ do người gọi nhập.
  AuthController_forgotPassword: 5,
  AuthController_resetPassword: 10,
};

let app: INestApplication;
let access: Map<string, RouteAccess>;

beforeAll(async () => {
  app = await NestFactory.create(AppModule, { preview: true, logger: false });
  access = collectRouteAccess(app);
}, 120_000);

afterAll(async () => {
  await app?.close();
});

describe('hạn mức của các cửa dò', () => {
  it.each(Object.entries(EXPECTED_LIMIT))('%s giới hạn %i request/phút', (operationId, limit) => {
    const route = access.get(operationId);
    expect(route).toBeDefined();
    expect(route!.rateLimit).toEqual({ kind: 'custom', limit, ttlMs: 60_000 });
  });

  it('web và native dùng CÙNG mức cho mọi cặp endpoint song sinh', () => {
    // So theo cặp chứ không theo con số: mai này hạ cả hai xuống 3 thì spec vẫn đúng, còn hạ
    // MỘT bên thì đỏ — đó mới là thứ cần canh.
    for (const [web, native] of [
      ['AuthController_login', 'MobileAuthController_login'],
      ['AuthController_register', 'MobileAuthController_register'],
    ] as const) {
      expect(access.get(web)?.rateLimit).toEqual(access.get(native)?.rateLimit);
    }
  });

  it('webhook SePay đứng NGOÀI throttler một cách tường minh (ADR 0022 ràng buộc 4)', () => {
    // SePay bắn dồn khi retry; chặn nó là tự trì hoãn tiền của chính mình. Khoá webhook so
    // time-safe mới là cửa thật.
    expect(access.get('SepayController_webhook')?.rateLimit).toEqual({ kind: 'skipped' });
  });

  it('endpoint thường không khai gì ⇒ rơi về mức chung', () => {
    expect(access.get('HealthController_check')?.rateLimit).toBeNull();
  });
});
