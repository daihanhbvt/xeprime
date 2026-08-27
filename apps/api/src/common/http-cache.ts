import {
  Injectable,
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * `Cache-Control` cho các endpoint CÔNG KHAI, chỉ đọc — dùng `@PublicCache(seconds)`.
 *
 * Ba con số trong header, mỗi con số một việc:
 *   - `max-age=0` — TRÌNH DUYỆT không tự giữ bản cũ. Khách bấm quay lại sau khi đặt xe phải
 *     thấy dữ liệu mới, và người dùng cuối là bên duy nhất nhận ra sự khác biệt đó.
 *   - `s-maxage=N` — proxy/CDN dùng chung ĐƯỢC giữ N giây. Đây mới là chỗ có tác dụng: 500 khách
 *     mở cùng một trang chợ trong một phút chỉ tạo ra một lượt chạm API.
 *   - `stale-while-revalidate` — hết hạn thì vẫn phục vụ bản cũ trong lúc lấy bản mới ở nền, nên
 *     không có khoảnh khắc mọi request cùng dồn về origin.
 *
 * Số giây lấy từ `PUBLIC_CACHE_SECONDS` (`@xeprime/types`) — CÙNG bảng số mà web dùng cho
 * `next.revalidate`, sửa một chỗ là hai tầng cùng đổi.
 *
 * Vì sao là interceptor chứ không phải `@Header(...)`: Nest set custom header TRƯỚC khi handler
 * chạy, nên `@Header` dán `s-maxage` lên cả response LỖI — một cú 500 thoáng qua (DB nấc vài
 * giây) sẽ được CDN giữ làm bản "tốt" suốt N giây + cửa sổ stale-while-revalidate, một 404 của
 * slug vừa được duyệt cũng đóng băng thêm N giây. Interceptor chỉ chạm response khi handler
 * resolve; nhánh lỗi đi qua `AllExceptionsFilter`, nơi ép `Cache-Control: no-store`.
 *
 * Chỉ dùng cho endpoint gắn `@Public()` và KHÔNG đọc cookie/session. Một endpoint đọc danh tính
 * người dùng mà mang `public` là lỗi lộ dữ liệu ở tầng proxy, không phải một tinh chỉnh hiệu năng.
 */
const CACHE_CONTROL_METADATA = 'xp:cache-control';

/** Header cho response lỗi và cho mọi chỗ cần nói rõ "không cache" — filter lỗi dùng chung. */
export const NO_STORE_CACHE_CONTROL = 'no-store';

/** Đánh dấu route công khai được cache dùng chung `sMaxAgeSeconds` giây (chỉ khi thành công). */
export function PublicCache(sMaxAgeSeconds: number): MethodDecorator & ClassDecorator {
  return SetMetadata(
    CACHE_CONTROL_METADATA,
    `public, max-age=0, s-maxage=${sMaxAgeSeconds}, stale-while-revalidate=${sMaxAgeSeconds * 2}`,
  );
}

/**
 * Set `Cache-Control` khai bởi `@PublicCache` — đăng ký global (app.module), không có metadata
 * thì bỏ qua ngay nên các route còn lại không tốn gì.
 */
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const cacheControl = this.reflector.getAllAndOverride<string | undefined>(
      CACHE_CONTROL_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (!cacheControl) return next.handle();
    return next.handle().pipe(
      // `tap` chỉ chạy khi handler resolve — handler ném lỗi thì header không bao giờ được set.
      tap(() => {
        context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', cacheControl);
      }),
    );
  }
}
