import { PERMISSION, type Permission } from '@xeprime/types';
import { vehicleCapabilities } from './use-vehicle-capabilities';

const ALL: Permission[] = [
  PERMISSION.FINANCE_VIEW,
  PERMISSION.RECEIPT_CREATE,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
];

function caps(
  permissions: Permission[],
  finance = { isVisible: true, canWrite: true },
  maintenance = { isVisible: true },
) {
  return vehicleCapabilities({ has: (p) => permissions.includes(p), finance, maintenance });
}

/** Bản native của `useVehicleCapabilities` web — quyền ∧ cờ gói (ADR 0027 điều 2). */
describe('vehicleCapabilities', () => {
  it('đủ quyền + gói đủ cờ ⇒ mở hết', () => {
    expect(caps(ALL)).toEqual({
      money: true,
      createReceipt: true,
      maintenance: true,
      source: true,
      documents: true,
    });
  });

  it('cùng vai shop_owner nhưng tuyến hoa hồng (cờ ẩn) ⇒ không tiền, nguồn xe, bảo dưỡng; giấy tờ còn', () => {
    expect(caps(ALL, { isVisible: false, canWrite: false }, { isVisible: false })).toEqual({
      money: false,
      createReceipt: false,
      maintenance: false,
      source: false,
      documents: true,
    });
  });

  it('gói hết hạn (read_only): vẫn XEM tiền, KHÔNG tạo phiếu', () => {
    const can = caps(ALL, { isVisible: true, canWrite: false });
    expect(can.money).toBe(true);
    expect(can.createReceipt).toBe(false);
  });

  it('thiếu permission ⇒ đóng dù cờ bật', () => {
    expect(caps([])).toEqual({
      money: false,
      createReceipt: false,
      maintenance: false,
      source: false,
      documents: false,
    });
  });
});
