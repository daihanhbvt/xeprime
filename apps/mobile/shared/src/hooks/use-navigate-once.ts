import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import type { Href } from 'expo-router';

/**
 * Khoảng thời gian bỏ qua cú chạm thứ hai. Đủ dài để nuốt một cú double-tap, đủ ngắn để người
 * dùng quay lại rồi bấm tiếp không bị chặn.
 */
const LOCK_MS = 700;

/**
 * Điều hướng CHỈ MỘT LẦN cho mỗi thao tác.
 *
 * `router.push` là lệnh thuần: chạm nhanh ba lần vào cùng một nút thì ba màn chồng lên nhau, và
 * người dùng phải bấm lui ba lần mới thoát. Lỗi này chỉ lộ ra trên máy chậm hoặc mạng chậm — đúng
 * lúc màn đích chưa kịp vẽ nên người dùng tưởng chưa ăn và chạm thêm.
 *
 * Hai lớp chặn, cần cả hai:
 *   1. `navigation.isFocused()` — sau cú chạm đầu, màn nguồn mất tiêu điểm nên mọi cú sau bị bỏ;
 *   2. khoá theo thời gian — hai cú chạm trong CÙNG một frame đều thấy `isFocused()` là `true`
 *      vì trạng thái điều hướng chưa kịp cập nhật.
 *
 * Dùng cho MỌI lối đi sang màn khác. `router.replace` không cần vì nó không xếp chồng.
 */
export function useNavigateOnce(): (href: Href) => void {
  const router = useRouter();
  const navigation = useNavigation();
  const lastAt = useRef(0);

  return useCallback(
    (href: Href) => {
      const now = Date.now();
      if (now - lastAt.current < LOCK_MS) return;
      if (!navigation.isFocused()) return;

      lastAt.current = now;
      router.push(href);
    },
    [navigation, router],
  );
}
