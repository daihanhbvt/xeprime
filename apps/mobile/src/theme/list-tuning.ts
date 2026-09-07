import { Platform } from 'react-native';

/**
 * Cửa sổ dựng của MỌI danh sách dài trong app.
 *
 * Mặc định của `FlatList` là `initialNumToRender: 10` và `windowSize: 21` — tức nó giữ sống **21
 * màn hình** nội dung quanh vùng đang xem. Một thẻ đơn thuê hay thẻ xe là chục view lồng nhau kèm
 * ảnh, nhãn trạng thái và bốn dòng chữ; hai mươi mốt màn của thứ đó là hàng nghìn view native cho
 * nội dung không ai nhìn — và đó chính là lý do cuộn giật.
 *
 * Ở MỘT chỗ chứ không chép vào từng màn: trước đây `TripsScreen` và `VehicleListScreen` mỗi bên
 * một bản, và hai bản đã kịp lệch nhau ở `removeClippedSubviews`. Tinh chỉnh một con số cho cả
 * app phải là sửa một dòng, không phải đi tìm bảy chỗ.
 *
 * Ba con số đặt quanh một trang 10 mục:
 * - `initialNumToRender: 6` — màn 390×844 thấy khoảng bốn thẻ; 6 phủ màn đầu cộng đệm mà không
 *   bắt người dùng chờ cả 10 thẻ vẽ xong mới thấy gì.
 * - `maxToRenderPerBatch: 6` — mỗi nhịp cuộn dựng thêm tối đa một màn, giữ JS thread rảnh để còn
 *   xử lý chính cú cuộn đó.
 * - `windowSize: 7` — giữ sống ba màn trên và ba màn dưới vùng xem; cuộn ngược lại không phải vẽ
 *   lại từ đầu.
 *
 * `onEndReachedThreshold: 0.5` — nối trang khi còn cách đáy nửa màn. Gọi đúng mép đáy thì người
 * dùng luôn nhìn thấy khoảng trắng chờ; gọi quá sớm là kéo về dữ liệu chưa ai cuộn tới. Vô hại
 * với danh sách phân trang: ở đó không có `onEndReached` để kích hoạt.
 */
export const LIST_TUNING = {
  initialNumToRender: 6,
  maxToRenderPerBatch: 6,
  windowSize: 7,
  onEndReachedThreshold: 0.5,
  /**
   * CHỈ bật trên Android.
   *
   * Nó tháo view đã ra khỏi màn khỏi cây native — lãi thật trên Android. Trên iOS thì đây là
   * nguồn lỗi "ô trắng" quen thuộc của React Native (view bị gỡ rồi không gắn lại khi cuộn
   * ngược), mà lợi ích lại không đáng vì iOS vốn tái sử dụng cell tốt hơn.
   */
  removeClippedSubviews: Platform.OS === 'android',
} as const;
