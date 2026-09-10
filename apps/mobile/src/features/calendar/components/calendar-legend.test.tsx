import { StyleSheet, type ViewStyle } from 'react-native';
import { render } from '@testing-library/react-native';
import { withIntl } from '@/i18n/test-utils';
import { CalendarLegend } from './CalendarLegend';

/**
 * Chú giải phải NẰM YÊN ở chiều cao nội dung của nó.
 *
 * `Screen` dựng nội dung thành một cột flex, và vùng lưới ngay dưới là `flex: 1`. Một `ScrollView`
 * không bị chặn sẽ tranh chỗ với vùng lưới đó: hai bên chia đôi khoảng trống, dải chú giải phình
 * ra vài trăm dp và lưới bị dồn xuống đáy còn ba hàng xe. Lỗi này KHÔNG lộ ra ở typecheck, không
 * lộ ở lint, và không lộ ở bất kỳ test hành vi nào — chỉ lộ khi mở app ra nhìn.
 */
describe('CalendarLegend', () => {
  it('KHÔNG nở ra theo chiều dọc — nếu không, lưới lịch mất gần hết chỗ', async () => {
    const view = await render(withIntl(<CalendarLegend />));

    const style = StyleSheet.flatten<ViewStyle>(
      view.getByLabelText('Chú giải lịch').props.style as ViewStyle,
    );

    expect(style.flexGrow).toBe(0);
    expect(style.flexShrink).toBe(0);
  });

  /**
   * Bảy mục, SINH RA từ META chứ không chép tay: hai trạng thái đơn chiếm lịch mà người dùng
   * thật sự gặp, ba nguồn chiếm lịch khác, rồi giá riêng và ngày lễ.
   *
   * Bản trước liệt kê "Đơn thuê" — không phải một trạng thái nào cả — và bỏ sót "Đã giữ xe".
   * Web đã sửa ở `fix(web): sync calendar status colors and legend`; test này khoá bộ mới, và
   * nhãn phải đến từ `Domain` để chú giải với viên trạng thái ở màn chi tiết không bao giờ gọi
   * tên khác nhau.
   */
  it('bày đủ BẢY mục, nhãn lấy từ Domain đúng như web', async () => {
    const view = await render(withIntl(<CalendarLegend />));

    for (const label of [
      'Đã giữ xe',
      'Đang thuê',
      'Chờ giữ chỗ',
      'Bảo dưỡng',
      'Xe bị khóa',
      'Giá riêng',
      'Ngày lễ',
    ]) {
      expect(view.getByText(label)).toBeTruthy();
    }

    // "Đơn thuê" là tên của LOẠI nguồn, không phải một trạng thái — không còn là mục chú giải.
    expect(view.queryByText('Đơn thuê')).toBeNull();
  });
});
