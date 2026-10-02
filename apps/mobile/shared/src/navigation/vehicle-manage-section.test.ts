import { MOBILE_CLIENT_APP, SERVICE_TYPE } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_NAV,
  VEHICLE_MANAGE_SECTION,
  sectionLabelKeyOf,
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
 * Không gian "Quản lý xe" — năm nhóm, chín mục, đúng `apps/web/src/features/vehicle-manage/
 * navigation.ts` (30/09/2026).
 *
 * Khoá ba thứ web cũng khoá: mục nào có mặt và đứng ở đâu, mục nào thuộc dịch vụ nào, và mỗi mục
 * dẫn tới một địa chỉ RIÊNG trùng web.
 */
describe('VEHICLE_MANAGE_NAV', () => {
  it('năm nhóm, đúng thứ tự, đúng nhãn menu và đúng dịch vụ của từng nhóm', () => {
    expect(VEHICLE_MANAGE_NAV.map((g) => g.key)).toEqual([
      'info',
      'pricingHandover',
      'selfDrive',
      'withDriver',
      'longTerm',
    ]);
    expect(VEHICLE_MANAGE_NAV.map((g) => g.labelKey)).toEqual([
      'groups.info',
      'groups.pricingHandover',
      'groups.selfDrive',
      'groups.withDriver',
      'groups.longTerm',
    ]);
    expect(VEHICLE_MANAGE_NAV.map((g) => g.serviceType)).toEqual([
      null,
      null,
      SERVICE_TYPE.SELF_DRIVE,
      SERVICE_TYPE.WITH_DRIVER,
      SERVICE_TYPE.LONG_TERM,
    ]);
  });

  it('chín mục, đúng thứ tự và nhãn của menu trái bên web', () => {
    expect(VEHICLE_MANAGE_NAV.flatMap((g) => g.items.map((i) => [i.section, i.labelKey]))).toEqual([
      [VEHICLE_MANAGE_SECTION.INFORMATION, 'items.information'],
      [VEHICLE_MANAGE_SECTION.IMAGES, 'items.images'],
      [VEHICLE_MANAGE_SECTION.DOCUMENTS, 'items.documents'],
      [VEHICLE_MANAGE_SECTION.TRIP_HISTORY, 'items.tripHistory'],
      [VEHICLE_MANAGE_SECTION.PRICING, 'items.pricing'],
      [VEHICLE_MANAGE_SECTION.HANDOVER_TIME, 'items.handoverTime'],
      [VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION, 'items.bookingTerms'],
      [VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION, 'items.bookingTerms'],
      [VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES, 'items.surcharges'],
    ]);
  });

  it('nhóm thuê dài hạn chỉ mang công tắc — không mục nào (giá tháng ở Giá & chính sách)', () => {
    expect(VEHICLE_MANAGE_NAV.find((g) => g.key === 'longTerm')?.items).toEqual([]);
  });

  it('giá và giờ giao nhận áp cho CẢ xe — không khoá theo dịch vụ', () => {
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.PRICING)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.HANDOVER_TIME)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.INFORMATION)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION)).toBe(
      SERVICE_TYPE.SELF_DRIVE,
    );
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES)).toBe(
      SERVICE_TYPE.WITH_DRIVER,
    );
  });

  it('nhãn tiêu đề của một mục là nhãn menu của nó', () => {
    expect(sectionLabelKeyOf(VEHICLE_MANAGE_SECTION.PRICING)).toBe('items.pricing');
    expect(sectionLabelKeyOf(VEHICLE_MANAGE_SECTION.HANDOVER_TIME)).toBe('items.handoverTime');
  });
});

/**
 * Địa chỉ của không gian "Quản lý xe" chỉ tồn tại ở app Customer (Owner Lite sống ở khu tài
 * khoản); app Partner không đăng ký khu đó.
 */
const describeCustomerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.CUSTOMER ? describe : describe.skip;

describeCustomerOnly('ROUTES.account.vehicleManageSection', () => {
  it('mỗi mục một địa chỉ RIÊNG — không mục nào rơi về mặc định', () => {
    const paths = ALL_SECTIONS.map(pathOf);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('đường dẫn khớp URL của web', () => {
    const base = '/account/vehicles/[id]/manage';
    expect(pathOf(VEHICLE_MANAGE_SECTION.INFORMATION)).toBe(`${base}/information`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.PRICING)).toBe(`${base}/pricing`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.HANDOVER_TIME)).toBe(`${base}/handover-time`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION)).toBe(
      `${base}/self-drive/optimization`,
    );
    expect(pathOf(VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES)).toBe(
      `${base}/with-driver/surcharges`,
    );
  });

  it('neo thủ tục đi qua tham số `anchor` (bản native của #rental-terms)', () => {
    expect(
      ROUTES.account.vehicleManageSection(
        VEHICLE_ID,
        VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
        { anchor: RENTAL_TERMS_ANCHOR },
      ),
    ).toEqual({
      pathname: '/account/vehicles/[id]/manage/self-drive/optimization',
      params: { id: VEHICLE_ID, anchor: 'rental-terms' },
    });
  });

  it('gốc không gian là mục lục, không phải một mục', () => {
    const href = ROUTES.account.vehicleManage(VEHICLE_ID);
    expect(typeof href === 'string' ? href : href.pathname).toBe('/account/vehicles/[id]/manage');
  });
});
