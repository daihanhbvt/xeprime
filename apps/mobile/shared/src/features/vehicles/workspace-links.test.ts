import { SERVICE_TYPE } from '@xeprime/types';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import { ROUTES } from '@/navigation/routes';
import { vehicleSchedulePath } from './calendar-link';
import {
  vehicleBookingsHref,
  vehicleEditHref,
  vehicleEditHubHref,
  vehicleOptimizationHref,
  vehiclePricingHref,
} from './workspace-links';

const ID = '01JQZX0000000000000000000V';

/** Phần đường dẫn của một `Href` (chuỗi hoặc object) — để soát KHU của đích. */
const pathOf = (href: unknown) =>
  typeof href === 'string' ? href : (href as { pathname: string }).pathname;

/*
 * Hồ sơ 360 hiện ở CẢ HAI khu. Web chọn đích bằng `useWorkspace()`; ở khu tài khoản mọi đích phải
 * nằm trong khu tài khoản — chủ xe tuyến hoa hồng không vào được `/manage` (ADR 0038 điều 4).
 */
describe('workspace-links — khu TÀI KHOẢN không có đích nào ở /manage', () => {
  it.each([
    ['sửa (tab)', vehicleEditHref(ID, VEHICLE_EDIT_TAB.DOCUMENTS, true)],
    ['hub sửa', vehicleEditHubHref(ID, true)],
    ['giá', vehiclePricingHref(ID, true)],
    ['tối ưu', vehicleOptimizationHref({ id: ID, serviceTypes: [SERVICE_TYPE.SELF_DRIVE] }, true)],
    ['đơn thuê', vehicleBookingsHref(ID, true)],
    [
      'lịch',
      vehicleSchedulePath(
        { name: 'Mazda3', plateNumber: '51A-12345' },
        { back: true, customerScope: true },
      ),
    ],
  ])('%s', (_label, href) => {
    expect(pathOf(href).startsWith('/manage')).toBe(false);
  });

  it('tab sửa → mục tương ứng của không gian quản lý xe', () => {
    expect(vehicleEditHref(ID, VEHICLE_EDIT_TAB.DOCUMENTS, true)).toEqual(
      ROUTES.account.vehicleManageSection(ID, VEHICLE_MANAGE_SECTION.DOCUMENTS),
    );
    expect(vehicleEditHref(ID, VEHICLE_EDIT_TAB.MEDIA, true)).toEqual(
      ROUTES.account.vehicleManageSection(ID, VEHICLE_MANAGE_SECTION.IMAGES),
    );
  });

  it('lịch → /account/calendar, giữ bộ lọc biển số và cờ quay lại (web: basePath = paths.calendar)', () => {
    expect(
      vehicleSchedulePath(
        { name: 'Mazda3', plateNumber: '51A-12345' },
        { back: true, customerScope: true },
      ),
      // So qua builder của APP đang chạy: test này sống ở CẢ HAI app (customer: lịch khu tài
      // khoản thật; manage: fallback /not-available) — ý của test là "đi đúng builder", không
      // phải một chuỗi literal của riêng một app.
    ).toEqual(ROUTES.account.calendar({ q: '51A-12345', back: true }));
  });

  it('đơn thuê → "Chuyến của tôi" — web: paths.bookings của khu tài khoản', () => {
    expect(vehicleBookingsHref(ID, true)).toEqual(ROUTES.booking.list());
  });

  it('tối ưu: xe chỉ có tài xế → mục tối ưu CÓ TÀI XẾ', () => {
    expect(
      vehicleOptimizationHref({ id: ID, serviceTypes: [SERVICE_TYPE.WITH_DRIVER] }, true),
    ).toEqual(
      ROUTES.account.vehicleManageSection(ID, VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION),
    );
  });
});

describe('workspace-links — cổng QUẢN LÝ giữ nguyên đích cũ', () => {
  it('đích cổng quản lý', () => {
    expect(vehicleEditHref(ID, VEHICLE_EDIT_TAB.DOCUMENTS, false)).toEqual(
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.DOCUMENTS),
    );
    expect(vehicleEditHubHref(ID, false)).toEqual(ROUTES.manage.vehicleEdit(ID));
    expect(vehiclePricingHref(ID, false)).toEqual(ROUTES.manage.vehiclePricing(ID));
    expect(vehicleOptimizationHref({ id: ID, serviceTypes: [] }, false)).toEqual(
      ROUTES.manage.vehicleOptimization(ID),
    );
    expect(vehicleBookingsHref(ID, false)).toEqual(ROUTES.manage.bookings({ vehicleId: ID }));
    // Builder thay literal: ở app Customer mọi đích /manage đổ về handoff /partner, còn ở app
    // Partner là lịch thật — cùng một phép so đúng ở cả hai.
    expect(vehicleSchedulePath({ name: 'Mazda3', plateNumber: null }, { back: true })).toEqual(
      ROUTES.manage.calendar({ q: 'Mazda3', back: true }),
    );
  });
});
