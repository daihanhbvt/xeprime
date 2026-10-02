import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { withIntl } from '@/i18n/test-utils';
import { space } from '@/theme/tokens';
import { RevenueTrendChart, SCROLL_TEST_ID } from './RevenueTrendChart';
import type { FinanceSeriesBucket } from '../api';

/** Bề rộng vùng vẽ mà component tính ra — màn của jest, trừ lề trang và cột nhãn trục Y (46dp). */
const PLOT_WIDTH = Dimensions.get('window').width - space.md * 2 - 46;

function bucket(over: Partial<FinanceSeriesBucket> = {}): FinanceSeriesBucket {
  return {
    bucket: '2026-09-01',
    revenue: '1500000',
    cost: '400000',
    profit: '1100000',
    cashIn: '1500000',
    cashOut: '400000',
    ...over,
  } as FinanceSeriesBucket;
}

/** Nhãn TRỤC: ngắn hết mức. */
const LABEL = (value: string) => `${value.slice(8)}/${value.slice(5, 7)}`;

/** Tên ĐẦY ĐỦ của mốc — thứ thẻ chi tiết và trình đọc màn hình dùng. */
const TITLE = (value: string) => `Ngày ${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
const FULL = TITLE('2026-09-01');

/**
 * ĐỒNG HỒ GIẢ, bắt buộc ở file này.
 *
 * `BarChart` hẹn một `setTimeout(labelsAppear, animationDuration)` ngay lúc mount và KHÔNG có
 * prop nào tắt được nó (`isAnimated={false}` chỉ tắt animation của cột). Test kết thúc trước
 * 800ms mặc định, jest dỡ môi trường, rồi callback mới chạy — `Animated` lúc đó là `undefined`
 * và tiến trình worker chết kèm một stack không trỏ vào test nào.
 *
 * Đồng hồ giả làm cái hẹn đó không bao giờ tới. Đi kèm là truy vấn ĐỒNG BỘ (`getByText`): biểu
 * đồ không có dữ liệu bất đồng bộ nào, nên `findBy*` chỉ thêm một vòng `waitFor` phải nhờ tới
 * chính bộ đếm thời gian mình vừa đóng băng.
 */
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

/**
 * Chạm rồi ĐỢI React vẽ lại.
 *
 * `fireEvent.press` trả về trước khi lượt render kế tiếp chạy — state đã đổi nhưng cây chưa cập
 * nhật, nên đọc ngay sau đó vẫn thấy màn hình cũ. `act` bất đồng bộ đẩy hết việc còn tồn của
 * React mà không phải đụng tới bộ đếm thời gian đang bị đóng băng.
 */
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await act(async () => {
    fireEvent.press(element);
  });
}

/**
 * Biểu đồ dựng THẬT bằng `react-native-gifted-charts`.
 *
 * Test này không kiểm hình — nó kiểm rằng **cây component dựng được**. Thư viện kéo theo
 * `react-native-svg` và nạp `expo-linear-gradient` bằng `require` trong `try/catch`
 * (`Components/common/LinearGradient.js`), và cái `catch` cuối cùng **ném lỗi** khi không tìm
 * thấy gói gradient nào. Thiếu một peer là màn Tổng quan doanh thu trắng ngay khi có dữ liệu —
 * đúng loại lỗi chỉ lộ ra trên máy thật nếu ở đây không có ai dựng thử.
 */
describe('RevenueTrendChart', () => {
  it('dựng được với dữ liệu bình thường', async () => {
    const { getByText } = await render(
      withIntl(
        <RevenueTrendChart
          buckets={[bucket(), bucket({ bucket: '2026-09-02', revenue: '800000' })]}
          labelOf={LABEL}
          titleOf={TITLE}
        />,
      ),
    );

    // Ba chuỗi được vẽ ⇒ ba mục chú giải, khớp đúng thứ có trên hình.
    expect(getByText('Doanh thu')).toBeTruthy();
    expect(getByText('Chi phí')).toBeTruthy();
    expect(getByText('Lợi nhuận')).toBeTruthy();
  });

  it('dựng được khi có LỖ — nửa dưới trục 0 phải mở ra, không nổ', async () => {
    const { getByText } = await render(
      withIntl(
        <RevenueTrendChart
          buckets={[bucket({ revenue: '100000', cost: '900000', profit: '-800000' })]}
          labelOf={LABEL}
          titleOf={TITLE}
        />,
      ),
    );

    expect(getByText('Lợi nhuận')).toBeTruthy();
  });

  it('dựng được khi MỌI giá trị bằng 0 — không chia cho 0 khi dựng trục', async () => {
    const { getByText } = await render(
      withIntl(
        <RevenueTrendChart
          buckets={[bucket({ revenue: '0', cost: '0', profit: '0' })]}
          labelOf={LABEL}
          titleOf={TITLE}
        />,
      ),
    );

    expect(getByText('Doanh thu')).toBeTruthy();
  });

  it('một mốc duy nhất vẫn dựng được — đường lợi nhuận chỉ có một điểm', async () => {
    const { getByText } = await render(
      withIntl(<RevenueTrendChart buckets={[bucket()]} labelOf={LABEL} titleOf={TITLE} />),
    );

    expect(getByText('Lợi nhuận')).toBeTruthy();
  });

  /**
   * Thang trục Y phải RA TỚI HÌNH, không chỉ đúng trong hàm thuần.
   *
   * Với đỉnh `2.839.966 ₫` và đáy `−2.839.966 ₫`, `recharts` bên web in đúng năm vạch
   * `−3tr · −1,5tr · 0 · 1,5tr · 3tr`. Nếu thang không đi hết đường từ `niceAxis` sang thư viện
   * vẽ — sai prop, thiếu `stepValue`, quên `noOfSectionsBelowXAxis` — thì hàm thuần vẫn xanh mà
   * người dùng vẫn thấy một trục khác web.
   */
  it('in đúng dải trục của web, cả hai phía đường 0', async () => {
    const { getByText } = await render(
      withIntl(
        <RevenueTrendChart
          buckets={[
            bucket({ revenue: '0', cost: '2839966', profit: '-2839966' }),
            bucket({ bucket: '2026-09-02', revenue: '0', cost: '0', profit: '0' }),
          ]}
          labelOf={LABEL}
          titleOf={TITLE}
        />,
      ),
    );

    for (const tick of ['3tr', '1,5tr', '-1,5tr', '-3tr']) {
      expect(getByText(tick)).toBeTruthy();
    }
  });

  /**
   * Chạm một mốc là mở đúng số của mốc ĐÓ.
   *
   * Dải chạm phủ trọn chiều cao nên nó luôn tồn tại — kể cả ngày không phát sinh đồng nào, khi hai
   * cột đều cao 0dp và trên hình chỉ còn một cái chấm trên đường lợi nhuận.
   */
  it('chạm vào một mốc mở thẻ chi tiết của đúng mốc đó', async () => {
    const { getByLabelText, getByText, queryByText } = await render(
      withIntl(
        <RevenueTrendChart
          buckets={[
            bucket(),
            bucket({ bucket: '2026-09-02', revenue: '0', cost: '0', profit: '0' }),
          ]}
          labelOf={LABEL}
          titleOf={TITLE}
        />,
      ),
    );

    // Chưa chạm gì: một dòng MỜI CHẠM, không phải khoảng trắng.
    expect(getByText('Chạm vào một mốc trên biểu đồ để xem số của mốc đó.')).toBeTruthy();

    await press(getByLabelText(FULL));

    expect(getByText('1.500.000 ₫')).toBeTruthy();
    expect(getByText('400.000 ₫')).toBeTruthy();
    expect(getByText('1.100.000 ₫')).toBeTruthy();
    expect(queryByText('Chạm vào một mốc trên biểu đồ để xem số của mốc đó.')).toBeNull();

    // Thẻ mang tên ĐẦY ĐỦ của mốc, trong khi trục vẫn giữ bản ngắn — hai vai, hai chuỗi.
    expect(getByText(FULL)).toBeTruthy();
    expect(getByText('01/09')).toBeTruthy();
  });

  it('chạm lại chính mốc đang mở thì đóng thẻ — không kẹt ở một mốc cũ', async () => {
    const { getByLabelText, getByText, queryByText } = await render(
      withIntl(<RevenueTrendChart buckets={[bucket()]} labelOf={LABEL} titleOf={TITLE} />),
    );

    await press(getByLabelText(FULL));
    expect(getByText('1.500.000 ₫')).toBeTruthy();

    await press(getByLabelText(FULL));
    expect(queryByText('1.500.000 ₫')).toBeNull();
    expect(getByText('Chạm vào một mốc trên biểu đồ để xem số của mốc đó.')).toBeTruthy();
  });

  /**
   * Kỳ 30 ngày: cuộn được, và cuộn ĐƯỢC LÀ VÌ dải chạm nằm TRONG vùng cuộn.
   *
   * Hồi quy của một bug thật: khi lớp chạm là anh em của vùng cuộn, dải nhận touch trước và biểu
   * đồ đứng im ở mốc thứ sáu — 24 ngày cuối tháng không có đường nào xem tới. Test khoá lại đúng
   * điều kiện đã sửa nó: có một `ScrollView` ngang MỞ, và mọi dải chạm là con cháu của nó.
   */
  it('kỳ 30 ngày: cuộn ngang được, và dải chạm nằm trong vùng cuộn', async () => {
    const buckets = Array.from({ length: 30 }, (_, index) =>
      bucket({
        bucket: `2026-09-${String(index + 1).padStart(2, '0')}`,
        revenue: String((index + 1) * 100000),
        cost: '50000',
        profit: String((index + 1) * 100000 - 50000),
      }),
    );
    const { getByTestId, getByLabelText, getByText } = await render(
      withIntl(<RevenueTrendChart buckets={buckets} labelOf={LABEL} titleOf={TITLE} />),
    );

    // Vùng cuộn phải MỞ: 30 mốc ở cỡ cột thoải mái dài hơn khung của điện thoại.
    const scroll = getByTestId(SCROLL_TEST_ID);
    expect(scroll.props.horizontal).toBe(true);
    expect(scroll.props.scrollEnabled).toBe(true);
    expect(scroll.props.contentContainerStyle.width).toBeGreaterThan(PLOT_WIDTH);

    // Và dải chạm là CON của vùng cuộn — chỗ duy nhất RN tự phân xử được chạm-hay-vuốt.
    const last = getByLabelText(TITLE('2026-09-30'));
    expect(within(scroll).getByLabelText(TITLE('2026-09-30'))).toBe(last);

    // Nhãn mốc cuối phải CÓ trên trục — nó là thứ nói ra kỳ này xem tới ngày nào.
    expect(getByText('30/09')).toBeTruthy();

    await press(last);
    expect(getByText('3.000.000 ₫')).toBeTruthy();
    expect(getByText('2.950.000 ₫')).toBeTruthy();
    expect(getByText(TITLE('2026-09-30'))).toBeTruthy();
  });
});
