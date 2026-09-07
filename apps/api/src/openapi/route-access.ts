import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { Permission, PlanFeature } from '@xeprime/types';
import {
  FEATURE_READ_SAFE_KEY,
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  PLAN_FEATURE_KEY,
  PLATFORM_ONLY_KEY,
  TENANT_SCOPED_KEY,
  VERIFIES_CREDENTIALS_KEY,
} from '../common/decorators';

/** Điều kiện truy cập thật sự của một route, đọc từ metadata mà guard đang dùng. */
export interface RouteAccess {
  readonly controller: string;
  readonly handler: string;
  readonly isPublic: boolean;
  /** Public nhưng tự kiểm credential ⇒ trả 401 được. Xem `@VerifiesCredentials`. */
  readonly verifiesCredentials: boolean;
  readonly permissions: readonly Permission[];
  readonly tenantScoped: boolean;
  readonly platformOnly: boolean;
  /**
   * Tính năng nâng cao gác route này (ADR 0027) — `null` = bậc cơ bản, không gói nào chặn.
   *
   * Đây vừa là thứ `PlanFeatureGuard` thi hành lúc chạy, vừa là nguồn sinh nhánh 403 trong tài
   * liệu, vừa là thứ `plan-feature-coverage.spec.ts` duyệt để bắt một endpoint mới thiếu marker.
   */
  readonly feature: PlanFeature | null;
  /** Route hình-đọc dù không phải GET — xem `@FeatureReadSafe()`. */
  readonly featureReadSafe: boolean;
  /**
   * Hạn mức riêng của route, đọc từ metadata `@Throttle`/`@SkipThrottle`.
   *
   * `null` = không khai gì ⇒ rơi về mức chung của `ThrottlerModule.forRoot` trong `app.module.ts`.
   * Đọc metadata thay vì chép số vào docs vì đúng lý do đã ghi ở docblock của file: một con số
   * viết tay trong tài liệu sẽ trôi khỏi decorator, và cửa đăng nhập là chỗ tệ nhất để tài liệu
   * nói 120 trong khi thực tế là 5.
   */
  readonly rateLimit: RouteRateLimit | null;
}

/** `skipped` = `@SkipThrottle()` (vd webhook SePay — ADR 0022 ràng buộc 4). */
export type RouteRateLimit = { readonly kind: 'skipped' } | { readonly kind: 'custom'; readonly limit: number; readonly ttlMs: number };

/**
 * Quét toàn bộ controller và trả về bản đồ `operationId → điều kiện truy cập`.
 *
 * Vì sao đọc metadata thay vì bắt mỗi controller gắn thêm `@ApiCookieAuth`/`@ApiForbiddenResponse`:
 * tài liệu viết tay và guard sẽ trôi khỏi nhau. Ở đây `@Public`, `@RequirePermissions`,
 * `@TenantScoped`, `@PlatformOnly` vừa là thứ guard thi hành lúc chạy vừa là nguồn sinh tài liệu
 * — sửa quyền là docs đổi theo, không thể lệch.
 *
 * Khoá bản đồ dựng theo `operationIdFactory` mặc định của `@nestjs/swagger`
 * (`TênController_tênMethod`). `enhanceOpenApiDocument` sẽ ném lỗi nếu có operation không khớp
 * khoá nào, nên nếu Nest đổi quy ước sinh id thì build gãy ngay chứ không âm thầm mất security.
 */
