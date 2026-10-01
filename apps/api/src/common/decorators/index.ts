import {
  createParamDecorator,
  InternalServerErrorException,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Permission, PlanFeature, SupportCapability } from '@xeprime/types';
import { API_ERROR_CODE } from '@xeprime/types';
import type {
  AuthenticatedUser,
  PlatformContext,
  RequestContext,
  TenantContext,
} from '../types/request-context';

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
 * CHỈ CHỦ GIAN HÀNG — trục thứ BA, cạnh permission và cờ gói (`ShopOwnerGuard`).
 *
 * Dùng cho tiền của gian hàng: ví, sổ cái, lệnh rút, tài khoản ngân hàng nhận tiền. Cố ý KHÔNG
 * phải một permission: permission uỷ quyền được, và yêu cầu ở đây là không có đường nào để một
 * `shop_manager`/`shop_staff`/`shop_viewer` chạm vào — kể cả khi ai đó cấp nhầm một khoá.
 *
 * Luôn đi kèm `@TenantScoped()`: guard đọc `req.tenant.roleKey`.
 */
export const SHOP_OWNER_ONLY_KEY = 'xeprime:shopOwnerOnly';
export const ShopOwnerOnly = () => SetMetadata(SHOP_OWNER_ONLY_KEY, true);

/**
 * Loại tài nguyên mà `BranchScopeGuard` biết cách quy về MỘT chi nhánh (ADR 0052).
 *
 * `vehicles` là bảng duy nhất mang `branch_id`; mọi loại khác quy về chi nhánh QUA XE của nó —
 * trừ phiếu thu chi không gắn xe (cột `receipts.branch_id` của chính nó) và chi nhánh (chính nó).
 */
export const BRANCH_SCOPED_RESOURCE = {
  VEHICLE: 'vehicle',
  BOOKING: 'booking',
  BOOKING_REQUEST: 'bookingRequest',
  RECEIPT: 'receipt',
  BRANCH: 'branch',
  VEHICLE_BLOCK: 'vehicleBlock',
  CONTRACT: 'contract',
  PAYMENT: 'payment',
} as const;

export type BranchScopedResource =
  (typeof BRANCH_SCOPED_RESOURCE)[keyof typeof BRANCH_SCOPED_RESOURCE];

export interface BranchScopedMeta {
  resource: BranchScopedResource;
  /** Tên route param mang id của tài nguyên. */
  param: string;
}

/**
 * Tài nguyên ở route này thuộc về MỘT chi nhánh — người bị giới hạn ngoài chi nhánh đó nhận 404
 * (`BranchScopeGuard`, ADR 0052).
 *
 * Đặt ở mức CONTROLLER khi mọi route của nó cùng nói về một tài nguyên (kể cả route con như
 * `bookings/:id/handovers/...` — mọi bản ghi con đều buộc vào cha trong WHERE của service, nên
 * gác cha là gác hết). Đặt ở mức handler khi controller trộn route danh sách với route theo id.
 *
 * Danh sách KHÔNG cần decorator này: chúng đã thu hẹp bằng `resolveBranchScope` trong `where`.
 */
export const BRANCH_SCOPED_KEY = 'xeprime:branchScoped';
export const BranchScoped = (resource: BranchScopedResource, param = 'id') =>
  SetMetadata(BRANCH_SCOPED_KEY, { resource, param } satisfies BranchScopedMeta);

/**
 * CHỈ GIAN HÀNG TUYẾN GÓI — ranh giới hai tuyến (ADR 0032 điều 6), thi hành bởi
 * `SubscriptionTrackGuard`.
 *
 * Khác `@RequiresFeature` ở hai điểm, và cả hai đều quan trọng:
 *
 *  - Nó hỏi TUYẾN, không hỏi cờ tính năng. Một gian hàng tuyến gói thiếu cờ `finance` vẫn ở
 *    trong Manage; một chủ xe tuyến hoa hồng thì không, dù gói của họ có cờ gì đi nữa.
 *  - Nó chặn THẬT ngay, KHÔNG đi qua `PLAN_FEATURE_ENFORCEMENT`. Công tắc đó gác đợt rollout
 *    hạ cấp năng lực; ranh giới sản phẩm không nằm sau một công tắc rollout.
 *
 * Gắn ở tầng CLASS cho cả controller thuộc bộ quản lý gian hàng. Luôn đi kèm `@TenantScoped()`.
 */
export const SUBSCRIPTION_TRACK_ONLY_KEY = 'xeprime:subscriptionTrackOnly';
export const SubscriptionTrackOnly = () => SetMetadata(SUBSCRIPTION_TRACK_ONLY_KEY, true);

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

/**
 * Endpoint tenant-scoped này CHẤP NHẬN request trong phiên hỗ trợ của nhân sự nền tảng, với
 * capability đã khai (ADR 0050).
 *
 * DEFAULT-DENY: endpoint không có decorator này thì mọi request mang `x-support-context` bị từ
 * chối `SUPPORT_ACTION_NOT_ALLOWED` ở `TenantScopeGuard`, trước khi chạm DB. Thêm một endpoint
 * vào không gian hỗ trợ là một dòng khai báo có chủ đích, không phải hệ quả của việc nó
 * tình cờ tenant-scoped.
 *
 * Nhận một capability cố định, hoặc một HÀM suy capability từ request — cho endpoint mà việc nó
 * làm phụ thuộc thân request (`PATCH /vehicles/:id` vừa sửa thông tin, vừa sửa ảnh, vừa sửa
 * giá). Hàm trả `SupportActionDenial` để từ chối kèm lý do cụ thể.
 */
export const SUPPORT_ACTION_KEY = 'xeprime:supportAction';

export interface SupportActionDenial {
  readonly denied: true;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type SupportActionResolver = (
  req: RequestContext,
) => readonly SupportCapability[] | SupportActionDenial;

export const SupportAction = (capability: SupportCapability | SupportActionResolver) =>
  SetMetadata(SUPPORT_ACTION_KEY, capability);

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
 * Platform scope hiện tại — vai và quyền nền tảng đã đọc từ DB ở `PlatformScopeGuard`.
 *
 * Dùng khi một endpoint ĐỌC phải tự lọc phần dữ liệu theo quyền của người gọi (che tiền, bỏ khối
 * nhạy cảm) thay vì chặn cả endpoint. Ném 500 thay vì trả undefined: handler quên `@PlatformOnly()`
 * sẽ fail ngay (và lộ ra như một lỗi cấu hình) thay vì chạy như thể người gọi không có quyền nào.
 */
export const CurrentPlatform = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformContext => {
    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (!req.platform) {
      // Lỗi NỐI DÂY của controller (quên `@PlatformOnly()`), không phải lỗi của người gọi.
      throw new InternalServerErrorException({
        code: API_ERROR_CODE.INTERNAL_ERROR,
        message: 'Request chưa có platform scope — thiếu @PlatformOnly() trên controller?',
      });
    }
    return req.platform;
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
