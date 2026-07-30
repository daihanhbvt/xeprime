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
 * "Thuê xe chỉ với 4 bước" — nội dung TĨNH (không phải dữ liệu nghiệp vụ). `icon` là key để
 * constants không phụ thuộc React; component tự map sang icon.
 */
export const RENTAL_STEPS: ReadonlyArray<{
  no: string;
  icon: 'search' | 'check' | 'car' | 'star';
  title: string;
  desc: string;
}> = [
  {
    no: '01',
    icon: 'search',
    title: 'Chọn xe & gửi yêu cầu',
    desc: 'Tìm ô tô hoặc xe máy phù hợp, gửi yêu cầu thuê chỉ trong vài bước.',
  },
  {
    no: '02',
    icon: 'check',
    title: 'Chủ xe xác nhận',
    desc: 'Chủ xe báo giá, cọc và hẹn giao nhận — bạn duyệt là xong.',
  },
  {
    no: '03',
    icon: 'car',
    title: 'Nhận xe & lên đường',
    desc: 'Nhận xe tại điểm hẹn và bắt đầu hành trình của bạn.',
  },
  {
    no: '04',
    icon: 'star',
    title: 'Trả xe & đánh giá',
    desc: 'Trả xe đúng hẹn và để lại đánh giá cho chủ xe.',
  },
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
      { label: 'Đăng xe cho thuê', href: ROUTES.MANAGE.ROOT },
      { label: 'Quản lý xe', href: ROUTES.MANAGE.VEHICLES },
      { label: 'Bảng giá', href: ROUTES.HOME },
    ],
  },
];