export function collectRouteAccess(app: INestApplication): Map<string, RouteAccess> {
  const map = new Map<string, RouteAccess>();

  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      // Preview mode không tạo instance, nhưng `metatype` (class) vẫn còn — metadata nằm ở class.
      if (typeof controller !== 'function') continue;

      const prototype: object = controller.prototype as object;

      for (const handlerName of Object.getOwnPropertyNames(prototype)) {
        if (handlerName === 'constructor') continue;

        // Không dùng `prototype[name]`: getter trên prototype sẽ bị GỌI và có thể ném lỗi.
        const descriptor = Object.getOwnPropertyDescriptor(prototype, handlerName);
        const handler: unknown = descriptor?.value;
        if (typeof handler !== 'function') continue;

        map.set(`${controller.name}_${handlerName}`, {
          controller: controller.name,
          handler: handlerName,
          isPublic: readFlag(IS_PUBLIC_KEY, handler, controller),
          verifiesCredentials: readFlag(VERIFIES_CREDENTIALS_KEY, handler, controller),
          permissions: readPermissions(handler, controller),
          tenantScoped: readFlag(TENANT_SCOPED_KEY, handler, controller),
          platformOnly: readFlag(PLATFORM_ONLY_KEY, handler, controller),
          feature: readFeature(handler, controller),
          featureReadSafe: readFlag(FEATURE_READ_SAFE_KEY, handler, controller),
          rateLimit: readRateLimit(handler, controller),
        });
      }
    }
  }

  return map;
}

/*
 * Khoá metadata của `@nestjs/throttler` v6: `Throttle`/`SkipThrottle` ghi `<KHOÁ><tên hạn mức>`
 * (xem `throttler.decorator.js`). Cả repo chỉ dùng hạn mức tên `default`.
 *
 * Chép ba chuỗi này thay vì import từ `@nestjs/throttler/dist/throttler.constants`: đó là đường
 * dẫn nội bộ, không nằm trong `exports` của package, và một bản nâng cấp đổi cấu trúc `dist` sẽ
 * làm gãy build vì một dòng tài liệu. Chuỗi sai thì `openapi-throttle.spec.ts` đỏ ngay.
 */
const THROTTLER_LIMIT_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_KEY = 'THROTTLER:TTLdefault';
const THROTTLER_SKIP_KEY = 'THROTTLER:SKIPdefault';

/** Method thắng class — đúng `getAllAndOverride` mà `ThrottlerGuard` dùng lúc chạy. */
function readRateLimit(handler: unknown, controller: unknown): RouteRateLimit | null {
  for (const target of [handler, controller] as object[]) {
    if (Reflect.getMetadata(THROTTLER_SKIP_KEY, target) === true) return { kind: 'skipped' };

    const limit: unknown = Reflect.getMetadata(THROTTLER_LIMIT_KEY, target);
    const ttl: unknown = Reflect.getMetadata(THROTTLER_TTL_KEY, target);
    // Hạn mức khai bằng hàm (`(ctx) => n`) không rút ra được một con số cho tài liệu — bỏ qua,
    // để route đó hiện mức chung thay vì in ra một con số bịa.
    if (typeof limit === 'number' && typeof ttl === 'number') {
      return { kind: 'custom', limit, ttlMs: ttl };
    }
  }
  return null;
}

/** Marker ở method thắng marker ở controller — đúng thứ tự `Reflector.getAllAndOverride` của guard. */
function readFlag(key: string, handler: unknown, controller: unknown): boolean {
  return Reflect.getMetadata(key, handler as object) === true ||
    Reflect.getMetadata(key, controller as object) === true;
}

/**
 * Marker ở method thắng marker ở class — đúng `getAllAndOverride` của guard.
 *
 * Nhờ vậy một controller gắn `@RequiresFeature` ở class vẫn CHỪA được ngoại lệ: route nào cần
 * mở cho bậc cơ bản thì override ở method. Ngoại lệ nằm ở metadata nên nó hiện trong
 * `route-access` và bị test coverage nhìn thấy — không giấu được trong service.
 */
function readFeature(handler: unknown, controller: unknown): PlanFeature | null {
  const fromHandler = Reflect.getMetadata(PLAN_FEATURE_KEY, handler as object) as
    | PlanFeature
    | undefined;
  if (fromHandler) return fromHandler;
  return (Reflect.getMetadata(PLAN_FEATURE_KEY, controller as object) as PlanFeature) ?? null;
}

function readPermissions(handler: unknown, controller: unknown): readonly Permission[] {
  const fromHandler = Reflect.getMetadata(PERMISSIONS_KEY, handler as object) as
    | Permission[]
    | undefined;
  if (fromHandler?.length) return fromHandler;

  const fromController = Reflect.getMetadata(PERMISSIONS_KEY, controller as object) as
    | Permission[]
    | undefined;
  return fromController ?? [];
}
