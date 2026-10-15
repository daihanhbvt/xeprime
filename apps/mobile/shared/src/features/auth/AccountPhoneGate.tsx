import { ACCOUNT_REALM } from '@xeprime/types';
import { CONTACT_CHANNEL } from '@/features/account/api';
import { ContactVerifySheet } from '@/features/account/components/ContactVerifySheet';
import { useCurrentUser, useLogout } from './hooks/use-auth';

const noop = () => undefined;

/**
 * HOÀN THIỆN HỒ SƠ — tài khoản khách / đối tác phải có SĐT ĐÃ XÁC MINH (ADR 0060). Bản native của
 * web `AccountPhoneGate`, gắn ở vỏ CẢ HAI app (bọc ngoài `Stack`, trong `SessionBoundary`).
 *
 * Đăng ký bằng mật khẩu đã xác minh số ngay lúc tạo tài khoản, nên tấm này chỉ hiện với:
 *  - tài khoản vừa tạo bằng Google/Facebook/Apple (provider không cho SĐT; không bao giờ suy SĐT
 *    từ email hay tự bịa một số), và
 *  - tài khoản cũ có số chưa xác minh (đăng ký trước ADR 0060).
 *
 * Bắt buộc, không "để sau": thiếu nó tài khoản không đăng nhập lại được bằng mật khẩu, không gửi
 * được yêu cầu thuê (`PHONE_NOT_VERIFIED` ở server) và chủ xe không có số nào để liên lạc. Lối ra
 * là Đăng xuất. Dùng lại đúng luồng "thêm/đổi SĐT" của màn tài khoản (`ContactVerifySheet` →
 * `POST /users/me/phone/*`) — mã chỉ gắn số vào TÀI KHOẢN ĐANG ĐĂNG NHẬP, không cấp phiên. Số đã
 * thuộc tài khoản khác cùng app ⇒ `PHONE_TAKEN`: người dùng đăng xuất và đăng nhập bằng tài khoản có
 * số đó. Xác minh xong thì `/auth/me` được làm mới và tấm tự biến mất; luồng đang dở phía dưới
 * (vd đặt xe) vẫn nguyên.
 */
export function AccountPhoneGate() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  const needsPhone = user != null && user.realm !== ACCOUNT_REALM.PLATFORM && !user.phoneVerified;
  if (!needsPhone) return null;

  return (
    <ContactVerifySheet
      // `key` theo tài khoản: đổi tài khoản là một lượt mount mới, state cũ không rò sang.
      key={user.id}
      channel={CONTACT_CHANNEL.PHONE}
      open
      onClose={noop}
      current={user.phone ?? null}
      required={{ onSignOut: () => logout.mutate() }}
    />
  );
}
