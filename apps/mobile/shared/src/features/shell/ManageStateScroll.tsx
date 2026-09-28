import type { ReactNode } from 'react';
import { RefreshControl } from 'react-native';
import Animated from 'react-native-reanimated';
import type { CollapseOnScroll } from '@/hooks/use-collapse-on-scroll';
import { colors } from '@/theme/tokens';
import { scrollThrottle } from '@/theme/motion';

/**
 * Vùng cuộn cho các trạng thái KHÔNG PHẢI danh sách của màn quản lý: khung xương, lỗi, rỗng.
 *
 * Chúng phải cuộn được vì kéo-xuống-làm-mới chỉ tồn tại nếu có vùng cuộn để kéo — để chúng là
 * `YStack` tĩnh thì đúng lúc cần làm mới nhất (rỗng, hoặc vừa mất sóng) lại là lúc không kéo
 * được gì.
 *
 * `contentContainerStyle.flexGrow: 1` để nội dung ngắn vẫn phủ hết chiều cao và tự căn giữa.
 * Nhận luôn `onScroll` của khối đầu trang: khung xương đủ dài để cuộn, và nó phải ẩn/hiện bộ lọc
 * y như danh sách thật.
 */
export function ManageStateScroll({
  onScroll,
  headerHeight,
  refreshing,
  onRefresh,
  children,
}: {
  onScroll: CollapseOnScroll['onScroll'];
  headerHeight: number;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  return (
    <Animated.ScrollView
      onScroll={onScroll}
      scrollEventThrottle={scrollThrottle.frame}
      contentContainerStyle={{ flexGrow: 1, paddingTop: headerHeight }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primaryActive}
          progressViewOffset={headerHeight}
        />
      }
    >
      {children}
    </Animated.ScrollView>
  );
}
