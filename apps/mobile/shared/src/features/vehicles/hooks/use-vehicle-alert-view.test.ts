import { VEHICLE_ALERT_KIND } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { VEHICLE_MANAGE_SECTION } from '@/navigation/vehicle-manage-section';
import type { VehicleAlertItem } from '../api';
import { vehicleAlertView } from './use-vehicle-alert-view';

const ID = '01JQZX0000000000000000000V';

function alert(kind: string): VehicleAlertItem {
  return { kind, severity: 'warning', title: kind, href: '/manage/x' } as unknown as VehicleAlertItem;
}

const ALERTS = [
  alert(VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED),
  alert(VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE),
  alert(VEHICLE_ALERT_KIND.MISSING_ODOMETER),
  alert(VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO),
];

/** Bản native của `useVehicleAlertView` web — lọc theo năng lực, đích theo khu. */
describe('vehicleAlertView', () => {
  it('không có module bảo dưỡng ⇒ bỏ cảnh báo bảo dưỡng/KM, giữ thứ tự còn lại', () => {
    const kinds = vehicleAlertView(ID, ALERTS, { canMaintenance: false, customerScope: false }).map(
      (a) => a.kind,
    );
    expect(kinds).toEqual([
      VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED,
      VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO,
    ]);
  });

  it('cổng quản lý: mỗi loại trỏ về đúng mục của màn sửa xe', () => {
    const view = vehicleAlertView(ID, ALERTS, { canMaintenance: true, customerScope: false });
    expect(view.map((a) => a.target)).toEqual([
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.DOCUMENTS),
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.MAINTENANCE),
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.MAINTENANCE),
      ROUTES.manage.vehicleEditTab(ID, VEHICLE_EDIT_TAB.INFORMATION),
    ]);
  });

  it('khu tài khoản: mục của không gian quản lý xe; bảo dưỡng không có mục ⇒ null (vẫn hiện)', () => {
    const view = vehicleAlertView(ID, ALERTS, { canMaintenance: true, customerScope: true });
    expect(view.map((a) => a.target)).toEqual([
      ROUTES.account.vehicleManageSection(ID, VEHICLE_MANAGE_SECTION.DOCUMENTS),
      null,
      null,
      ROUTES.account.vehicleManageSection(ID, VEHICLE_MANAGE_SECTION.INFORMATION),
    ]);
  });

  it('cảnh báo ngoài bảng ⇒ không có lối đi (href web không dùng được trong app)', () => {
    const [only] = vehicleAlertView(ID, [alert('handover_missing_return_odometer')], {
      canMaintenance: true,
      customerScope: false,
    });
    expect(only?.target).toBeNull();
  });
});
