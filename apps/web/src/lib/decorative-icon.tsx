import type { ReactNode } from 'react';

/**
 * Bọc một icon lại thành phần TRANG TRÍ thuần tuý.
 *
 * Icon của `@ant-design/icons` tự render `role="img"` kèm `aria-label` là TÊN ICON ("eye",
 * "calendar", "ellipsis"). Tên đó lọt vào accessible name của phần tử chứa nó, cho ra những
 * chuỗi như `"eye Thu tiền"` hay `"calendar Lịch xe"` — trình đọc màn hình đọc thừa một từ
 * tiếng Anh vô nghĩa trước mỗi nhãn.
 *
 * Gói ở `lib/` vì đây là consumer thứ hai: `RowActions` (Wave 1C, lỗi D15.10) và `MobileNav`
 * (Wave 1D-C, lỗi D16.1) mắc đúng một lỗi cách nhau hai wave. Chép lần thứ ba là chắc chắn
 * quên một chỗ.
 */
export function decorativeIcon(icon: ReactNode): ReactNode {
  return icon ? <span aria-hidden="true">{icon}</span> : undefined;
}
