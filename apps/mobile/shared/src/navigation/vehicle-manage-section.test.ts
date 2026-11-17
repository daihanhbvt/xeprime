import { MOBILE_CLIENT_APP, SERVICE_TYPE } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_SECTION,
  parseServiceParam,
  sectionEditMenuKeyOf,
  sectionLabelKeyOf,
  sectionServiceType,
  type VehicleManageSection,
} from './vehicle-manage-section';

const VEHICLE_ID = '01M1X1AFM9M3JMWS2YZBYB1QN8';

function pathOf(section: VehicleManageSection): string {
  const href = ROUTES.account.vehicleManageSection(VEHICLE_ID, section);
  return typeof href === 'string' ? href : String(href.pathname);
}

const ALL_SECTIONS = Object.values(VEHICLE_MANAGE_SECTION);

/** Sáu mục của menu sửa xe Owner Lite — web `EDIT_MENU` khi `isManage === false`. */
const MENU_SECTIONS = [
  VEHICLE_MANAGE_SECTION.INFORMATION,
  VEHICLE_MANAGE_SECTION.IMAGES,
  VEHICLE_MANAGE_SECTION.DOCUMENTS,
  VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
  VEHICLE_MANAGE_SECTION.SERVICES,
  VEHICLE_MANAGE_SECTION.POLICY,
];

describe('mục sửa xe Owner Lite', () => {
  it('mục trên menu mang nhãn menu web (`Vehicles.editor.menu.items`)', () => {
    expect(MENU_SECTIONS.map(sectionEditMenuKeyOf)).toEqual([
      'information',
      'media',
      'documents',
      'trip-history',
      'services',
      'policy',
    ]);
  });

  it('mục CŨ không còn nhãn menu mới, giữ nhãn cũ cho màn cổng quản lý', () => {
    expect(sectionEditMenuKeyOf(VEHICLE_MANAGE_SECTION.PRICING)).toBeNull();
    expect(sectionLabelKeyOf(VEHICLE_MANAGE_SECTION.HANDOVER_TIME)).toBe('items.turnaround');
  });

  it('chỉ hai màn "Nhận chuyến & thủ tục" cũ thuộc một dịch vụ', () => {
    for (const section of MENU_SECTIONS) expect(sectionServiceType(section)).toBeNull();
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION)).toBe(
      SERVICE_TYPE.SELF_DRIVE,
    );
    expect(sectionServiceType(VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION)).toBe(
      SERVICE_TYPE.WITH_DRIVER,
    );
  });

  it('tham số `service` chỉ nhận dịch vụ thật', () => {
    expect(parseServiceParam('with_driver')).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(parseServiceParam(['long_term'])).toBe(SERVICE_TYPE.LONG_TERM);
    expect(parseServiceParam('x')).toBeUndefined();
    expect(parseServiceParam(undefined)).toBeUndefined();
  });
});

const describePartnerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER ? describe : describe.skip;
const describeCustomerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.CUSTOMER ? describe : describe.skip;

describeCustomerOnly('app XePrime - không còn màn sửa xe Owner Lite', () => {
  it('mọi mục đổ về màn handoff sang app Partner', () => {
    for (const section of ALL_SECTIONS) expect(pathOf(section)).toBe('/partner');
  });
});

describePartnerOnly('ROUTES.account.vehicleManageSection (app Partner)', () => {
  it('mỗi mục một địa chỉ RIÊNG - không mục nào rơi về mặc định', () => {
    const paths = ALL_SECTIONS.map(pathOf);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('đường dẫn dưới cây Owner Lite', () => {
    const base = '/manage/vehicles/[id]/manage';
    expect(pathOf(VEHICLE_MANAGE_SECTION.INFORMATION)).toBe(`${base}/information`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.SERVICES)).toBe(`${base}/services`);
    expect(pathOf(VEHICLE_MANAGE_SECTION.POLICY)).toBe(`${base}/policy`);
  });

  it('khối điều khoản đi qua `anchor` + `service` (web `termsOf`)', () => {
    expect(
      ROUTES.account.vehicleManageSection(VEHICLE_ID, VEHICLE_MANAGE_SECTION.POLICY, {
        anchor: RENTAL_TERMS_ANCHOR,
        service: SERVICE_TYPE.WITH_DRIVER,
      }),
    ).toEqual({
      pathname: '/manage/vehicles/[id]/manage/policy',
      params: { id: VEHICLE_ID, anchor: 'rental-terms', service: 'with_driver' },
    });
  });

  it('gốc là menu sửa xe, không phải một mục', () => {
    const href = ROUTES.account.vehicleManage(VEHICLE_ID);
    expect(typeof href === 'string' ? href : href.pathname).toBe('/manage/vehicles/[id]/manage');
  });
});
