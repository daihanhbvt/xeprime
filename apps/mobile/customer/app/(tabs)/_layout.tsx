import { Ionicons } from '@expo/vector-icons';
import { Tabs, useSegments } from 'expo-router';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { AppTopBar } from '@/components/layout/AppTopBar';
import { TabBarHideContext, TabBarInsetContext } from '@/components/layout/tab-bar-inset';
import { CountBadge } from '@/components/ui/CountBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useDriverPendingCounts } from '@/features/driving/hooks';
import { FavoriteIntentResumer } from '@/features/favorites/components/FavoriteIntentResumer';
import { FONT_FAMILY } from '@/theme/fonts';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import { elevation } from '@/theme/elevation';
import { Avatar } from '@/components/ui/Avatar';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';

/** Viên vàng co/nở + đẩy mục bên cạnh. */
// Đẩy NHẸ và CHẬM (người dùng chốt 28/10/2026): trượt êm 380ms, không lò xo nảy.
const TAB_LAYOUT_TRANSITION = LinearTransition.duration(380).easing(Easing.inOut(Easing.cubic));

/** Cỡ icon thanh tab — Figma `21860:81398`: icon 28 trong ô 44. */
const TAB_ICON = 26;

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
 */
const TAB_LABEL_LINE_HEIGHT = 22;

/**
 * Trần hiện trên huy hiệu tab — cùng `overflowCount` mà `MobileTabBar` của web dùng.
 *
 * 9 chứ không 99: huy hiệu tab nằm trên một biểu tượng 20dp, và "127" ở đó rộng hơn cả icon.
 */
const TAB_BADGE_MAX = 9;

