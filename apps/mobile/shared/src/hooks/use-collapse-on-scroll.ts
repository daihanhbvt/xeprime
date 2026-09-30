import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

export interface CollapseOnScroll {
  /** Gắn vào `Animated.ScrollView` / `Animated.FlatList`, kèm `scrollEventThrottle`. */
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  /** 1 = hiện đủ · 0 = thu hết lên trên. Bộ nhận cuộn là nguồn ghi DUY NHẤT. */
  progress: SharedValue<number>;
  /** Chiều cao đã đo — khối nằm đè nên nội dung phải tự chừa `paddingTop` bằng con số này. */
  height: number;
  /** Cùng con số nhưng ở shared value: worklet phải đọc cái này, KHÔNG đọc `height`. */
  heightValue: SharedValue<number>;
  /** Gắn vào chính khối thu gọn để đo nó. */
  onLayout: (event: LayoutChangeEvent) => void;
}

/**
 * Khối đầu trang thu lại khi cuộn XUỐNG, ló ra khi cuộn LÊN.
 *
 * Trượt theo CHIỀU cuộn chứ không theo độ sâu: cuộn ngược lên là người dùng đang muốn với tới bộ
 * lọc, phải trả nó ra ngay chứ không bắt cuộn hết về đầu trang. (Trang chủ khách dùng luật khác —
 * thanh tìm xe ở đó hiện theo ĐỘ SÂU đã cuộn qua ảnh bìa, nên nó không dùng hook này.)
 *
 * Cộng dồn quãng cuộn rồi kẹp trong [0,1], KHÔNG `withTiming` và không `setState`:
 *
 *  - chạy hoạt cảnh theo từng sự kiện cuộn thì mỗi sự kiện khởi động lại nó từ vị trí hiện tại,
 *    nên khối chỉ tiệm cận 0/1 mà không bao giờ tới — nó đứng lưng chừng, trễ một nhịp sau ngón
 *    tay, và để lại một mảng chắn ngang đầu danh sách;
 *  - chỉ chạy khi đích đổi thì hỏng kiểu khác: cuộn chậm, mỗi sự kiện dịch chưa tới ngưỡng, khối
 *    không nhúc nhích lần nào;
 *  - `setState` mỗi sự kiện là hai lần render React ngay giữa lúc đang cuộn.
 *
 * Cộng dồn thì khối bám ngón tay — kéo ngược một chút là nó ló ra một chút — và vì `progress` bị
 * KẸP chứ không suy từ layout nên không có đường nào để nó dao động.
 *
 * Chiều cao giữ ở CẢ shared value lẫn state React vì worklet cuộn chạy trên luồng UI và bắt biến
 * closure lúc nó được dựng: khi đó `height` còn là 0 (chưa `onLayout`), nên nhánh "chưa đo xong
 * thì thôi" sẽ chặn vĩnh viễn và khối không bao giờ thu lại. Shared value thì worklet đọc giá trị
 * hiện tại ở mỗi khung hình.
 */
export function useCollapseOnScroll(): CollapseOnScroll {
  const [height, setHeight] = useState(0);
  const heightValue = useSharedValue(0);
  const progress = useSharedValue(1);
  const lastOffset = useSharedValue(0);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.height;
      heightValue.value = next;
      setHeight(next);
    },
    /*
     * Shared value KHÔNG vào deps: chúng ổn định theo hợp đồng của Reanimated, và đưa vào thì
     * `react-hooks` báo "modifying a value previously passed as an argument to a hook" vì thân
     * callback gán `.value`.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const delta = y - lastOffset.value;
      lastOffset.value = y;

      // Chạm đỉnh là hiện lại nguyên vẹn — kể cả khi cú nảy của `RefreshControl` cho y âm.
      if (y <= 0) {
        progress.value = 1;
        return;
      }
      const measured = heightValue.value;
      if (measured <= 0) return;

      progress.value = Math.min(Math.max(progress.value - delta / measured, 0), 1);
    },
  });

  return { onScroll, progress, height, heightValue, onLayout };
}
