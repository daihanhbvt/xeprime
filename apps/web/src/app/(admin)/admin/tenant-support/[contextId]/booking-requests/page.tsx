import { redirect } from 'next/navigation';
import { adminTenantSupportPath } from '@/constants/routes';
import { legacyRequestsTarget } from '@/features/bookings/rentals-redirect';

/**
 * Hộp thư yêu cầu trong phiên hỗ trợ (ADR 0050) — đã gộp vào màn "Đơn thuê xe" như site partner
 * (05/11/2026). Route cũ chỉ chuyển tiếp, giữ nguyên phiên và bộ lọc.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ contextId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const root = adminTenantSupportPath.root((await params).contextId);
  redirect(
    legacyRequestsTarget(await searchParams, {
      bookings: `${root}/bookings`,
      ended: `${root}/bookings/ended`,
    }),
  );
}
