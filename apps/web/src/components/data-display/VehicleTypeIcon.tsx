import Icon, { CarOutlined } from '@ant-design/icons';
import type { GetProps } from 'antd';
import { VEHICLE_TYPE, type VehicleType } from '@xeprime/types';

type IconProps = GetProps<typeof Icon>;

/**
 * Nét vẽ xe máy — `@ant-design/icons` KHÔNG có biểu tượng nào cho xe máy, mà đây là một nửa sản
 * phẩm của XePrime.
 *
 * Dựng qua `Icon component={...}` — đúng API mà AntD cấp để bổ sung một glyph còn thiếu, nên
 * kho vẫn chỉ có MỘT bộ icon (CLAUDE §4: không thêm thư viện icon thứ hai). Vẽ bằng NÉT thay vì
 * mảng đặc để cùng trọng lượng thị giác với các icon outline của AntD đứng cạnh nó.
 */
function MotorbikeSvg() {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true">
      <g
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      >
        {/* Hai bánh */}
        <circle cx="5" cy="16.5" r="3.9" />
        <circle cx="19" cy="16.5" r="3.9" />
        {/* Khung: bánh sau → yên → cổ phuộc */}
        <path d="M5 16.5h5.2l3.3-6h4.2" />
        {/* Phuộc trước xuống bánh trước */}
        <path d="M13.5 10.5 19 16.5" />
        {/* Ghi đông */}
        <path d="M15.8 5.5h3.6l1.4 5" />
      </g>
    </svg>
  );
}

export function MotorbikeOutlined(props: IconProps) {
  return <Icon component={MotorbikeSvg} {...props} />;
}

/**
 * Biểu tượng của MỘT loại xe — nơi duy nhất trả lời "ô tô/xe máy trông như thế nào".
 *
 * Có bảng này thì mọi bộ chọn loại xe (thẻ tìm kiếm, thanh thu gọn, form đăng xe…) không thể
 * mỗi chỗ chọn một biểu tượng khác nhau, và thêm loại xe mới chỉ phải sửa ở đây.
 */
export const VEHICLE_TYPE_ICON: Readonly<Record<VehicleType, React.ComponentType<IconProps>>> = {
  [VEHICLE_TYPE.CAR]: CarOutlined,
  [VEHICLE_TYPE.MOTORBIKE]: MotorbikeOutlined,
};
