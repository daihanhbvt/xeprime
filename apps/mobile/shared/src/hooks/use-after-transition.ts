import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';

/**
 * Dự phòng khi navigator không phát `transitionEnd` (màn đầu của deep link, môi trường test):
 * dài hơn hiệu ứng trượt mặc định một chút, để không bao giờ kẹt ở trạng thái "chưa sẵn sàng".
 */
const FALLBACK_MS = 450;

/**
 * `true` khi hiệu ứng ĐẨY màn này vào đã chạy xong.
 *
 * Dùng để hoãn phần nặng NẰM DƯỚI màn (thẻ đặt xe, bản đồ, đánh giá…): dựng chúng cùng lúc với
 * hiệu ứng trượt là chiếm luồng JS đúng khung hình đầu, và người dùng thấy cú chạm "khựng" rồi
 * màn mới bật ra. Phần đầu màn vẫn dựng ngay.
 */
export function useAfterTransition(): boolean {
  const navigation = useNavigation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const done = () => setReady(true);
    // `transitionEnd` có ở native-stack; navigator khác không có thì chỉ còn đồng hồ dự phòng.
    const unsubscribe = (
      navigation as unknown as {
        addListener?: (event: 'transitionEnd', cb: () => void) => () => void;
      }
    ).addListener?.('transitionEnd', done);
    const timer = setTimeout(done, FALLBACK_MS);
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
    };
  }, [navigation, ready]);

  return ready;
}
