import { permanentRedirect } from 'next/navigation';

import { ROUTES } from '@/constants/routes';

/**
 * Hộp thư CHỦ XE cũ — nay chuyển về `/chat` (16/09/2026).
 *
 * ## Vì sao trang này biến mất
 *
 * Nó tồn tại vì chủ xe tuyến hoa hồng không vào `/manage/chat` được, nên hộp thư gian hàng của
 * họ cần một chỗ trong khu user. Kết quả là họ có HAI hộp thư trên hai đường dẫn, và biểu tượng
 * chat trên header nhảy qua lại giữa chúng tuỳ bên nào đang có tin chưa đọc — cùng một cái bấm
 * dẫn tới hai nơi khác nhau vào hai thời điểm khác nhau.
 *
 * Nay `/chat` là hộp thư HỢP NHẤT cho họ (`resolveChatInbox`): hợp ở SERVER trong một truy vấn,
 * nên phân trang, tìm kiếm và số chưa đọc đều nhất quán, và mỗi dòng mang nhãn vai của nó.
 *
 * ## Vì sao chuyển hướng chứ không xoá
 *
 * Đường dẫn này nằm trong bookmark, trong email thông báo đã gửi và trong lịch sử trình duyệt.
 * Một trang 404 ở đó là một chủ xe tin rằng mình vừa mất hộp thư. `permanentRedirect` (308) nói
 * đúng điều đã xảy ra: nội dung không mất, nó đổi địa chỉ.
 *
 * `?c=` phải được CHÉP TAY sang đích: `permanentRedirect` đi tới đúng chuỗi được truyền và không
 * mang theo query của trang cũ. Bỏ nó đi nghĩa là mọi liên kết "mở hội thoại này" trong email đã
 * gửi sẽ đổ về đầu danh sách, và người dùng phải tự đi tìm lại thread mình vừa bấm.
 */
export default async function AccountMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  permanentRedirect(c ? `${ROUTES.CHAT}?c=${encodeURIComponent(c)}` : ROUTES.CHAT);
}
