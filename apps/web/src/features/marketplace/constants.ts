import { SERVICE_TYPE, VEHICLE_TYPE, type ServiceType, type VehicleType } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';

/** Tab loại xe ở hero (Ô tô / Xe máy). */
export const VEHICLE_TABS: ReadonlyArray<{ key: VehicleType; label: string }> = [
  { key: VEHICLE_TYPE.CAR, label: 'Ô tô tự lái' },
  { key: VEHICLE_TYPE.MOTORBIKE, label: 'Xe máy' },
];

/** Loại dịch vụ dùng làm chip lọc nhanh. */
export const SERVICE_CHIPS: ReadonlyArray<{ key: ServiceType; label: string }> = [
  { key: SERVICE_TYPE.SELF_DRIVE, label: 'Tự lái' },
  { key: SERVICE_TYPE.WITH_DRIVER, label: 'Có tài xế' },
  { key: SERVICE_TYPE.LONG_TERM, label: 'Thuê dài hạn' },
];

/**
 * "Thuê xe chỉ với 4 bước" — nội dung TĨNH (không phải dữ liệu nghiệp vụ), chữ theo Figma 18:4.
 */
export const RENTAL_STEPS: ReadonlyArray<{
  no: string;
  title: string;
  desc: string;
}> = [
  { no: '1', title: 'Tìm xe', desc: 'Chọn địa điểm và thời gian' },
  { no: '2', title: 'Gửi yêu cầu', desc: 'Liên hệ gian hàng' },
  { no: '3', title: 'Nhận xe', desc: 'Giao xe hoặc đến lấy' },
  { no: '4', title: 'Trả xe', desc: 'Hoàn tất chuyến đi' },
];

/** Cột liên kết ở chân trang — nội dung tĩnh, `href` trỏ route thật khi đã có. */
export const FOOTER_COLUMNS: ReadonlyArray<{
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}> = [
  {
    title: 'Về chúng tôi',
    links: [
      { label: 'Giới thiệu', href: ROUTES.HOME },
      { label: 'Blog', href: ROUTES.HOME },
      { label: 'Tuyển dụng', href: ROUTES.HOME },
      { label: 'Liên hệ', href: ROUTES.HOME },
    ],
  },
  {
    title: 'Hỗ trợ',
    links: [
      { label: 'Trung tâm trợ giúp', href: ROUTES.HOME },
      { label: 'Hướng dẫn thuê xe', href: ROUTES.HOME },
      { label: 'Điều khoản dịch vụ', href: ROUTES.HOME },
      { label: 'Chính sách bảo mật', href: ROUTES.HOME },
    ],
  },
  {
    title: 'Dành cho chủ xe',
    links: [
      // Ý định làm chủ xe → onboarding (proxy sẽ chèn bước đăng nhập nếu cần), KHÔNG phải
      // `/manage` — vào đó khi chưa có gian hàng chỉ gặp màn "Bạn chưa có gian hàng".
      { label: 'Đăng xe cho thuê', href: ROUTES.MANAGE.ONBOARDING },
      { label: 'Quản lý xe', href: ROUTES.MANAGE.VEHICLES },
      { label: 'Bảng giá', href: ROUTES.HOME },
    ],
  },
];
