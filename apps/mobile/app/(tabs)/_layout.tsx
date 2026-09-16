import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { AppTopBar } from '@/components/layout/AppTopBar';
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
  const chatBadge = chatCustomer
    ? { tabBarBadge: chatCustomer > TAB_BADGE_MAX ? `${TAB_BADGE_MAX}+` : chatCustomer }
    : {};

  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: colors.background, flex: 1 }}>
      <AppTopBar />
      <Tabs
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
            tabBarIcon: ({ color }) => (
              <Ionicons name="home-outline" color={color} size={iconSize.lg} />
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            ...authOnly,
            ...chatBadge,
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
    </SafeAreaView>
  );
}
