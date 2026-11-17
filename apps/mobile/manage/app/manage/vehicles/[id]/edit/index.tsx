import { Redirect, useLocalSearchParams } from 'expo-router';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';

/**
 * Gốc màn SỬA XE ở cổng quản lý. Figma "Chỉnh sửa xe" MB là MỘT màn có dải tab gạch chân (không còn
 * menu hub): gốc mở thẳng tab "Thông tin chung", như web mở mục đầu của menu trái. Dải tab nằm ở
 * `VehicleEditHeader` của từng màn con.
 */
export default function ManageVehicleEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ROUTES.manage.vehicleEditTab(id, VEHICLE_EDIT_TAB.INFORMATION)} />;
}
