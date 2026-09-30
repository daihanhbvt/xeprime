import { ForbiddenException } from '@nestjs/common';
import {
  API_ERROR_CODE,
  MOBILE_CLIENT_APP,
  canUseCustomerApp,
  canUsePartnerApp,
  type MobileClientApp,
} from '@xeprime/types';
import type { MeDto } from './dto/auth.dto';

/**
 * Cổng phạm vi APP cho hai app mobile phát hành riêng (25/09/2026, siết hai chiều 28/09/2026).
 *
 * Một tài khoản thuộc về ĐÚNG MỘT app: gian hàng tuyến gói (mọi vai) chỉ dùng XePrime Partner,
 * còn lại — khách thuê, chủ xe tuyến hoa hồng, nhân sự nền tảng — chỉ dùng XePrime. Hai phép
 * kiểm loại trừ nhau nên không có tài khoản nào rơi vào cả hai, và cũng không có tài khoản nào
 * rơi ra ngoài cả hai.
 *
 * Chỉ chạy ở các endpoint PHÁT HÀNH PHIÊN native, và luôn SAU khi credentials đã xác minh —
 * trước đó thì mọi thất bại vẫn là 401 chung, để thông báo eligibility không thành máy dò
 * email/SĐT tồn tại. Đây là 403 "đúng người, sai app", không phải một lỗi xác thực.
 *
 * KHÔNG phải guard toàn cục: API nghiệp vụ không phân biệt app (AuthGuard + guard tenant như
 * cũ). Ranh giới app chỉ nằm ở cửa đăng nhập — app hợp nhất cũ ngoài thị trường (không gửi
 * `clientApp`) vì thế không bị chặn ở đâu cả.
 */
/**
 * Chặn TẠO TÀI KHOẢN từ app XePrime Partner — gọi TRƯỚC khi ghi bất cứ hàng nào.
 *
 * Tách khỏi `assertMobileAppAccess` vì thời điểm khác nhau quyết định đúng/sai: cổng kia
 * chạy sau khi đã có một tài khoản để hỏi `tenant`, còn ở đây chưa có gì để hỏi — tài khoản
 * mới tinh không thể có gian hàng tuyến gói, nên lượt này CHẮC CHẮN hỏng. Để nó đi tiếp rồi
 * mới 403 nghĩa là user đã được tạo, số điện thoại đã bị chiếm, và người dùng nhận
 * `PHONE_TAKEN` ở app XePrime cho một tài khoản họ chưa từng dùng được.
 *
 * Áp cho CẢ `/auth/mobile/register` lẫn `/auth/mobile/phone/login` — đường OTP cũng tạo
 * tài khoản khi số chưa tồn tại.
 */
export function assertMobileAppCanCreateAccount(clientApp: MobileClientApp | undefined): void {
  if (clientApp !== MOBILE_CLIENT_APP.PARTNER) return;

  throw new ForbiddenException({
    code: API_ERROR_CODE.PARTNER_REGISTRATION_NOT_SUPPORTED,
    message: 'Ứng dụng XePrime Partner không tạo tài khoản mới',
  });
}

export function assertMobileAppAccess(user: MeDto, clientApp: MobileClientApp | undefined): void {
  if (clientApp === MOBILE_CLIENT_APP.PARTNER) {
    // Gian hàng tuyến gói hiệu lực (mọi vai), hoặc đang nợ bước thanh toán gói. Admin nền tảng
    // CỐ Ý không qua được — hai app mobile không phục vụ trục platform.
    if (canUsePartnerApp(user.tenant)) return;

    throw new ForbiddenException({
      code: API_ERROR_CODE.PARTNER_ACCESS_REQUIRED,
      message: 'Tài khoản này không thuộc phạm vi ứng dụng XePrime Partner',
      details: { onboardingState: user.tenant?.onboardingState ?? null },
    });
  }

  if (clientApp === MOBILE_CLIENT_APP.CUSTOMER) {
    if (canUseCustomerApp(user.tenant)) return;

    // `tenantName` để giao diện gọi đúng tên gian hàng họ đang đăng nhập — cùng kỷ luật với
    // `SHOP_ACCOUNT_CANNOT_BOOK`, thay vì một câu 403 chung mà người dùng không biết mình là ai.
    throw new ForbiddenException({
      code: API_ERROR_CODE.CUSTOMER_APP_NOT_AVAILABLE,
      message: 'Tài khoản gian hàng dùng ứng dụng XePrime Partner',
      details: { tenantName: user.tenant?.name ?? null },
    });
  }

  // `undefined` = app hợp nhất CŨ. Không siết gì — nó phục vụ cả hai bề mặt trong một bản cài.
}
