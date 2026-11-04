import { redirect } from 'next/navigation';
import { BOOKING_LIST_PRESET } from '@xeprime/types';
import { BOOKINGS_GROUP_PARAM, bookingsGroupPath } from '@/constants/routes';

/**
 * "Chờ giao xe" từ 02/11/2026 là một NGĂN ở cột trái của màn "Quản lý đơn thuê xe" (design
 * Partner-XePrime) — route cũ chỉ còn chuyển tiếp, để link trong thông báo, email và bookmark
 * không chết (sổ cái `docs/design/09_PARTNER_REDESIGN.md` §3.2).
 *
 * Mang theo mọi tham số lọc của link cũ (từ khoá, chi nhánh, dịch vụ, sắp xếp, trang) trừ chính
 * tham số ngăn — link cũ không có nó, và ngăn ở đây luôn là "Chờ giao xe".
 */
export default async function BookingsAwaitingPickupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === BOOKINGS_GROUP_PARAM || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  const rest = params.toString();
  const target = bookingsGroupPath(BOOKING_LIST_PRESET.AWAITING_PICKUP);
  redirect(rest ? `${target}&${rest}` : target);
}
