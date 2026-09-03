import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODE,
  FEATURE_STATE,
  PLAN_FEATURE_LABEL,
  canWriteFeature,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { FEATURE_READ_SAFE_KEY, PLAN_FEATURE_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/** Method KHÔNG đổi dữ liệu — `read_only` vẫn phải trả về bình thường (ADR 0027 ràng buộc 4). */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Trục NĂNG LỰC theo gói — ADR 0027 điều 4: "chặn ở SERVER là chính, ẩn menu chỉ là trang trí".
 *
 * ⚠️ **Đăng ký CUỐI CÙNG, SAU `PermissionGuard`** (app.module.ts). Thứ tự này là một quyết định
 * về thông tin, không phải về hiệu năng: một `shop_staff` KHÔNG có `finance.view`, ở một gian
 * hàng chưa mua gói, phải nhận `MISSING_PERMISSION` — chứ không phải `FEATURE_NOT_IN_PLAN`.
 * Tình trạng gói của gian hàng không phải thứ một người không có quyền được biết. Quyền trả lời
 * "anh là ai" trước; gói trả lời "gian hàng này có gì" sau.
 *
 * Ba lối cho qua, theo thứ tự:
 *  1. **Không metadata** → qua. Opt-in, y như `@TenantScoped()` — bậc cơ bản không bị gói chặn.
 *  2. **`req.platform`** → qua. Nhân sự nền tảng đi hỗ trợ không bị gói của tenant chặn.
 *  3. **`req.tenant` vắng** → qua. Không có scope thì `TenantScopeGuard` đã ném rồi; ở đây mà
 *     ném nữa là đổi mã lỗi của một tình huống khác hẳn.
 *
 * Guard KHÔNG inject `BillingService` và KHÔNG truy vấn gì: `req.tenant.features` do
 * `TenantScopeGuard` giải sẵn trong chính lượt truy vấn membership. Thêm một query mỗi request
 * sẽ đẻ ra nhu cầu cache — mà cache chính là thứ phá ADR 0027 điều 5 (gia hạn xong mở lại NGAY).
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  private readonly logger = new Logger(PlanFeatureGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<PlanFeature>(PLAN_FEATURE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!feature) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (req.platform) return true;
    if (!req.tenant) return true;

    const state: FeatureState = req.tenant.features[feature] ?? FEATURE_STATE.HIDDEN;
    if (state === FEATURE_STATE.ENABLED) return true;

    const isRead =
      READ_METHODS.has(req.method) ||
      this.reflector.getAllAndOverride<boolean>(FEATURE_READ_SAFE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) === true;

    // `read_only` + đọc = đường đi bình thường của một gian hàng hết hạn gói. Đây LÀ tính năng,
    // không phải một ngoại lệ được nới: "không ai mất quyền xem sổ sách của chính mình".
    if (state === FEATURE_STATE.READ_ONLY && isRead) return true;

    const denial =
      state === FEATURE_STATE.READ_ONLY
        ? {
            code: API_ERROR_CODE.FEATURE_READ_ONLY,
            message: `Gói đã hết hạn — "${PLAN_FEATURE_LABEL[feature]}" đang ở chế độ chỉ xem`,
            details: { feature, planEndsAt: req.tenant.planEndsAt },
          }
        : {
            code: API_ERROR_CODE.FEATURE_NOT_IN_PLAN,
            message: `"${PLAN_FEATURE_LABEL[feature]}" thuộc gói dịch vụ mà gian hàng chưa có`,
            details: { feature },
          };

    /*
     * Chế độ THI HÀNH — `off` / `warn` / `on`.
     *
     * `warn` là mặc định và là lý do đợt này ship được an toàn: nó ghi ra CHÍNH XÁC ai sẽ bị
     * chặn khi bật `on`, mà chưa chặn ai. Bật `on` trước khi log im là khoá sổ sách của toàn bộ
     * gian hàng đang dùng thật trong một lần deploy.
     */
    const mode = this.config.get<string>('PLAN_FEATURE_ENFORCEMENT') ?? 'warn';
    if (mode === 'off') return true;
    if (mode === 'warn') {
      this.logger.warn({
        msg: 'plan-feature: sẽ bị chặn khi PLAN_FEATURE_ENFORCEMENT=on',
        tenantId: req.tenant.tenantId,
        planCode: req.tenant.planCode,
        feature,
        state,
        method: req.method,
        path: req.originalUrl ?? req.url,
        code: denial.code,
      });
      return true;
    }

    throw new ForbiddenException(denial);
  }
}

/** Đọc-hay-ghi theo đúng luật của guard — interceptor dùng lại để không có định nghĩa thứ hai. */
export function isFeatureWriteMethod(method: string): boolean {
  return !READ_METHODS.has(method);
}

/** Trạng thái có cho phép GHI không — chỉ `enabled`. Đặt tên lại cho chỗ gọi đọc rõ ý. */
export const featureAllowsWrite = canWriteFeature;
