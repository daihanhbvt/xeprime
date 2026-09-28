import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { CountBadge } from '@/components/ui/CountBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { FONT_FAMILY } from '@/theme/fonts';
import { colors, fontSize, iconSize, space } from '@/theme/tokens';

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
 * Hộp dòng của nhãn tab — khai TƯỜNG MINH, không để hệ điều hành tự suy.
 *
 * 12px × 1.5 chứ không × 1.3: tiếng Việt xếp CHỒNG dấu ("ế" = e + mũ + sắc), và chiều cao mặc
 * định mà Android suy từ metric của font không chừa đủ chỗ cho tầng dấu trên cùng. Không khai
 * thì chữ bị cắt ngang ở mép dưới thanh, ngay chỗ thanh điều hướng bắt đầu — đúng cái "bị che"
 * nhìn thấy trên máy.
 *
 * Con số này đi CẶP với `TAB_BAR_HEIGHT`: đổi một cái phải tính lại cái kia.
 */
const TAB_LABEL_LINE_HEIGHT = 18;

/**
 * Chiều cao phần NHÌN THẤY của thanh, CHƯA gồm safe area.
 *
 * Vẫn trên sàn chạm 48dp: 4 (đệm trên) + 20 (icon) + 18 (hộp dòng nhãn) + khoảng hở
 * react-navigation tự chèn giữa icon và nhãn + 4 (đệm dưới).
 *
 * 60 chứ không 56: Be Vietnam Pro có hộp dòng cao hơn Roboto ở cùng cỡ chữ, nên ngân sách cũ —
 * vốn tính cho font hệ điều hành — hụt đúng phần dấu tiếng Việt sau khi app chuyển sang dùng
 * chung font với web.
 */
const TAB_BAR_HEIGHT = 60;

/**
 * Trần hiện trên huy hiệu tab — cùng `overflowCount` mà `MobileTabBar` của web dùng.
 *
 * 9 chứ không 99: huy hiệu tab nằm trên một biểu tượng 20dp, và "127" ở đó rộng hơn cả icon.
 */
const TAB_BADGE_MAX = 9;

const styles = StyleSheet.create({
  bar: { flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -space.xs, left: '60%' },
});

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Thanh tab TỰ VẼ — thay thanh mặc định của react-navigation (25/09/2026).
 *
 * Thanh mặc định vẽ MỖI biểu tượng HAI lần (bản "đang chọn" và "không chọn") trong hai lớp bọc
 * bật/tắt bằng `opacity`. Trên kiến trúc mới (Fabric), lớp `opacity: 1` bị làm phẳng (flatten)
 * còn lớp `opacity: 0` thì không, nên mỗi lần đổi tab Fabric phải nhấc biểu tượng ra khỏi cha này
 * nhét vào cha kia. Chủ gian hàng đổi sang "Tìm & thuê xe" rồi chạm tab "Chuyến" là đủ để lượt
 * nhấc/nhét đó trật nhịp: `addViewAt … The specified child already has a parent` (tái hiện trên
 * emulator; logcat trỏ vào mục "Tin nhắn" của thanh này, trạng thái điều hướng khi đó sạch — một
 * `(tabs)` duy nhất).
 *
 * Ở đây mỗi mục có MỘT biểu tượng, đổi MÀU theo trạng thái chọn — không có lớp bọc nào đổi cấu
 * trúc nữa. Cấu hình vẫn đọc từ `screenOptions`/`options` như cũ (màu, cỡ chữ, chiều cao, mục ẩn
 * bằng `href: null` ⇒ `tabBarItemStyle.display = 'none'`), nên thanh này không giữ luật riêng nào.
 */
function AppTabBar({ state, descriptors, navigation }: TabBarProps) {
  const focusedOptions = descriptors[state.routes[state.index]!.key]!.options;
  const barStyle = focusedOptions.tabBarStyle as StyleProp<ViewStyle>;
  if (StyleSheet.flatten(barStyle)?.display === 'none') return null;

  return (
    <View style={[styles.bar, barStyle]} accessibilityRole="tablist">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key]!;
        if (
          StyleSheet.flatten(options.tabBarItemStyle as StyleProp<ViewStyle>)?.display === 'none'
        ) {
          return null;
        }
        const focused = state.index === index;
        const color =
          (focused ? options.tabBarActiveTintColor : options.tabBarInactiveTintColor) ??
          colors.textMuted;
        const label = options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[styles.item, options.tabBarItemStyle as StyleProp<ViewStyle>]}
          >
            {options.tabBarIcon?.({ focused, color, size: iconSize.lg })}
            <Text
              numberOfLines={1}
              style={[options.tabBarLabelStyle as StyleProp<TextStyle>, { color }]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Biểu tượng tab, kèm huy hiệu đếm (nếu có) VẼ TĨNH ngay trong biểu tượng.
 *
 * Huy hiệu nằm trong biểu tượng vì `AppTabBar` không vẽ `tabBarBadge` của react-navigation (một
 * `Animated.Text` hiện/ẩn bằng hoạt ảnh native). Trần hiện số là `TAB_BADGE_MAX`, như web.
 */
function TabIcon({
  name,
  color,
  badge,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  badge?: number;
}) {
  return (
    <View style={styles.icon}>
      <Ionicons name={name} color={color} size={iconSize.lg} />
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <CountBadge count={badge} tone="danger" size="sm" max={TAB_BADGE_MAX} />
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const t = useTranslations('Navigation.public');
  const insets = useSafeAreaInsets();
  const { data: user } = useCurrentUser();

  /** Màn của khách chưa đăng nhập: ẩn khỏi thanh tab cho tới khi có phiên. */
  const authOnly = user ? {} : { href: null };

  /*
   * Huy hiệu tab đếm hộp thư KHÁCH, không phải tổng hai vai — tab này mở đúng hộp thư đó.
   * Tổng cả hai vai nằm ở biểu tượng tin nhắn trên thanh trên (`HeaderActions`), nơi đích đến
   * đi theo con số. Web chia đúng hai vai trò này cho `MobileTabBar` và `MarketHeader`.
   *
   * Con số lấy từ `useBadges().chatCustomer` — cùng MỘT query `/me/badges` với chuông và huy
   * hiệu menu, không còn một lời gọi `/conversations/unread-count?side=customer` riêng.
   */
  const { chatCustomer } = useBadges();

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <AppTopBar />
      <Tabs
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          animation: 'none',
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
            /*
             * `fontFamily` PHẢI khai: nhãn tab do react-navigation vẽ bằng `Text` của RN, nằm
             * NGOÀI cây Tamagui nên không nhận `defaultProps` font của `tamagui.config`.
             *
             * Và phải chọn ĐÚNG FILE cho nét đậm: Android bỏ qua `fontWeight` khi đã có
             * `fontFamily` tuỳ biến — để `fontWeight: '500'` một mình thì nhãn vừa sai font vừa
             * không đậm lên.
             */
            fontFamily: FONT_FAMILY.medium,
            fontSize: fontSize.label,
            lineHeight: TAB_LABEL_LINE_HEIGHT,
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
            tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            ...authOnly,
            title: t('chat'),
            tabBarIcon: ({ color }) => (
              <TabIcon name="chatbubble-ellipses-outline" color={color} badge={chatCustomer} />
            ),
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            ...authOnly,
            title: t('tripsShort'),
            tabBarIcon: ({ color }) => <TabIcon name="calendar-outline" color={color} />,
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            ...authOnly,
            title: t('account'),
            tabBarIcon: ({ color }) => <TabIcon name="person-outline" color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
