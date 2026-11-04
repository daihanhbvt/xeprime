import { redirect } from 'next/navigation';
import { RECEIPTS_VIEW_PARAM, receiptsPath } from '@/constants/routes';

/**
 * Công nợ từ 04/11/2026 là tab "Công nợ" của màn "Lịch sử giao dịch" (design Partner-XePrime,
 * `/receipts?view=debts`) — route cũ chỉ còn chuyển tiếp, để link trong thông báo, email và
 * bookmark không chết (sổ cái `docs/design/09_PARTNER_REDESIGN.md` §3.11).
 *
 * Mang theo mọi tham số lọc của link cũ (từ khoá, nhóm hạn, chi nhánh, trang).
 */
export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key === RECEIPTS_VIEW_PARAM || value === undefined) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params[key] = first;
  }
  redirect(receiptsPath.debts(params));
}
