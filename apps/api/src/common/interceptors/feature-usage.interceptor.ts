import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_STATE, type PlanFeature } from '@xeprime/types';
import { tap, type Observable } from 'rxjs';
import { PLAN_FEATURE_KEY } from '../decorators';
import { isFeatureWriteMethod } from '../guards/plan-feature.guard';
import { PrismaService } from '../../prisma/prisma.service';
import type { RequestContext } from '../types/request-context';

/**
 * Ghi nhận "gian hàng này ĐÃ TỪNG dùng tính năng đó" — nguồn duy nhất cập nhật
 * `tenants.used_features`, và là thứ phân biệt `read_only` với `hidden` sau này (ADR 0027 điều 3).
 *
 * ⚠️ **Phải là INTERCEPTOR, không phải guard.** Guard chạy TRƯỚC `ValidationPipe`, nên ghi ở guard
 * sẽ đánh dấu "đã dùng" cho cả những request trả 400 — người dùng bấm nhầm một lần rồi bỏ, mà
 * gian hàng vĩnh viễn mang cờ đó. Hậu quả nhẹ (`hidden → read_only`) nhưng KHÔNG có đường lùi.
 *
 * Bốn điều kiện, tất cả phải đúng:
 *  1. response 2xx — `tap`'s next chỉ chạy khi handler không ném;
 *  2. route có `@RequiresFeature`;
 *  3. method là GHI — xem một trang không phải là dùng tính năng;
 *  4. trạng thái là `enabled` — `read_only` không bao giờ ghi thành công (guard đã chặn), và
 *     ghi cờ ở đó là tự nới `hidden → read_only` cho một tenant chưa từng dùng gì.
 *
 * Ghi bằng MỘT câu `UPDATE … WHERE NOT (… = ANY(used_features))`: lần thứ hai là no-op ở tầng
 * DB, không cần đọc trước, và hai request đồng thời không nhân đôi phần tử.
 *
 * Lỗi khi ghi được NUỐT có chủ đích: đây là dữ liệu phụ trợ cho một quyết định hiển thị. Làm
 * hỏng một request đã thành công vì không cập nhật được cột này là đổi một phiền toái nhỏ lấy
 * một lỗi thật cho người dùng.
 */
@Injectable()
export class FeatureUsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(FeatureUsageInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const feature = this.reflector.getAllAndOverride<PlanFeature>(PLAN_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!feature) return next.handle();

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.tenant || !isFeatureWriteMethod(req.method)) return next.handle();
    if (req.tenant.features[feature] !== FEATURE_STATE.ENABLED) return next.handle();
    if (req.tenant.usedFeatures.includes(feature)) return next.handle();

    const tenantId = req.tenant.tenantId;
    return next.handle().pipe(
      tap(() => {
        void this.markUsed(tenantId, feature);
      }),
    );
  }

  private async markUsed(tenantId: string, feature: PlanFeature): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE "tenants"
           SET "used_features" = array_append("used_features", ${feature})
         WHERE "id" = ${tenantId}
           AND NOT (${feature} = ANY ("used_features"))
      `;
    } catch (err) {
      this.logger.warn({ msg: 'không ghi được used_features', tenantId, feature, err });
    }
  }
}
