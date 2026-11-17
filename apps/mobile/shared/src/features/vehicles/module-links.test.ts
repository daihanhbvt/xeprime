import { isCommissionPath } from '@/features/shell/partner-track';
import { PERMISSION, type Permission } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
import { vehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { overviewViews, vehicleModuleLinks, vehicleProfileHref } from './module-links';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { vehicleEditPartHref } from './workspace-links';

const VEHICLE = { id: '01JQZX0000000000000000000V', name: 'Mazda3', plateNumber: '51A-12345' };

/** Chủ xe/chủ shop: đủ mọi quyền đọc liên quan tới hồ sơ xe. */
const ALL: Permission[] = [
  PERMISSION.FINANCE_VIEW,
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
  PERMISSION.CALENDAR_VIEW,
  PERMISSION.BOOKING_VIEW,
];

/** Cờ gói: mặc định đủ (tuyến gói); `false` = tuyến hoa hồng — finance/maintenance ẩn. */
function links(
  customerScope: boolean,
  permissions: Permission[] = ALL,
  canEdit = true,
  planFeatures = true,
) {
  const has = (permission: Permission) => permissions.includes(permission);
  return vehicleModuleLinks({
    vehicle: VEHICLE,
    canEdit,
    customerScope,
    has,
    can: vehicleCapabilities({
      has,
      finance: { isVisible: planFeatures, canWrite: planFeatures },
      maintenance: { isVisible: planFeatures },
    }),
  });
}

describe('vehicleModuleLinks - cổng QUẢN LÝ (web: isManage = true)', () => {
  it('đủ quyền: ba lối tắt, đúng thứ tự web (Vehicle360Aside, chốt 03/11/2026)', () => {
    expect(links(false).map((link) => link.key)).toEqual([
      'bookings',
      'receipts',
      'maintenanceCenter',
    ]);
  });

  it('đơn thuê lọc theo xe, ở cổng quản lý', () => {
    const byKey = Object.fromEntries(links(false).map((link) => [link.key, link.href]));
    expect(byKey.bookings).toEqual(ROUTES.manage.bookings({ vehicleId: VEHICLE.id }));
    expect(byKey.maintenanceCenter).toEqual(ROUTES.manage.maintenance());
  });
});

/*
 * Khu TÀI KHOẢN — chủ xe tuyến hoa hồng. Web `Vehicle360Aside` với `isManage = false`: chỉ còn
 * lối đơn thuê; không Thu-Chi, không trung tâm bảo dưỡng.
 */
describe('vehicleModuleLinks - khu TÀI KHOẢN (web: isManage = false)', () => {
  it('chỉ có đơn thuê - kể cả khi có quyền Thu-Chi/bảo dưỡng', () => {
    expect(links(true).map((link) => link.key)).toEqual(['bookings']);
  });

  /** ADR 0053: Owner Lite sống ở `/manage` của app Partner — nhưng CHỈ các trang tuyến hoa hồng mở. */
  it('không mục nào dẫn vào trang chỉ của Full Manage', () => {
    for (const link of links(true)) {
      const path = typeof link.href === 'string' ? link.href : link.href.pathname;
      expect(!path.startsWith('/manage') || isCommissionPath(path)).toBe(true);
    }
  });

  it('không quyền xem đơn ⇒ không có lối tắt nào', () => {
    expect(links(true, [PERMISSION.VEHICLE_DOCUMENT_VIEW])).toEqual([]);
  });
});

describe('vehicleModuleLinks - gác bằng NĂNG LỰC (quyền ∧ cờ gói), không chỉ permission', () => {
  it('đủ permission nhưng gói không có finance/maintenance ⇒ chỉ còn đơn thuê', () => {
    expect(links(false, ALL, true, false).map((link) => link.key)).toEqual(['bookings']);
  });
});

describe('vehicleEditPartHref / vehicleProfileHref - đích theo khu', () => {
  const id = VEHICLE.id;
  it('khu tài khoản: bảo dưỡng và nguồn xe KHÔNG có mục ⇒ null', () => {
    expect(vehicleEditPartHref(id, VEHICLE_EDIT_TAB.MAINTENANCE, true)).toBeNull();
    expect(vehicleEditPartHref(id, VEHICLE_EDIT_TAB.SOURCE, true)).toBeNull();
    expect(vehicleEditPartHref(id, VEHICLE_EDIT_TAB.SOURCE, false)).toEqual(
      ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.SOURCE),
    );
  });

  it('nút Chỉnh sửa: màn sửa xe ở cả hai tuyến (web vehiclePaths.profile = vehiclePath.edit)', () => {
    expect(vehicleProfileHref(id, false)).toEqual(ROUTES.manage.vehicleEdit(id));
    expect(vehicleProfileHref(id, true)).toEqual(ROUTES.account.vehicleManage(id));
  });
});

describe('overviewViews - tab của Hồ sơ 360 (web Vehicle360Overview)', () => {
  it('đủ năng lực: Tổng quan · Thông số · Tài chính · Tiện ích xe · Bảo dưỡng, đúng thứ tự', () => {
    expect(overviewViews({ money: true, maintenance: true })).toEqual([
      'overview',
      'specs',
      'finance',
      'features',
      'maintenance',
    ]);
  });

  it('tuyến hoa hồng (không cờ gói): Tổng quan · Thông số · Tiện ích xe', () => {
    expect(overviewViews({ money: false, maintenance: false })).toEqual([
      'overview',
      'specs',
      'features',
    ]);
  });

  it('chỉ có bảo dưỡng: không tab Tài chính', () => {
    expect(overviewViews({ money: false, maintenance: true })).toEqual([
      'overview',
      'specs',
      'features',
      'maintenance',
    ]);
  });
});
