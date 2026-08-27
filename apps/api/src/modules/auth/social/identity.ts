import type { AuthProvider } from '@xeprime/types';

/**
 * Một người dùng đã được nhà cung cấp đăng nhập xác nhận — ADR 0019.
 *
 * Đây là ranh giới: mọi thứ phía trên nó (đổi code, verify chữ ký, gọi Graph API) là chuyện
 * riêng của từng provider; mọi thứ phía dưới nó (`AuthService.upsertUserFromIdentity`) không
 * biết Google hay Facebook tồn tại. Thêm Apple Sign In là thêm một file sinh ra đúng shape này,
 * không phải sửa `AuthService`.
 *
 * Trước ADR 0019 interface này sống ở `token-verifier.ts` và Firebase là thứ điền vào nó. Hình
 * dạng giữ NGUYÊN khi chuyển sang đây — nhờ vậy luật nối tài khoản trong `AuthService` không
 * phải đổi một dòng nào, và 5 test khoá luật đó vẫn là bằng chứng hợp lệ.
 */
export interface VerifiedIdentity {
  /**
   * Định danh của người dùng TẠI provider — `sub` của Google, `id` của Facebook.
   *
   * Cùng với `provider` tạo thành khoá tra cứu duy nhất. KHÔNG dùng email làm khoá: email đổi
   * được, và tin email để nhận diện là cách hai tài khoản khác nhau bị gộp làm một.
   */
  providerUserId: string;
  provider: AuthProvider;
  email: string | null;
  /**
   * Provider có CAM KẾT email này đã được xác minh không.
   *
   * Quyết định một điều duy nhất nhưng quan trọng: có được tự nối vào tài khoản XePrime sẵn có
   * cùng email hay không. `false` với Facebook — Graph API trả email nhưng không cam kết gì về
   * việc nó đã được xác minh.
   */
  emailVerified: boolean;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}
