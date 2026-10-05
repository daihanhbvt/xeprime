import { apiGet } from '@/services/api-client';
import type { AccountLookupFilters, AccountLookupItem } from './types';

/**
 * Mọi tài khoản trùng MỘT số điện thoại hoặc email, ở cả ba realm — ADR 0053 điều 9.
 *
 * Không phân trang: định danh unique TRONG realm, nên kết quả bị chặn trên bởi số realm. Liên hệ
 * trả về đã che sẵn ở server.
 */
export const lookupAccounts = (filters: AccountLookupFilters): Promise<AccountLookupItem[]> =>
  apiGet<AccountLookupItem[]>(
    '/platform/accounts/lookup',
    filters.phone ? { phone: filters.phone } : { email: filters.email ?? null },
  );
