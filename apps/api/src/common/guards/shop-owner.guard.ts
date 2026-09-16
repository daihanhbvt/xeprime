import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_ERROR_CODE, canAccessShopWallet } from '@xeprime/types';
import { SHOP_OWNER_ONLY_KEY } from '../decorators';
import type { RequestContext } from '../types/request-context';

/**
 * TIỀN CỦA GIAN HÀNG LÀ CHUYỆN CỦA CHỦ — trục thứ BA, cạnh permission (ADR 0002) và cờ gói
 * (ADR 0027).
 *
 * Gác ví gian hàng và tài khoản ngân hàng nhận tiền của gian hàng. Trước 15/09/2026 hai nhóm đó
 * gác bằng `seller_profile.view`/`.manage`, và `shop_manager` có `seller_profile.view` mặc định —
 * nên quản lý đọc được số dư, toàn bộ sổ cái và lịch sử rút. Đó là rò quyền thật ở backend, và
 * không test nào phủ.
 *
 * ## Vì sao là VAI chứ không phải một permission mới
 *
 * Permission uỷ quyền được: chủ shop tạo một vai tuỳ biến rồi gán cho quản lý là mở luôn đường
 * ra của tiền, và guard đọc quyền từ DB mỗi request nên "mặc định không có" không ngăn được gì.
 * Yêu cầu sản phẩm là **không có đường nào** để `shop_manager`/`shop_staff`/`shop_viewer` chạm
 * vào ví, kể cả khi ai đó cấp nhầm một khoá.
 *
 * Và câu hỏi ở đây khác hẳn: không phải "người này được làm gì trong gian hàng" mà "tiền này của
 * ai". Chủ ví là tenant; người đại diện của tenant là chủ gian hàng.
 *
 * ## Thứ tự và ngoại lệ
 *
 * Đăng ký SAU `PermissionGuard` và trước `PlanFeatureGuard`: người không có quyền vào khu đó phải
 * nhận `MISSING_PERMISSION` trước, vì "gian hàng này có bao nhiêu tiền" không phải thứ một người
 * ngoài được biết là có tồn tại hay không.
 *
 * `req.platform` đi qua: nhân sự nền tảng xử lý tiền bằng trục riêng của họ
 * (`platform.money.manage` + `@PlatformOnly()`), và chặn họ ở đây là cắt đường vận hành hợp lệ.
 * Không có ngoại lệ nào khác — đặc biệt KHÔNG có ngoại lệ "có quyền tài chính".
 */
@Injectable()
export class ShopOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(SHOP_OWNER_ONLY_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<RequestContext>();
    if (req.platform) return true;

    // Không có scope tenant thì `TenantScopeGuard` đã ném; ném nữa ở đây là đổi mã lỗi của một
    // tình huống khác hẳn.
    if (!req.tenant) return true;

    if (canAccessShopWallet(req.tenant.roleKey)) return true;

    throw new ForbiddenException({
      code: API_ERROR_CODE.SHOP_OWNER_ONLY,
      message: 'Chỉ chủ gian hàng mới xem và rút được tiền của gian hàng.',
      details: { roleKey: req.tenant.roleKey },
    });
  }
}
