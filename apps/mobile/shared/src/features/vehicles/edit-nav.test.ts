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

const shape = (groups: ReturnType<typeof vehicleEditNavGroups>) =>
  groups.map((g) => [g.key, g.items.map((i) => i.tab)]);

/** Web `vehicle-edit-nav.ts` → `EDIT_MENU_GROUPS`: ba nhóm (ledger §3.6 E1), đúng thứ tự, đúng nhãn. */
describe('vehicleEditNavGroups - menu sửa xe như web', () => {
  it('đủ năng lực: ba nhóm, hai mục cho thuê, đúng thứ tự và nhãn web', () => {
    const groups = vehicleEditNavGroups({ enabled: () => true });
    expect(shape(groups)).toEqual([
      ['profile', ['information', 'media', 'documents', 'trip-history']],
      ['rental', ['pricing', 'policy']],
      ['advanced', ['maintenance', 'source']],
    ]);
    expect(groups.flatMap((g) => g.items.map((i) => i.labelKey))).toEqual([
      'information',
      'media',
      'documents',
      'trip-history',
      'services',
      'policy',
      'maintenance',
      'source',
    ]);
  });

  it('thiếu giấy tờ/nguồn xe/bảo dưỡng: mục biến mất, nhóm rỗng bị bỏ', () => {
    const hidden = new Set<VehicleEditTab>([
      VEHICLE_EDIT_TAB.DOCUMENTS,
      VEHICLE_EDIT_TAB.SOURCE,
      VEHICLE_EDIT_TAB.MAINTENANCE,
    ]);
    const groups = vehicleEditNavGroups({ enabled: (tab) => !hidden.has(tab) });
    expect(groups.map((g) => g.key)).toEqual(['profile', 'rental']);
  });

  it('mục → dịch vụ (web editTabServiceType)', () => {
    expect(editTabServiceType(VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION)).toBe(
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

describe('VEHICLE_EDIT_TAB - bí danh như web resolveEditTab', () => {
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
    // Gộp 03/11/2026 (web `resolveEditTab`): mọi lối cũ về giao nhận/điều khoản mở "Chính sách thuê".
    expect(resolveEditTab(VEHICLE_EDIT_TAB.OPERATIONS)).toBe(VEHICLE_EDIT_TAB.POLICY);
    expect(resolveEditTab(VEHICLE_EDIT_TAB.HANDOVER_TIME)).toBe(VEHICLE_EDIT_TAB.POLICY);
    expect(resolveEditTab(VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS)).toBe(VEHICLE_EDIT_TAB.POLICY);
    expect(resolveEditTab(VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS)).toBe(VEHICLE_EDIT_TAB.POLICY);
    expect(resolveEditTab(VEHICLE_EDIT_TAB.PRICING)).toBe(VEHICLE_EDIT_TAB.PRICING);
    expect(isTermsAlias(VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS)).toBe(true);
    expect(isTermsAlias(VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION)).toBe(false);
  });
});

/*
 * Ở app Customer mọi đích `/manage` đổ về handoff, nên phép so dạng đường dẫn chỉ có nghĩa ở app
 * Partner - đọc qua builder chứ không viết chuỗi literal.
 */
const describePartnerOnly =
  APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER ? describe : describe.skip;

describePartnerOnly('ROUTES.manage.vehicleEditTab - mục và bí danh', () => {
  const ID = '01JQZX0000000000000000000V';
  it('giao nhận / vận hành cũ → "Chính sách thuê" (web PolicyPane)', () => {
    const policy = { pathname: '/manage/vehicles/[id]/edit/policy', params: { id: ID } };
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.POLICY)).toEqual(policy);
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.OPERATIONS)).toEqual(policy);
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.HANDOVER_TIME)).toEqual(policy);
  });
  it('thủ tục mang neo cuộn tới khối thủ tục ở "Chính sách thuê"', () => {
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS)).toEqual({
      pathname: '/manage/vehicles/[id]/edit/policy',
      params: { id: ID, anchor: RENTAL_TERMS_ANCHOR },
    });
  });
  it('nhận chuyến tự động / phụ phí cũ → tab dịch vụ đó của "Dịch vụ & giá"', () => {
    expect(ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES)).toEqual({
      pathname: '/manage/vehicles/[id]/edit/pricing',
      params: { id: ID, service: SERVICE_TYPE.WITH_DRIVER },
    });
  });
});