const styles = StyleSheet.create({
  // Viên NỔI (Figma `21860:81398`): khay bo tròn hết cỡ, đổ bóng, cách hai mép màn.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 30,
    borderWidth: 1,
    paddingVertical: space.xs,
    // Đệm hai bên rộng hơn dọc — các mục đã giãn đều, icon đầu/cuối không nên sát mép viên.
    paddingHorizontal: space.md,
  },
  // Figma: các mục giãn ĐỀU (space-between), viên đang chọn chỉ ôm icon + nhãn — nhãn không bị "…".
  item: { alignItems: 'center', justifyContent: 'center' },
  itemPressed: { transform: [{ scale: 0.92 }] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    height: 44,
    paddingHorizontal: space.sm,
    // Bo = nửa chiều cao, KHÔNG 999: Android vẽ góc vuông khi bán kính vượt quá nửa cạnh lúc LayoutAnimation chạy.
    borderRadius: 22,
    overflow: 'hidden',
  },
  icon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: -space.xs, left: '60%' },
  // Avatar tab = đúng ô icon 28 như các tab bên cạnh (viền 1 + ảnh 26).
  avatar: { width: 28, height: 28, borderWidth: 1.5, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
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
function AppTabBar({
  state,
  descriptors,
  navigation,
  onHeight,
  hide,
  height,
}: TabBarProps & { onHeight: (height: number) => void; hide: SharedValue<number>; height: number }) {
  const colors = useColors();
  // Trượt xuống đúng bằng chiều cao thanh (đã gồm đệm đáy) — ra hẳn khỏi màn.
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hide.value * height }],
  }));
  const focusedOptions = descriptors[state.routes[state.index]!.key]!.options;
  const barStyle = focusedOptions.tabBarStyle as StyleProp<ViewStyle>;
  if (StyleSheet.flatten(barStyle)?.display === 'none') return null;

  return (
    <Animated.View
      style={[barStyle, slideStyle]}
      onLayout={(event) => onHeight(event.nativeEvent.layout.height)}
    >
    <View
      style={[styles.bar, elevation.raised, { backgroundColor: colors.surface, borderColor: colors.borderSubtle }]}
      accessibilityRole="tablist"
    >
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
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };
        const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });

        return (
          <Animated.View key={route.key} layout={TAB_LAYOUT_TRANSITION}>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            onLongPress={onLongPress}
            // Nhấn: mục lún nhẹ (scale 0.92) — phản hồi chạm tức thì trước khi tab đổi.
            style={({ pressed }) => [
              styles.item,
              options.tabBarItemStyle as StyleProp<ViewStyle>,
              pressed ? styles.itemPressed : null,
            ]}
          >
            {/* Mục đang chọn: icon + nhãn trong viên vàng nhạt; mục khác chỉ icon (Figma). */}
            {/*
              Kiểu Facebook: viên vàng NỞ ra ở mục mới và ĐẨY các mục bên cạnh sang (layout transition
              lò xo của Reanimated — chạy trên UI thread, đúng cả kiến trúc mới), nhãn mờ dần vào.
            */}
            <Animated.View
              layout={TAB_LAYOUT_TRANSITION}
              style={[styles.pill, focused ? { backgroundColor: colors.primarySubtle } : null]}
            >
              {options.tabBarIcon?.({ focused, color, size: iconSize.lg })}
              {focused ? (
                <Animated.Text
                  entering={FadeIn.duration(320)}
                  exiting={FadeOut.duration(120)}
                  numberOfLines={1}
                  style={[options.tabBarLabelStyle as StyleProp<TextStyle>, { color, flexShrink: 1 }]}
                >
                  {label}
                </Animated.Text>
              ) : null}
            </Animated.View>
          </Pressable>
          </Animated.View>
        );
      })}
    </View>
    </Animated.View>
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
  name: LineIconName;
  color: string;
  badge?: number;
}) {
  return (
    <View style={styles.icon}>
      {/* Icon VẼ TỪ FIGMA (`LineIcon`, Figma `21860:81398`) — không dùng Ionicons cho thanh tab. */}
      <LineIcon name={name} color={color} size={TAB_ICON} />
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <CountBadge count={badge} tone="danger" size="sm" max={TAB_BADGE_MAX} />
        </View>
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const colors = useColors();
  const t = useTranslations('Navigation.public');
  const insets = useSafeAreaInsets();
  const { data: user } = useCurrentUser();
  const segments = useSegments();
  // Thanh logo · tin nhắn · chuông · avatar: Trang chủ VÀ Tìm xe (người dùng chốt 28/10/2026).
  const lastSegment = segments[segments.length - 1];
  // Màn Tìm xe KHÔNG có thanh này (người dùng chốt 29/10/2026) — thẻ tìm kiếm là đỉnh màn.
  const onHome = lastSegment === 'explore' || segments.length <= 1;
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const tabBarHide = useSharedValue(0);
  // Đổi tab ⇒ thanh hiện lại: chỉ Trang chủ được giấu nó khi cuộn.
  useEffect(() => {
    tabBarHide.value = withTiming(0, { duration: 200 });
  }, [lastSegment, tabBarHide]);

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
  /* Chuyến được gán chờ TÔI nhận (ADR 0063) — việc cần làm, nên gắn lên tab Chuyến. */
  const driverCounts = useDriverPendingCounts(Boolean(user));
  const pendingDriverTrips = driverCounts.data?.trips ?? 0;

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      {/* Thanh logo · tin nhắn · chuông · avatar CHỈ ở trang chủ (người dùng chốt 28/10/2026). */}
      {onHome ? <AppTopBar /> : null}
      {/*
        Hoàn tất lượt Xe yêu thích bị gián đoạn vì chưa đăng nhập (web gắn ở layout `(public)`).
        Ở ĐÂY chứ không ở layout gốc: nó có thể phải mở lại màn đăng nhập, nên cần ngữ cảnh
        navigator; và bộ tab luôn còn mount bên dưới mọi màn đẩy lên (chi tiết xe, đăng nhập).
      */}
      <FavoriteIntentResumer />
      <TabBarInsetContext.Provider value={user ? tabBarHeight : 0}>
      <TabBarHideContext.Provider value={tabBarHide}>
      <Tabs
        tabBar={(props) => (
          <AppTabBar {...props} onHeight={setTabBarHeight} hide={tabBarHide} height={tabBarHeight} />
        )}
        screenOptions={{
          headerShown: false,
          animation: 'none',
          // Tab ẩn đứng yên (react-freeze): đổi sáng/tối chỉ vẽ lại tab đang xem, tab kia vẽ lúc quay lại.
          freezeOnBlur: true,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: user
            ? {
                // NỔI đè lên nội dung (kiểu Facebook): khung ngoài trong suốt, nội dung cuộn xuống dưới
                // vẫn thấy qua hai bên viên. Màn cuộn chừa đuôi qua `TabBarInsetContext`.
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'transparent',
                paddingHorizontal: space.sm,
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
                paddingTop: 0,
                // Đệm đáy ĐỘNG theo máy: máy điều hướng cử chỉ có `insets.bottom` lớn, máy phím cứng /
                // một số Android trả 0 — lấy max với sàn 16 để thanh không bao giờ chạm mép dưới, rồi cộng
                // thêm 8 cho thanh nổi hẳn lên (người dùng chốt 28/10/2026).
                paddingBottom: Math.max(insets.bottom, space.md) + space.sm,
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
            fontSize: fontSize.body,
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
            tabBarIcon: ({ color }) => <TabIcon name="home" color={color} />,
          }}
        />
        {/* Tìm xe là TAB (Figma `21860:81398`) — nút "Tìm xe" ở trang chủ chuyển sang đây, không mở trang mới. */}
        <Tabs.Screen
          name="search"
          options={{
            title: t('searchCars'),
            tabBarIcon: ({ color }) => <TabIcon name="search" color={color} />,
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            ...authOnly,
            title: t('chat'),
            tabBarIcon: ({ color }) => (
              <TabIcon name="chat" color={color} badge={chatCustomer} />
            ),
          }}
        />
        <Tabs.Screen
          name="trips"
          options={{
            ...authOnly,
            title: t('tripsShort'),
            tabBarIcon: ({ color }) => (
              <TabIcon name="car" color={color} badge={pendingDriverTrips} />
            ),
          }}
        />
        <Tabs.Screen
          name="account"
          options={{
            ...authOnly,
            title: t('account'),
            // Tab tài khoản là AVATAR của chính người dùng (Figma), viền vàng khi đang chọn.
            tabBarIcon: ({ color }) =>
              user ? (
                <View style={[styles.avatar, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
                  <Avatar name={user.displayName} url={user.avatarUrl ?? null} size={23} />
                </View>
              ) : (
                <Ionicons name="person-outline" color={color} size={TAB_ICON} />
              ),
          }}
        />
      </Tabs>
      </TabBarHideContext.Provider>
      </TabBarInsetContext.Provider>
    </SafeAreaView>
  );
}
