import { redirect } from 'next/navigation';

import { ADMIN_PARTNER_TENANT_PARAM, ROUTES } from '@/constants/routes';
import { PartnerTenantResolver } from '@/features/admin-tenants/components/PartnerTenantResolver';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Gốc khối "Đối tác" — không phải một trang danh sách, mà là điểm vào hai việc:
 *
 *  - `?tenant=<id>` → tra loại của CHÍNH gian hàng đó ở server, rồi vào đúng danh sách với panel
 *    chi tiết mở sẵn (`PartnerTenantResolver`). Đây là lối của những nơi biết gian hàng nhưng
 *    không biết loại (chi tiết đơn thuê, lối thoát phiên hỗ trợ) — trước 16/11/2026 nó nằm ở URL
 *    cũ `/admin/tenants` (đã gỡ).
 *  - còn lại (người gõ tắt URL, cắt bớt một link) → "Gian hàng gói", GIỮ nguyên `q`/`status`/…
 *    (hai danh sách chung bộ tham số).
 */
export default async function AdminPartnersIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenantId = firstValue(params[ADMIN_PARTNER_TENANT_PARAM]);
  if (tenantId) return <PartnerTenantResolver tenantId={tenantId} />;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const qs = query.toString();
  redirect(qs ? `${ROUTES.ADMIN.PARTNER_SHOPS}?${qs}` : ROUTES.ADMIN.PARTNER_SHOPS);
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}
