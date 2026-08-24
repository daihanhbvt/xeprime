import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import type { Permission } from '@xeprime/types';
import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
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
}

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
        });
      }
    }
  }

  return map;
}

/** Marker ở method thắng marker ở controller — đúng thứ tự `Reflector.getAllAndOverride` của guard. */
function readFlag(key: string, handler: unknown, controller: unknown): boolean {
  return Reflect.getMetadata(key, handler as object) === true ||
    Reflect.getMetadata(key, controller as object) === true;
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
