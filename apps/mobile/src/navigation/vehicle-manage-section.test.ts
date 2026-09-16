import { SERVICE_TYPE } from '@xeprime/types';
import { ROUTES } from './routes';
import {
  VEHICLE_MANAGE_NAV,
  VEHICLE_MANAGE_SECTION,
  sectionServiceType,
  type VehicleManageSection,
} from './vehicle-manage-section';

const VEHICLE_ID = '01M1X1AFM9M3JMWS2YZBYB1QN8';

function pathOf(section: VehicleManageSection): string {
  const href = ROUTES.account.vehicleManageSection(VEHICLE_ID, section);
  return typeof href === 'string' ? href : String(href.pathname);
}

const ALL_SECTIONS = VEHICLE_MANAGE_NAV.flatMap((group) => group.items.map((item) => item.section));

/**
 * Không gian "Quản lý xe" — 13 mục, ba nhóm.
 *
 * Bộ này khoá ba thứ web cũng khoá: **mục nào có mặt và đứng ở đâu** (thứ tự là hợp đồng với
 * người dùng), **mục nào thuộc dịch vụ nào** (sai chỗ này là một màn bị khoá oan, hoặc tệ hơn, một
 * màn của dịch vụ đang tắt vẫn mở form), và **mỗi mục dẫn tới một địa chỉ RIÊNG trùng web** — đích
 * trùng nhau nghĩa là hai mục menu mở cùng một màn mà không ai nhận ra.
 */
describe('VEHICLE_MANAGE_NAV', () => {
  it('ba nhóm, đúng thứ tự và đúng dịch vụ của từng nhóm', () => {
    expect(VEHICLE_MANAGE_NAV.map((g) => g.key)).toEqual(['general', 'selfDrive', 'withDriver']);
    expect(VEHICLE_MANAGE_NAV.map((g) => g.serviceType)).toEqual([
      null,
      SERVICE_TYPE.SELF_DRIVE,
      SERVICE_TYPE.WITH_DRIVER,
    ]);
  });

  it('13 mục, đúng thứ tự của menu trái bên web', () => {
    expect(ALL_SECTIONS).toEqual([
      VEHICLE_MANAGE_SECTION.INFORMATION,
      VEHICLE_MANAGE_SECTION.IMAGES,
      VEHICLE_MANAGE_SECTION.DOCUMENTS,
      VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME,
      VEHICLE_MANAGE_SECTION.SELF_DRIVE_TERMS,
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_PRICING,
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
      VEHICLE_MANAGE_SECTION.WITH_DRIVER_TERMS,
    ]);
  });

  /** Mockup có "Tiện ích bổ sung" nhưng nghiệp vụ không — phụ phí mặc định đã nằm ở "Phụ phí". */
  it('nhóm có tài xế KHÔNG có mục "Tiện ích bổ sung"', () => {
    expect(ALL_SECTIONS.some((s) => /amenit|addon/i.test(s))).toBe(false);
  });

  it('mục chung không thuộc dịch vụ nào; mục dịch vụ thuộc đúng dịch vụ của nó', () => {
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.INFORMATION)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.TRIP_HISTORY)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY)).toBe(
      SERVICE_TYPE.SELF_DRIVE,
    );
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES)).toBe(
      SERVICE_TYPE.WITH_DRIVER,
    );
  });
});

describe('ROUTES.account.vehicleManageSection', () => {
  it('mỗi mục một địa chỉ RIÊNG — không mục nào rơi về mặc định', () => {
    const paths = ALL_SECTIONS.map(pathOf);
    expect(new Set(paths).size).toBe(paths.length);
  });

  /**
   * Đường dẫn trùng web tới từng đoạn, để một liên kết sâu do web hay thông báo đẩy sinh ra mở
   * đúng màn trong app.
   */
  it('đường dẫn khớp URL của web, kể cả hai đoạn của nhóm dịch vụ', () => {
    const base = '/account/vehicles/[id]/manage';
    expect(pathOf(VEHICLE_MANAGE_SECTION.INFORMATION)).toBe(`${base}/information`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.TRIP_HISTORY)).toBe(`${base}/trip-history`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME)).toBe(
      `${base}/self-drive/handover-time`,
    );
    expect(pathOf(VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES)).toBe(
      `${base}/with-driver/surcharges`,
    );
  });

  it('gốc không gian là mục lục, không phải một mục', () => {
    const href = ROUTES.account.vehicleManage(VEHICLE_ID);
    expect(typeof href === 'string' ? href : href.pathname).toBe(
      '/account/vehicles/[id]/manage',
    );
  });
});
