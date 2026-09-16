import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  API_ERROR_CODE,
  BILLING_PHASE,
  isPackageOnboardingPending,
  tenantUsesManagePortal,
} from '@xeprime/types';
import { SUBSCRIPTION_TRACK_ONLY_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * BỘ QUẢN LÝ ĐẦY ĐỦ CHỈ DÀNH CHO GIAN HÀNG TUYẾN GÓI — ADR 0027/0028, ADR 0032 điều 6.
 *
 * ## Vì sao guard này phải tồn tại
 *
 * Trước 15/09/2026, ranh giới "tuyến hoa hồng không vào `/manage`" sống ở ĐÚNG MỘT CHỖ: một
 * nhánh render trong `AppShell.tsx`. Docblock ngay trên nhánh đó ghi rằng lớp chặn thật là
 * `@RequiresFeature` ở backend — nhưng hai điều khiến câu đó không đúng:
 *
 *  1. `req.tenant` KHÔNG mang `billingMode`, nên backend không có dữ liệu để biết tenant thuộc
 *     tuyến nào, kể cả khi muốn chặn. (Đã sửa cùng đợt này.)
 *  2. `PlanFeatureGuard` chạy ở chế độ `warn` mặc định ở **mọi cấu hình được ship** — nó ghi log
 *     rồi cho qua. Máy dev lại đặt `on` trong `.env`, nên loại lỗi này chỉ xuất hiện sau khi
 *     deploy.
 *
 * Kết quả: gọi thẳng API quản lý nâng cao từ một tài khoản tuyến hoa hồng đi lọt trên staging và
 * production. Ẩn menu không phải kiểm soát quyền.
 *
 * ## Vì sao KHÔNG đi qua `PLAN_FEATURE_ENFORCEMENT`
 *
 * Công tắc đó gác việc **hạ cấp năng lực** (ADR 0027 điều 3): nó tồn tại để một lần deploy không
 * khoá sổ thu chi của gian hàng đang dùng thật, và nó được bật dần theo `docs/deployment.md`
 * §9.4b. Ranh giới HAI TUYẾN là chuyện khác — nó là ranh giới sản phẩm, không phải một đợt
 * rollout — nên guard này chặn THẬT ngay, không có chế độ cảnh báo.
 *
 * ## Ân hạn
 *
 * `tenantUsesManagePortal` đọc `billingMode` đã qua `resolveEffectiveBilling`, nên pha `grace`
 * vẫn giữ tuyến gói ⇒ gian hàng trong ân hạn vẫn vào Manage bình thường. Đó chính là điều tin
 * nhắn vòng đời hứa với họ ("còn N ngày ân hạn"). Hết ân hạn thì `billingMode` thành
 * `commission` và cả gian hàng — chủ, quản lý, nhân viên, người xem — ra khỏi Manage cùng lúc.
 *
 * ## Ngoại lệ
 *
 * `req.platform` đi qua: nhân sự nền tảng mở Manage của một gian hàng bất kỳ là quyền đã chốt
 * (ADR 0032 điều 6), và họ đi bằng trục `platform.*` riêng.
 *
 * Đăng ký SAU `PermissionGuard`, cùng lý do về THÔNG TIN: người không có quyền vào khu đó phải
 * nhận `MISSING_PERMISSION` trước — tình trạng gói của gian hàng không phải thứ họ được biết.
 */
@Injectable()
export class SubscriptionTrackGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(SUBSCRIPTION_TRACK_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (req.platform) return true;
    // Không có scope tenant thì `TenantScopeGuard` đã ném — đổi mã lỗi ở đây là nói sai chuyện.
    if (!req.tenant) return true;

    if (tenantUsesManagePortal({ billingMode: req.tenant.billingMode })) return true;

    /*
     * GIAN HÀNG TRẢ PHÍ CHƯA THANH TOÁN — cùng câu trả lời "không", lối đi tiếp NGƯỢC HẲN
     * (ADR 0040).
     *
     * Ở backend hai tình huống trông y như nhau: không có thuê bao tuyến gói hiệu lực. Nhưng
     * `SUBSCRIPTION_TRACK_ONLY` nghĩa là "khu này không dành cho bạn, về Owner Lite", còn người
     * đang chờ đối soát thì khu này LÀ của họ — họ chỉ chưa chuyển tiền. Trả chung một mã là
     * đẩy họ về đúng màn Owner Lite mà ADR 0040 sinh ra để họ không bao giờ thấy.
     */
    if (isPackageOnboardingPending(req.tenant)) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PACKAGE_ONBOARDING_INCOMPLETE,
        message:
          'Gian hàng chưa hoàn tất thanh toán gói đầu tiên. ' +
          'Hoàn tất chuyển khoản để mở bộ quản lý gian hàng.',
        details: { onboardingState: req.tenant.onboardingState },
      });
    }

    throw new ForbiddenException({
      code: API_ERROR_CODE.SUBSCRIPTION_TRACK_ONLY,
      message:
        req.tenant.billingPhase === BILLING_PHASE.LAPSED
          ? 'Gói dịch vụ đã hết hạn và hết ân hạn. Gian hàng đang dùng bộ công cụ cơ bản; ' +
            'mua lại gói để mở bộ quản lý đầy đủ.'
          : 'Tính năng này thuộc bộ quản lý của gian hàng có gói thuê bao.',
      details: {
        billingMode: req.tenant.billingMode,
        billingPhase: req.tenant.billingPhase,
        planEndsAt: req.tenant.planEndsAt,
      },
    });
  }
}
