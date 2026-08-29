import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission, PlanFeature } from '@xeprime/types';
import { API_ERROR_CODE } from '@xeprime/types';
import type { AuthenticatedUser, RequestContext, TenantContext } from '../types/request-context';

/** Endpoint không cần đăng nhập. Mặc định MỌI endpoint đều cần — đây là opt-out có chủ đích. */
export const IS_PUBLIC_KEY = 'xeprime:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Endpoint `@Public()` nhưng TỰ kiểm credential trong handler — nên nó trả 401 được.
 *
 * Chỉ có 6 endpoint như vậy, tất cả dưới `/auth`: đăng nhập mật khẩu, đổi ID token lấy phiên,
 * đăng nhập OTP, và ba endpoint native (`/auth/mobile/*`). Guard không chạy ở đó, nên luật
 * "không public ⇒ 401" của `enhance-document.ts` bỏ sót đúng những endpoint mà 401 là nhánh
 * client PHẢI code theo (app native gặp `SESSION_EXPIRED` ở `/auth/mobile/refresh` thì phải đá
 * về màn đăng nhập).
 *
 * Marker này KHÔNG có tác dụng lúc chạy — nó là metadata cho tài liệu, và đó là chủ đích. Thứ
 * giữ nó khỏi trôi khỏi sự thật là `openapi-contract.spec.ts`: nó kiểm CẢ HAI chiều — gắn marker
 * mà spec thiếu 401 là fail, và public không gắn marker mà spec CÓ 401 cũng fail. Một decorator
 * không ai kiểm mới là tài liệu viết tay; cái này bị kiểm.
 */
export const VERIFIES_CREDENTIALS_KEY = 'xeprime:verifiesCredentials';
export const VerifiesCredentials = () => SetMetadata(VERIFIES_CREDENTIALS_KEY, true);

/** Permission key mà endpoint đòi hỏi. PermissionGuard đọc metadata này. */
export const PERMISSIONS_KEY = 'xeprime:permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Endpoint chỉ dành cho scope nền tảng, không dùng chung guard với API tenant. */
export const PLATFORM_ONLY_KEY = 'xeprime:platformOnly';
export const PlatformOnly = () => SetMetadata(PLATFORM_ONLY_KEY, true);

/**
 * Đánh dấu controller/route cần tenant scope.
 *
 * `TenantScopeGuard` là guard GLOBAL (chạy trước PermissionGuard để `req.tenant` có sẵn khi
 * kiểm tra quyền). Nó chỉ giải scope cho endpoint có marker này — endpoint không gắn thì bỏ
 * qua. Thay cho `@UseGuards(TenantScopeGuard)` ở tầng controller: guard controller chạy SAU
 * guard global nên `req.tenant` sẽ đến quá muộn cho PermissionGuard.
 */
export const TENANT_SCOPED_KEY = 'xeprime:tenantScoped';
export const TenantScoped = () => SetMetadata(TENANT_SCOPED_KEY, true);

/**
 * Tính năng NÂNG CAO mà endpoint thuộc về — trục thứ hai, độc lập với `@RequirePermissions`
 * (ADR 0027 điều 2). `PlanFeatureGuard` đọc metadata này.
 *
 * Gắn ở tầng CLASS cho cả controller là mặc định: ADR 0027 ràng buộc 3 nói một cờ gác cả một
 * NHÓM endpoint, không phải từng cái. Gắn ở method chỉ khi controller ôm nhiều nhóm (ví dụ
 * `finance-overview` vừa có báo cáo thu chi vừa có công nợ) hoặc khi cần CHỪA một ngoại lệ.
 *
 * Không gắn = bậc cơ bản, không gói nào chặn được — y như `@TenantScoped()`, đây là OPT-IN.
 */
export const PLAN_FEATURE_KEY = 'xeprime:planFeature';
export const RequiresFeature = (feature: PlanFeature) => SetMetadata(PLAN_FEATURE_KEY, feature);

/**
 * Route hình-ĐỌC nhưng không phải `GET` — cho qua ở trạng thái `read_only`.
 *
 * Guard suy đọc/ghi từ `req.method`, và ở đợt này mọi route hình-đọc của 7 nhóm bị gác đều là
 * `GET` (đã đối chiếu từng route), nên marker này CHƯA dùng ở đâu. Nó tồn tại để khi có một
 * `POST /receipts/export` hay `POST /finance/report` — thứ chắc chắn sẽ tới — lối thoát đã sẵn
 * và tường minh, thay vì ai đó nới `read_only` cho toàn bộ POST.
 */
export const FEATURE_READ_SAFE_KEY = 'xeprime:featureReadSafe';
export const FeatureReadSafe = () => SetMetadata(FEATURE_READ_SAFE_KEY, true);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.user) {
      throw new UnauthorizedException({ code: API_ERROR_CODE.UNAUTHENTICATED });
    }
    return req.user;
  },
);

/**
 * Tenant scope hiện tại.
 *
 * Ném lỗi thay vì trả undefined: controller quên gắn TenantScopeGuard sẽ fail ngay ở
 * request đầu tiên, thay vì âm thầm chạy với `tenantId === undefined` và lộ dữ liệu.
 */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.tenant) {
      throw new UnauthorizedException({
        code: API_ERROR_CODE.NO_TENANT_SCOPE,
        message: 'Request chưa có tenant scope — thiếu TenantScopeGuard trên controller?',
      });
    }
    return req.tenant;
  },
);
