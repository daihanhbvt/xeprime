import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Text as NativeText, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useParallaxHeader } from '@/components/motion/use-parallax-header';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SUPPORT_HOTLINE } from '@xeprime/types';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { images, logoWidth } from '@/assets';
import { webAssetUrl } from '@/lib/web-base-url';
import type { PublicBanner } from '../../api';
import { layout } from '@/theme/layout';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontSize, fontWeight, gradients, market, space } from '@/theme/tokens';

const BENEFITS = ['income', 'support', 'customers'] as const;
/** Lề tràn của ảnh nền = trần trôi parallax (dp). */
const BACKDROP_OVERSCAN = 160;
/** Trôi chậm hơn banner đầu trang — khối giữa trang, ảnh nền cố định trong khung. */
const BACKDROP_PARALLAX = 0.4;
/** Logo rộng 164 (Figma MB `22059:15628`). */
const LOGO_WIDTH = 164;
const logoRatio = logoWidth(1000) / 1000;
/*
 * Khối này luôn là TRANH TỐI ở cả hai chế độ (như web), nên màu đọc thẳng token theme-độc-lập
 * (`XP_TOKENS` / `market`), không qua `useColors()`.
 */
/** Ô kính vàng 24px của dấu tích (`.check`: nền `glass-gold`, bo 12, không viền — Figma `21965:5348`), tích `primary`. */
const CHECK = 24;
const GLASS_GOLD = XP_TOKENS['color-glass-gold'];
const CHECK_COLOR = XP_TOKENS['color-primary'];
/** Điểm đầu của `gradient-text-gold` (= `primary-accent`) — RN không tô gradient lên chữ xuống dòng. */
const TITLE_ACCENT = market.accent;
/** `primary-contrast` của nút gradient + mũi tên `partner-arrow.svg`. */
const CTA_TEXT = XP_TOKENS['color-primary-contrast'];

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  /** Ảnh nền tràn lề trên/dưới `BACKDROP_OVERSCAN` để trôi parallax không hở mép. */
  backdropParallax: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -BACKDROP_OVERSCAN,
    bottom: -BACKDROP_OVERSCAN,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingRight: 8,
    paddingLeft: 20,
    gap: 12,
    borderRadius: 999,
  },
});

/**
 * "Đăng ký trở thành ĐỐI TÁC ĐỘC QUYỀN" — dải mời chủ xe của trang chủ v2 (Figma `19771:51743`,
 * ADR 0062), thay thẻ mời đăng xe ở chân màn — cùng thay đổi bên web (`PartnerBanner` thay
 * `OwnerCta`/khối `cta` của chân trang).
 *
 * Nút dẫn tới trang "Cho thuê xe trên XePrime" của app khách — bản native của
 * `resolveOwnerCtaHref()`: đăng ký thật diễn ra ở app/site partner bằng một tài khoản riêng
 * (ADR 0051 điều 3 · ADR 0053). Hiện cho MỌI người như web: realm khách không có khu làm việc.
 */
