import type { VehicleFeatureKey } from '@xeprime/types';

/**
 * Nhãn TIẾNG ANH của tiện nghi xe cho lần nạp đầu (ADR 0012) — cột `catalog_items.label_en`.
 *
 * Kiểu `Record<VehicleFeatureKey, string>` là chủ ý: thêm một tiện nghi vào `VEHICLE_FEATURE_LABEL`
 * mà quên bản tiếng Anh là lỗi biên dịch, không phải một nhãn tiếng Việt lọt vào giao diện tiếng
 * Anh. Kiểu dáng / nhiên liệu nằm ở migration `20261020150000_catalog_item_english_labels` vì
 * chính bốn chiều gốc cũng do migration nạp; hãng xe là tên riêng nên không có bản dịch.
 *
 * Sau lần nạp đầu, DB là nguồn sự thật: admin sửa ở màn danh mục, seed không ghi đè.
 */
export const VEHICLE_FEATURE_LABEL_EN: Readonly<Record<VehicleFeatureKey, string>> = {
  bluetooth: 'Bluetooth',
  gps: 'GPS navigation',
  backup_camera: 'Reversing camera',
  camera_360: '360° camera',
  dash_camera: 'Dash cam',
  reverse_sensor: 'Parking sensors',
  sunroof: 'Sunroof',
  etc: 'ETC toll tag',
  spare_tire: 'Spare tyre',
  airbag: 'Airbags',
  usb: 'USB port',
  screen: 'Infotainment screen',
  map: 'Maps',
  child_seat: 'Child seat',
  abs: 'ABS brakes',
  traction_control: 'Traction control',
  smart_key: 'Smart key',
  phone_holder: 'Phone holder',
  top_box: 'Top box',
  helmet_included: 'Helmet included',
  raincoat_included: 'Raincoat included',
  anti_theft: 'Anti-theft lock',
};
