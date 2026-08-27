import type { Href } from 'expo-router';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';

/**
 * Đường nào đã đưa người dùng vào — quyết định bước tiếp theo phụ thuộc nó.
 */
export const LOGIN_METHOD = {
  PASSWORD: 'password',
  OTP: 'otp',
  SOCIAL: 'social',
} as const;

export type LoginMethod = (typeof LOGIN_METHOD)[keyof typeof LOGIN_METHOD];

/**
 * "Đăng nhập xong thì đi đâu" — hàm THUẦN, tách khỏi component đúng như
 * `apps/web/src/features/auth/post-auth-destination.ts`.
 *
 * Tách ra vì luật này là thứ dễ lệch nhất giữa hai nền tảng và là thứ đã lệch thật: bản trước
 * chỉ kiểm `hasPassword`, nên người đăng nhập bằng Google cũng bị hỏi đặt mật khẩu — trong khi
 * web không hỏi. Là hàm thuần thì nó kiểm thử được mà không cần dựng router, và lần lệch sau sẽ
 * hiện ra ở test chứ không hiện ra trên máy người dùng.
 *
 * Luật, giống hệt `AuthPanel` bên web:
 *  - **OTP** mà tài khoản chưa có mật khẩu ⇒ ghé màn đặt mật khẩu. Người này mỗi lần đăng nhập
 *    đều phải chờ SMS, nên một mật khẩu là lối tắt thật.
 *  - **Mọi đường khác** ⇒ vào thẳng app. Tài khoản tạo từ Google cũng không có mật khẩu, nhưng
 *    họ sẽ bấm Google ở mọi lần sau — mật khẩu đó không tiết kiệm cho họ thao tác nào.
 *
 * Trả `null` = không có đích riêng, gọi `enterApp()` để đóng các màn đang chồng lên.
 */
export function postLoginDestination(user: CurrentUser, method: LoginMethod): Href | null {
  const passwordless = method === LOGIN_METHOD.OTP;
  return passwordless && user.hasPassword === false ? ROUTES.account.setPassword() : null;
}
