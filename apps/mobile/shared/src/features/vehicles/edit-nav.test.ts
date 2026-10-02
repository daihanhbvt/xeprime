import { MOBILE_CLIENT_APP, SERVICE_TYPE } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { ROUTES } from '@/navigation/routes';
import {
  VEHICLE_EDIT_TAB,
  isTermsAlias,
  resolveEditTab,
  type VehicleEditTab,
} from '@/navigation/vehicle-edit-tab';
import { RENTAL_TERMS_ANCHOR } from '@/navigation/vehicle-manage-section';
import { editTabServiceType, selfDriveOptimizationTarget, vehicleEditNavGroups } from './edit-nav';

const ALL_SERVICES = [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.LONG_TERM];
const shape = (groups: ReturnType<typeof vehicleEditNavGroups>) =>
  groups.map((g) => [g.key, g.items.map((i) => i.tab)]);

/** Web `vehicle-edit-nav.ts` → `editNavGroups`: sáu nhóm, đúng thứ tự, đúng nhãn. */
describe('vehicleEditNavGroups — menu sửa xe như web', () => {
  it('đủ năng lực: sáu nhóm, mười mục, đúng thứ tự', () => {
    const groups = vehicleEditNavGroups({ enabled: () => true, services: ALL_SERVICES });
    expect(shape(groups)).toEqual([
      ['info', ['information', 'media', 'documents']],
      ['pricingHandover', ['pricing', 'handover-time']],
      ['selfDrive', ['self-drive-optimization']],
      ['withDriver', ['with-driver-optimization', 'with-driver-surcharges']],
      ['longTerm', []],
      ['advanced', ['source', 'maintenance']],
    ]);
    expect(groups.map((g) => g.labelKey)).toEqual([
      'groups.info',
      'groups.pricingHandover',
      'groups.selfDrive',
      'groups.withDriver',
      'groups.longTerm',
      'groups.advanced',
    ]);
    expect(groups.flatMap((g) => g.items.map((i) => i.labelKey))).toEqual([
      'items.information',
      'items.images',
      'items.documents',
      'items.pricing',
      'items.handoverTime',
      'items.bookingTerms',
      'items.bookingTerms',
      'items.surcharges',
      'items.source',
      'items.maintenance',
    ]);
  });

  it('thiếu giấy tờ/nguồn xe/bảo dưỡng: mục biến mất, nhóm Nâng cao rỗng bị bỏ, nhóm dịch vụ giữ', () => {
    const hidden = new Set<VehicleEditTab>([
      VEHICLE_EDIT_TAB.DOCUMENTS,
      VEHICLE_EDIT_TAB.SOURCE,
      VEHICLE_EDIT_TAB.MAINTENANCE,
    ]);
    const groups = vehicleEditNavGroups({
      enabled: (tab) => !hidden.has(tab),
      services: ALL_SERVICES,
    });
    expect(shape(groups)).toEqual([
      ['info', ['information', 'media']],
      ['pricingHandover', ['pricing', 'handover-time']],
      ['selfDrive', ['self-drive-optimization']],
      ['withDriver', ['with-driver-optimization', 'with-driver-surcharges']],
      ['longTerm', []],
    ]);
  });

  it('nhóm của dịch vụ đang tắt mờ đi, nhóm chung không bao giờ mờ', () => {
    const groups = vehicleEditNavGroups({
      enabled: () => true,
      services: [SERVICE_TYPE.SELF_DRIVE],
    });
    expect(Object.fromEntries(groups.map((g) => [g.key, g.dimmed]))).toEqual({
      info: false,
      pricingHandover: false,
      selfDrive: false,
      withDriver: true,
      longTerm: true,
      advanced: false,
    });
  });

  it('mục → dịch vụ (web editTabServiceType)', () => {
    expect(editTabServiceType(VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES)).toBe(
      SERVICE_TYPE.WITH_DRIVER,
    );
    expect(editTabServiceType(VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION)).toBe(
      SERVICE_TYPE.SELF_DRIVE,
    );
    expect(editTabServiceType(VEHICLE_EDIT_TAB.HANDOVER_TIME)).toBeNull();
  });

  it('mục tự lái của xe chỉ có tài xế → mục có tài xế (web VehicleEditWorkspace)', () => {
    expect(selfDriveOptimizationTarget([SERVICE_TYPE.WITH_DRIVER])).toBe(
      VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
    );
    expect(selfDriveOptimizationTarget([SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER])).toBe(
      VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
    );
    expect(selfDriveOptimizationTarget([SERVICE_TYPE.LONG_TERM])).toBe(
      VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
    );
  });
});

describe('VEHICLE_EDIT_TAB — bí danh như web resolveEditTab', () => {
  it('giá trị chuỗi khớp web', () => {
    expect(VEHICLE_EDIT_TAB).toMatchObject({
      HANDOVER_TIME: 'handover-time',
      SELF_DRIVE_OPTIMIZATION: 'self-drive-optimization',
      SELF_DRIVE_TERMS: 'self-drive-terms',
      WITH_DRIVER_OPTIMIZATION: 'with-driver-optimization',
      WITH_DRIVER_SURCHARGES: 'with-driver-surcharges',
      WITH_DRIVER_TERMS: 'with-driver-terms',
      OPERATIONS: 'operations',
    });
  });

  it('resolveEditTab / isTermsAlias', () => {
    expect(resolveEditTab(VEHICLE_EDIT_TAB.OPERATIONS)).toBe(VEHICLE_EDIT_TAB.HANDOVER_TIME);
    expect(resolveEditTab(VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS)).toBe(
      VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
    );
    expect(resolveEditTab(VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS)).toBe(
      VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
    );
    expect(resolveEditTab(VEHICLE_EDIT_TAB.PRICING)).toBe(VEHICLE_EDIT_TAB.PRICING);
    expect(isTermsAlias(VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS)).toBe(true);
    expect(isTermsAlias(VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION)).toBe(false);
  });
});

/*
 * Ở app Customer mọi đích `/manage` đổ về handoff, nên phép so dạng đường dẫn chỉ có nghĩa ở app
 * Partner — đọc qua builder chứ không viết chuỗi literal.
 */
const describePartnerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER ? describe : describe.skip;

describePartnerOnly('ROUTES.manage.vehicleEditTab — mục và bí danh', () => {
  const ID = '01JQZX0000000000000000000V';
  it('bí danh đi thẳng tới mục thật', () => {
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.OPERATIONS)).toEqual(
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.HANDOVER_TIME),
    );
  });
  it('mục thủ tục mang neo cuộn tới khối thủ tục', () => {
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS)).toEqual({
      pathname: '/manage/vehicles/[id]/edit/self-drive-optimization',
      params: { id: ID, anchor: RENTAL_TERMS_ANCHOR },
    });
  });
});