/** `onRegister` vắng ⇒ không có nút "Đăng ký ngay" (app khách bỏ nút này — người dùng chốt 29/10/2026). */
export function PartnerBanner({
  onRegister,
  banner,
  parallax,
}: {
  /**
   * Hiệu ứng banner Home theo VỊ TRÍ khối: `offset` (+ `baseOffset`) = đỉnh khối trong nội dung
   * cuộn, đo `onLayout` ở màn chứa. Vắng ⇒ ảnh đứng yên.
   */
  parallax?: {
    scrollY: SharedValue<number>;
    offset: SharedValue<number>;
    baseOffset?: SharedValue<number>;
  };
  onRegister?: () => void;
  /** Ảnh nền do admin cấu hình (vị trí `partner`) — vắng thì dùng ảnh mặc định của bản vẽ MB. */
  banner?: PublicBanner | null;
} = {}) {
  const t = useTranslations('Home.partner');
  const { height: windowHeight } = useWindowDimensions();
  const fallbackScroll = useSharedValue(0);
  const fallbackOffset = useSharedValue(0);
  const backdropStyle = useParallaxHeader(parallax?.scrollY ?? fallbackScroll, {
    offset: parallax?.offset ?? fallbackOffset,
    baseOffset: parallax?.baseOffset,
    factor: BACKDROP_PARALLAX,
    enterDistance: windowHeight,
    maxShift: BACKDROP_OVERSCAN,
    // PHÓNG lên chứ không co: ảnh co còn 0.92 lộ dải nền ở hai mép (khối tràn hết bề ngang,
    // không có lề che). Phóng 1 → 1.06 giữ cảm giác chuyển động mà ảnh luôn phủ kín khung.
    minScale: 1.1,
  });

  /*
   * Web ≤1024px: dải TRÀN hết bề ngang (không bo góc), đệm 40/16, các khối cách 24, thứ tự
   * logo → tiêu đề → nút → quyền lợi → trợ giúp (Figma MB) (`PartnerBanner.module.css`).
   */
  return (
    <YStack
      mx={-layout.screenX}
      ov="hidden"
      bg={market.inverse}
      // Figma MB: đệm hai bên 24 (lề màn 16 + 8).
      px={layout.screenX + space.sm}
      py={toPx(XP_TOKENS['space-partner-mb-y'])}
      gap={space.md}
      ai="flex-start"
    >
      {/* Ảnh nền trôi chậm + co/mờ khi cuộn qua (UI thread, `useParallaxHeader`); lớp phủ tối ở trên giữ chữ đọc được. */}
      <Animated.View style={[styles.backdropParallax, parallax ? backdropStyle : null]} pointerEvents="none">
        <Image
          source={
            banner
              ? { uri: webAssetUrl(banner.mobileImageUrl ?? banner.tabletImageUrl ?? banner.imageUrl) }
              : images.homePartnerBackdrop
          }
          style={styles.backdrop}
          contentFit="cover"
          accessibilityElementsHidden
        />
      </Animated.View>
      {/* `gradient-partner-shade` (Figma `21965:5338`): đen 90% ở mép trái nhạt dần tới 8% mép phải. */}
      <LinearGradient
        colors={['rgba(0, 0, 0, 0.9)', 'rgba(64, 64, 64, 0)']}
        locations={[0, 0.92006]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.backdrop}
      />

      <Image
        source={images.logo}
        style={{ width: LOGO_WIDTH, height: LOGO_WIDTH / logoRatio }}
        contentFit="contain"
        accessibilityElementsHidden
      />

      {/* Tiêu đề h1: phần dẫn màu chữ-trên-nền-tối, phần nhấn vàng in hoa đậm (`gradient-text-gold`). */}
      <YStack gap={space.xs} accessibilityRole="header">
        <Text
          col={market.onDark}
          fos={toPx(XP_TOKENS['font-size-partner-mb-lead'])}
          lh={toPx(XP_TOKENS['line-height-partner-mb-lead'])}
          fow={fontWeight.semibold}
        >
          {t('titleLead')}
        </Text>
        <Text
          col={TITLE_ACCENT}
          fos={toPx(XP_TOKENS['font-size-partner-mb-accent'])}
          lh={toPx(XP_TOKENS['line-height-partner-mb-accent'])}
          fow={fontWeight.bold}
        >
          {t('titleAccent').toLocaleUpperCase()}
        </Text>
      </YStack>

      <YStack gap={space.md} accessibilityLabel={t('benefitsLabel')}>
        {BENEFITS.map((key) => (
          <XStack key={key} ai="center" gap={space.sm}>
            <YStack
              w={CHECK}
              h={CHECK}
              br={CHECK / 2}
              bg={GLASS_GOLD}
              ai="center"
              jc="center"
            >
              <Ionicons name="checkmark" size={14} color={CHECK_COLOR} />
            </YStack>
            <Text col={market.onDark} fos={fontSize.body} lh={22} fow={fontWeight.medium}>
              {t(`benefits.${key}`)}
            </Text>
          </XStack>
        ))}
      </YStack>

      {/* `CtaButton size="xl" shape="pill"`: cao 56, đệm 8/8/8/20, chữ h3, vòng trắng 40 ôm mũi tên. */}
      {onRegister ? (
      <Pressable onPress={onRegister} accessibilityRole="button" accessibilityLabel={t('cta')}>
        <LinearGradient
          colors={gradients.primary.colors}
          locations={gradients.primary.locations}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.cta}
        >
          <Text col={CTA_TEXT} fos={fontSize.h3} fow={fontWeight.semibold}>
            {t('cta')}
          </Text>
          <YStack w={40} h={40} br={20} bg={market.onDark} ai="center" jc="center">
            <Ionicons name="chevron-forward" size={18} color={CTA_TEXT} />
          </YStack>
        </LinearGradient>
      </Pressable>
      ) : null}

      <NativeText
        style={{ color: market.onDark, fontSize: fontSize.bodySm, lineHeight: 18, fontFamily: FONT_FAMILY.body }}
      >
        {t.rich('help', {
          phone: SUPPORT_HOTLINE.display,
          // Số tổng đài là dữ liệu — thẻ `tel` bọc nó thành liên kết gọi được, như web.
          tel: (chunks) => (
            <NativeText
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`tel:${SUPPORT_HOTLINE.tel}`)}
              style={{ color: market.onDark, fontFamily: FONT_FAMILY.semibold }}
            >
              {chunks}
            </NativeText>
          ),
        })}
      </NativeText>
    </YStack>
  );
}
