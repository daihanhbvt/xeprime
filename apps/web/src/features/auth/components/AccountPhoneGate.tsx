'use client';

import { ACCOUNT_REALM } from '@xeprime/types';
import { ContactVerifyModal } from '@/features/account/components/ContactVerifyModal';
import { CONTACT_CHANNEL } from '@/features/account/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useLogout } from '../hooks/use-logout';

/**
 * HOÀN THIỆN HỒ SƠ — tài khoản khách / đối tác phải có SĐT ĐÃ XÁC MINH (ADR 0060).
 *
 * Ở site khách và site partner, số điện thoại là ĐỊNH DANH đăng nhập: đăng ký bằng mật khẩu đã
 * xác minh số ngay lúc tạo tài khoản, nên hộp này chỉ hiện với hai nhóm còn lại —
 *  - tài khoản vừa tạo bằng Google/Facebook (provider không cho SĐT; không bao giờ suy SĐT từ
 *    email hay tự bịa một số), và
 *  - tài khoản cũ có số chưa xác minh (đăng ký trước ADR 0060).
 *
 * Bắt buộc, không "để sau": thiếu nó tài khoản không đăng nhập lại được bằng mật khẩu, không gửi
 * được yêu cầu thuê (`PHONE_NOT_VERIFIED` ở server), và chủ xe không có số nào để liên lạc. Lối ra
 * là Đăng xuất. Dùng lại đúng luồng "thêm/đổi SĐT" của trang tài khoản (`ContactVerifyModal` →
 * `POST /users/me/phone/*`) — mã OTP ở đây chỉ gắn số vào TÀI KHOẢN ĐANG ĐĂNG NHẬP, không bao
 * giờ cấp phiên. Số đã thuộc một tài khoản khác cùng site ⇒ `PHONE_TAKEN`: người dùng đăng xuất
 * và đăng nhập bằng tài khoản có số đó.
 *
 * Gắn ở vỏ của site khách (`app/(public)/layout.tsx`) và site partner (`AppShell`). Không làm gì
 * với tài khoản `platform` — site quản trị đăng nhập bằng email (ADR 0053 điều 3). Xác minh xong
 * thì `/auth/me` được làm mới (`useContactVerify`) và hộp tự biến mất; luồng người dùng đang dở
 * phía dưới (vd hộp đặt xe) vẫn nguyên.
 */
export function AccountPhoneGate({ signOutTo }: { signOutTo: string }) {
  const { data: user } = useCurrentUser();
  const signOut = useLogout(signOutTo);

  const needsPhone = user != null && user.realm !== ACCOUNT_REALM.PLATFORM && !user.phoneVerified;
  if (!needsPhone) return null;

  return (
    <ContactVerifyModal
      channel={CONTACT_CHANNEL.PHONE}
      open
      onClose={() => undefined}
      current={user.phone}
      required={{ onSignOut: () => void signOut() }}
    />
  );
}
