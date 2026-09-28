import { redirect } from 'next/navigation';

import { ADMIN_PARTNER_TENANT_PARAM, ROUTES } from '@/constants/routes';
import { LegacyTenantRedirect } from '@/features/admin-tenants/components/LegacyTenantRedirect';

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * URL CŨ của danh sách gian hàng chung — từ 28/09/2026 chia thành hai danh sách đối tác.
 *
 * Link và bookmark cũ không được chết, nên route còn sống dưới dạng chuyển tiếp:
 *
 *  - `?tenant=<id>` → tra loại của CHÍNH gian hàng đó ở server, rồi vào đúng danh sách với panel
 *    chi tiết mở sẵn (`LegacyTenantRedirect`). Đây cũng là lối mà chi tiết đơn thuê và lối thoát
 *    phiên hỗ trợ dùng — hai nơi biết gian hàng nhưng không biết loại.
 *  - còn lại → "Gian hàng gói", GIỮ nguyên `q`/`status`/`page`/… (hai danh sách chung bộ tham số).
 *    Link cũ không mang loại nào, và danh sách chung cũ vốn mở đầu bằng gian hàng.
 */
export default async function LegacyAdminTenantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const tenantId = firstValue(params[ADMIN_PARTNER_TENANT_PARAM]);
  if (tenantId) return <LegacyTenantRedirect tenantId={tenantId} />;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item);
    }
  }
  const qs = query.toString();
  redirect(qs ? `${ROUTES.MANAGE.ADMIN_PARTNER_SHOPS}?${qs}` : ROUTES.MANAGE.ADMIN_PARTNER_SHOPS);
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}
