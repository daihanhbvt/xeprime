import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  ROLE_MATRIX_LEVEL as L,
  ROLE_MATRIX_ROWS,
  TENANT_ROLE as R,
  roleMatrixLevel,
  type TenantRole,
} from '@xeprime/types';

/**
 * Ma trận "Vai trò & quyền" ở bộ quyền MẶC ĐỊNH (ADR 0086) — khoá lại từng ô để một lần đổi quyền
 * mặc định không âm thầm đổi điều màn hình nói với chủ gian hàng.
 *
 * Thứ tự cột: chủ · quản lý · nhân viên · quan sát viên. Hai ô cố ý KHÁC design `24035:69513`:
 *  - "Huỷ đơn, hoàn cọc, phụ phí" + "Sổ thu chi" của Nhân viên là "có giới hạn" (design "—"): nhân
 *    viên giữ quyền thu tiền / quyết toán lúc giao, nhận xe (ADR 0086 điều 2);
 *  - "Doanh thu & báo cáo" của Quan sát viên là ✓ (design 👁): dòng chỉ-đọc không có thao tác nào
 *    để thiếu, nên có quyền xem là đã đủ quyền của dòng.
 */
const EXPECTED: Record<string, [string, string, string, string]> = {
  rentals: [L.FULL, L.FULL, L.FULL, L.VIEW],
  requests: [L.FULL, L.FULL, L.FULL, L.NONE],
  handovers: [L.FULL, L.FULL, L.FULL, L.NONE],
  cancelSettle: [L.FULL, L.FULL, L.LIMITED, L.NONE],
  customers: [L.FULL, L.FULL, L.LIMITED, L.VIEW],
  fleetView: [L.FULL, L.FULL, L.VIEW, L.VIEW],
  fleetManage: [L.FULL, L.FULL, L.NONE, L.NONE],
  maintenance: [L.FULL, L.FULL, L.LIMITED, L.VIEW],
  revenue: [L.FULL, L.FULL, L.NONE, L.FULL],
  ledger: [L.FULL, L.FULL, L.LIMITED, L.VIEW],
  wallet: [L.FULL, L.NONE, L.NONE, L.NONE],
  shopInfo: [L.FULL, L.VIEW, L.VIEW, L.VIEW],
  branches: [L.FULL, L.FULL, L.VIEW, L.VIEW],
  policies: [L.FULL, L.VIEW, L.VIEW, L.VIEW],
  plan: [L.FULL, L.VIEW, L.VIEW, L.NONE],
  members: [L.FULL, L.LIMITED, L.NONE, L.NONE],
  support: [L.FULL, L.FULL, L.VIEW, L.VIEW],
};

const ROLES: TenantRole[] = [R.SHOP_OWNER, R.SHOP_MANAGER, R.SHOP_STAFF, R.SHOP_VIEWER];

describe('ma trận vai trò ở quyền mặc định', () => {
  it('mọi dòng đều có kỳ vọng — thêm dòng thì phải nói nó hiện gì', () => {
    expect(ROLE_MATRIX_ROWS.map((row) => row.key).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(ROLE_MATRIX_ROWS.map((row) => [row.key, row] as const))('dòng %s', (key, row) => {
    const actual = ROLES.map((role) =>
      roleMatrixLevel(row, role, new Set(DEFAULT_TENANT_ROLE_PERMISSIONS[role])),
    );
    expect(actual).toEqual(EXPECTED[key]);
  });

  it('ví là SỞ HỮU: đủ mọi quyền mà không phải chủ vẫn không có', () => {
    const wallet = ROLE_MATRIX_ROWS.find((row) => row.key === 'wallet')!;
    const all = new Set(DEFAULT_TENANT_ROLE_PERMISSIONS[R.SHOP_OWNER]);
    expect(roleMatrixLevel(wallet, R.SHOP_MANAGER, all)).toBe(L.NONE);
  });
});
