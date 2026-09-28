import { PERMISSION, type Permission } from '@xeprime/types';
import { vehicleModuleLinks } from './module-links';

const VEHICLE = { id: '01JQZX0000000000000000000V', name: 'Mazda3', plateNumber: '51A-12345' };

/** Chủ xe/chủ shop: đủ mọi quyền đọc liên quan tới hồ sơ xe. */
const ALL: Permission[] = [
  PERMISSION.FINANCE_VIEW,
  PERMISSION.VEHICLE_DOCUMENT_VIEW,
  PERMISSION.VEHICLE_MAINTENANCE_VIEW,
  PERMISSION.CALENDAR_VIEW,
  PERMISSION.BOOKING_VIEW,
];

function links(customerScope: boolean, permissions: Permission[] = ALL, canEdit = true) {
  return vehicleModuleLinks({
    vehicle: VEHICLE,
    canEdit,
    customerScope,
    has: (permission) => permissions.includes(permission),
  });
}

describe('vehicleModuleLinks — cổng QUẢN LÝ (web: isManage = true)', () => {
  it('đủ quyền: đủ mười mục, đúng thứ tự web', () => {
    expect(links(false).map((link) => link.key)).toEqual([
      'information',
      'media',
      'pricing',
      'source',
      'documents',
      'maintenance',
      'maintenanceCenter',
      'calendar',
      'bookings',
      'receipts',
    ]);
  });

  it('lịch và đơn thuê lọc theo xe, ở cổng quản lý', () => {
    const byKey = Object.fromEntries(links(false).map((link) => [link.key, link.href]));
    expect(byKey.calendar).toEqual({
      pathname: '/manage/calendar',
      params: { q: '51A-12345', back: '1' },
    });
    expect(byKey.bookings).toEqual({
      pathname: '/manage/bookings',
      params: { vehicleId: VEHICLE.id },
    });
  });
});

/*
 * Khu TÀI KHOẢN — chủ xe tuyến hoa hồng (`/account/vehicles/[id]`). Web `Vehicle360Overview` với
 * `isManage = false`: không nguồn xe, không bảo dưỡng, không sổ Thu-Chi; lịch ở `paths.calendar`,
 * đơn thuê ở `paths.bookings` (= Chuyến của tôi).
 */
describe('vehicleModuleLinks — khu TÀI KHOẢN (web: isManage = false)', () => {
  it('KHÔNG có bảo dưỡng, nguồn xe, Thu-Chi — kể cả khi có quyền', () => {
    const keys = links(true).map((link) => link.key);
    expect(keys).toEqual(['information', 'media', 'pricing', 'documents', 'calendar', 'bookings']);
    expect(keys).not.toContain('maintenance');
    expect(keys).not.toContain('maintenanceCenter');
  });

  it('lịch → /account/calendar lọc theo biển số', () => {
    const calendar = links(true).find((link) => link.key === 'calendar');
    expect(calendar?.href).toEqual({
      pathname: '/account/calendar',
      params: { q: '51A-12345', back: '1' },
    });
  });

  it('đơn thuê → danh sách Chuyến (/trips)', () => {
    expect(links(true).find((link) => link.key === 'bookings')?.href).toBe('/trips');
  });

  it('KHÔNG mục nào dẫn vào /manage', () => {
    for (const link of links(true)) {
      const path = typeof link.href === 'string' ? link.href : link.href.pathname;
      expect(path.startsWith('/manage')).toBe(false);
    }
  });

  it('không quyền đặt/lịch ⇒ không bày hai mục đó', () => {
    const keys = links(true, [PERMISSION.VEHICLE_DOCUMENT_VIEW]).map((link) => link.key);
    expect(keys).toEqual(['information', 'media', 'pricing', 'documents']);
  });

  it('không quyền sửa ⇒ không có thông tin/ảnh/giá', () => {
    const keys = links(true, ALL, false).map((link) => link.key);
    expect(keys).toEqual(['documents', 'calendar', 'bookings']);
  });
});
