import { PERMISSION, type Permission } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
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
    // So qua builder của app đang chạy thay vì literal: app Customer đổ /manage về handoff
    // /partner, app Partner giữ đích thật — cùng một phép so đúng ở cả hai.
    expect(byKey.calendar).toEqual(ROUTES.manage.calendar({ q: '51A-12345', back: true }));
    expect(byKey.bookings).toEqual(ROUTES.manage.bookings({ vehicleId: VEHICLE.id }));
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

  it('lịch → lịch khu tài khoản lọc theo biển số', () => {
    const calendar = links(true).find((link) => link.key === 'calendar');
    // Builder thay literal — app Partner không đăng ký khu tài khoản (fallback /not-available).
    expect(calendar?.href).toEqual(ROUTES.account.calendar({ q: '51A-12345', back: true }));
  });

  it('đơn thuê → danh sách Chuyến của tôi', () => {
    expect(links(true).find((link) => link.key === 'bookings')?.href).toEqual(ROUTES.booking.list());
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
