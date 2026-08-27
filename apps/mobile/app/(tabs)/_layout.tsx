import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
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
export default function TabsLayout() {
  const t = useTranslations('Navigation.public');
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
              height: sizing.touchTarget + 26,
              paddingTop: space.xs,
              paddingBottom: space.xs,
            }
          : // Guest chỉ có một màn — một thanh tab đúng một mục là thanh trang trí chiếm chỗ.
            { display: 'none' },
        tabBarLabelStyle: {
          fontSize: fontSize.label,
          fontWeight: fontWeight.medium,
        },
        tabBarItemStyle: { paddingVertical: space.xs },
      }}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: t('explore'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          ...authOnly,
          title: t('chat'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubble-ellipses-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          ...authOnly,
          title: t('tripsShort'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          ...authOnly,
          title: t('account'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
