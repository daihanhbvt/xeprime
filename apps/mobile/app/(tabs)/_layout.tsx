import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { duration } from '@/theme/motion';

/**
 * Thanh tab dưới đáy — chỉ tồn tại khi ĐÃ đăng nhập.
 *
 * Khách chưa đăng nhập thấy đúng một màn: trang chủ Marketplace. Không có thanh tab, vì ba mục
 * còn lại (tin nhắn, chuyến, hồ sơ) đều là dữ liệu của một tài khoản — bày ra rồi chặn lại ở
 * cú chạm là hứa một thứ chưa có. Lối vào đăng nhập nằm ở nút "Đăng nhập" trên header trang chủ.
 *
 * `href: null` gỡ hẳn một màn khỏi thanh tab nhưng GIỮ nó trong navigator, nên sau khi đăng
 * nhập không phải dựng lại cây điều hướng — thanh tab chỉ hiện ra.
 */
/*
 * Cố ý KHÔNG dùng `size` mà navigator truyền vào: giá trị đó đổi theo nền tảng và theo bản
 * react-navigation, nên thanh tab cao thấp khác nhau giữa hai máy mà không dòng code nào giải
 * thích được.
 */

/**
 * Chiều cao phần NHÌN THẤY của thanh, CHƯA gồm safe area.
 *
 * Vẫn trên sàn chạm 48dp: 4 (đệm trên) + 20 (icon) + 16 (nhãn 12px × 1.3) + đệm dưới.
 */
const TAB_BAR_HEIGHT = 56;

export default function TabsLayout() {
  const t = useTranslations('Navigation.public');
  const insets = useSafeAreaInsets();
  const { data: user } = useCurrentUser();

  /** Màn của khách chưa đăng nhập: ẩn khỏi thanh tab cho tới khi có phiên. */
  const authOnly = user ? {} : { href: null };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Tab là những nơi NGANG HÀNG — trượt ngang sẽ hứa một dải vuốt qua lại không có thật.
        animation: 'fade',
        transitionSpec: {
          animation: 'timing',
          config: { duration: duration.fast },
        },
        tabBarActiveTintColor: colors.primaryActive,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: user
          ? {
              backgroundColor: colors.surface,
              borderTopColor: colors.borderSubtle,
              borderTopWidth: 1,
              /*
               * Chiều cao PHẢI cộng `insets.bottom`, và đệm dưới cũng vậy.
               *
               * Expo SDK 54 bật edge-to-edge mặc định trên Android (targetSdk 36): app vẽ xuống
               * tận đáy màn, dưới cả thanh điều hướng cử chỉ. Một `height` cứng nghĩa là hàng
               * icon nằm ĐÚNG chỗ thanh điều hướng đang chiếm — nhãn bị cắt và cú chạm rơi vào
               * hệ thống thay vì vào tab.
               *
               * Trên máy có phím cứng hoặc iPhone không tai thỏ, `insets.bottom` là 0 và công
               * thức tự thu về đúng chiều cao gốc — không cần rẽ nhánh theo nền tảng.
               */
              height: TAB_BAR_HEIGHT + insets.bottom,
              paddingTop: space.xs,
              paddingBottom: insets.bottom + space.xs,
            }
          : // Guest chỉ có một màn — một thanh tab đúng một mục là thanh trang trí chiếm chỗ.
            { display: 'none' },
        tabBarLabelStyle: {
          fontSize: fontSize.label,
          fontWeight: fontWeight.medium,
        },
        /*
         * KHÔNG đệm dọc ở đây nữa. Nó cộng dồn với `paddingTop`/`paddingBottom` của thanh, đẩy
         * tổng chiều cao vượt quá `height` đã khai — react-navigation khi đó cắt bớt, và thứ bị
         * cắt luôn là nhãn ở dưới cùng. Đó chính là cái "vỡ" nhìn thấy trên máy.
         */
        tabBarItemStyle: { paddingVertical: 0 },
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: t('explore'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="compass-outline" color={color} size={iconSize.lg} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          ...authOnly,
          title: t('chat'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={iconSize.lg} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          ...authOnly,
          title: t('tripsShort'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="calendar-outline" color={color} size={iconSize.lg} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          ...authOnly,
          title: t('account'),
          tabBarIcon: ({ color }) => (
            <Ionicons name="person-outline" color={color} size={iconSize.lg} />
          ),
        }}
      />
    </Tabs>
  );
}
