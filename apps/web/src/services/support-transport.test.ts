import { describe, expect, it } from 'vitest';
import { SUPPORT_CONTEXT_HEADER } from '@xeprime/types';
import { adminTenantSupportPath, tenantSupportContextIdFromPath } from '@/constants/routes';
import { supportAwareWebTransport } from './api-client';

/**
 * Header phiên hỗ trợ (ADR 0050) chỉ đi theo request khi trang ĐANG MỞ là một phiên — rời trang là
 * header biến mất, không có trạng thái nào để quên dọn.
 */
const ID = 'A1B2C3D4E5F6G7H8J9K0M1N2P3';

async function headersAt(path: string | null) {
  return (await supportAwareWebTransport(() => path).credentials()).headers ?? {};
}

describe('supportAwareWebTransport', () => {
  it('gắn id phiên khi đang ở trong phiên hỗ trợ, ở mọi trang con', async () => {
    for (const path of [
      adminTenantSupportPath.root(ID),
      adminTenantSupportPath.vehicleEdit(ID, 'v1'),
      adminTenantSupportPath.vehicleManageSection(ID, 'v1', 'images'),
    ]) {
      expect(await headersAt(path)).toEqual({ [SUPPORT_CONTEXT_HEADER]: ID });
    }
  });

  it('không gắn gì ở mọi trang khác — kể cả hàng đợi hỗ trợ/tranh chấp', async () => {
    for (const path of [
      '/manage/admin/support',
      // Hàng đợi tranh chấp với một đoạn có DÁNG id phiên vẫn không phải phiên hỗ trợ gian hàng.
      `/manage/admin/support/${ID}`,
      `/manage/admin/support/${ID}/vehicles/v1/edit`,
      '/manage/admin/tenant-support',
      '/manage/admin/tenants',
      '/manage/vehicles/v1/edit',
      '/account/vehicles/v1/manage/information',
      // Đoạn không đúng dạng id phiên không phải một phiên.
      // Id không hợp lệ (sai dạng, dài hơn, có chữ I/L/O/U, chữ thường) không bao giờ được gắn.
      '/manage/admin/tenant-support/not-a-session',
      `/manage/admin/tenant-support/${ID}X`,
      '/manage/admin/tenant-support/A1B2C3D4E5F6G7H8J9K0M1N2PI',
      `/manage/admin/tenant-support/${ID.toLowerCase()}`,
      null,
    ]) {
      expect(await headersAt(path)).toEqual({});
    }
  });

  it('giữ nguyên cookie phiên của web (ADR 0002)', async () => {
    const auth = await supportAwareWebTransport(() => adminTenantSupportPath.root(ID)).credentials();
    expect(auth.credentials).toBe('include');
  });

  it('bảng đường dẫn và bộ đọc id là một cặp', () => {
    expect(tenantSupportContextIdFromPath(adminTenantSupportPath.vehicleEdit(ID, 'v9'))).toBe(ID);
  });
});
