import { memo, useCallback, type ReactNode } from 'react';
import { Image, type ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import {
  PARTNER_TRACK_PERSONAL_RATIO,
  PARTNER_TRACK_RIBBON_RATIO,
  PARTNER_TRACK_SHOP_RATIO,
  images,
} from '@/assets';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { BackArrow } from '@/components/ui/BackArrow';
import { Button, MAIN_GRADIENT } from '@/components/ui/Button';
import { FitOneLineText } from '@/components/ui/FitOneLineText';
import { usePartnerOffer } from '@/features/list-vehicle/use-partner-offer';
import { layout } from '@/theme/layout';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontWeight, market, radius, space, typeScale } from '@/theme/tokens';

/**
 * Số xe tối đa của chủ xe tuyến hoa hồng (Owner Lite — ADR 0041 điều 4) - cùng hằng số với
 * `ListYourVehicleScreen` / web `ListYourVehicleLanding`.
 */
const BASIC_OWNER_VEHICLE_CAP = 3;

/** Figma `10px/Medium` - nhãn đối tượng của thẻ. */
const BADGE_TEXT = { fontSize: 10, lineHeight: 14 } as const;
/** Figma `14px/Semibold` dòng 22 - tiêu đề ô phí. */
const OFFER_TITLE_LINE_HEIGHT = 22;
/** Khung minh hoạ thẻ cá nhân (Figma 113 × 92). */
const PERSONAL_ART_WIDTH = 113;
/** Khung ruy băng "Đề xuất" (Figma 117 × 38): lòi khỏi mép phải 12, mép trên 14. */
const RIBBON = { width: 117, offsetRight: -12, offsetTop: -14, textLeft: 20, textTop: 14, textWidth: 87 };
/** Độ mờ ảnh nền thẻ gian hàng (Figma 30%); giao diện tối hạ xuống để nền kem không làm bẩn thẻ. */
const SHOP_BG_OPACITY = { light: 0.3, dark: 0.08 } as const;

/**
 * MÀN CHỌN TUYẾN của app Partner — Figma Partner-XePrime "Signup - Plan" (`24464:25566`): mũi tên
 * lui (chỉ khi chưa đăng nhập), tiêu đề "Chọn mô hình hợp tác cùng XePrime" 20/30 MỘT dòng, lời dẫn
 * 14/20, rồi HAI THẺ tuyến xếp dọc, mỗi thẻ một nút "đi tiếp" của chính nó (như web
 * `ListYourVehicleLanding`): thẻ cá nhân nút viền vàng, thẻ gian hàng nút gradient + ruy băng "Đề xuất".
 *
 * Bấm nút của thẻ nào là chọn tuyến đó (`onChoose`). Màn CHỈ có những gì bản vẽ có (người dùng chốt
 * 20/11/2026): đã bỏ "Bắt đầu trong 3 bước", "Linh hoạt chuyển đổi khi cần", liên kết quy định chợ
 * xe và dòng mời đăng nhập / Đăng xuất.
 */
export function PartnerTrackChooser({
  onChoose,
  onBack,
}: {
  onChoose: (track: RegistrationTrack) => void;
  /** Mũi tên lui đầu màn (Figma "Back navigation") - vắng = không có mũi tên (người đã đăng nhập). */
  onBack?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('ListYourVehicle.landing');
  /*
   * Câu chữ RIÊNG của app Partner (Figma "Signup - Plan"): không nhắc "gói", chữ thẻ gian hàng theo
   * bản vẽ (người dùng chốt 20/11/2026). Web `/list-your-vehicle` giữ các khoá chung.
   */
  const tApp = useTranslations('ListYourVehicle.landing.partnerApp');
  // Khoảng % hoa hồng đọc từ chính sách phí hiện hành; chưa có thì giữ câu chung, không đoán số.
  const offer = usePartnerOffer().data;
  const commissionRange =
    offer?.minOwnerCommissionPercent != null && offer.maxOwnerCommissionPercent != null
      ? { min: offer.minOwnerCommissionPercent, max: offer.maxOwnerCommissionPercent }
      : null;

  /*
   * Đoạn nhấn lồng trong câu: `Text` lồng của Tamagui KHÔNG giữ độ đậm của `Text` cha - khai lại
   * `fow` ở chính đoạn đó, nếu không "XePrime" / "0%" rơi về chữ thường.
   */
  const brand = useCallback(
    (chunks: ReactNode) => (
      <Text col={colors.brandLink} fow={fontWeight.bold}>
        {chunks}
      </Text>
    ),
    [colors.brandLink],
  );
  const offerGreen = useCallback(
    (chunks: ReactNode) => (
      <Text col={colors.success} fow={fontWeight.semibold}>
        {chunks}
      </Text>
    ),
    [colors.success],
  );
  /** "0% phí hoa hồng" trong mô tả thẻ gian hàng: xanh `status/success-high`, đậm vừa (Figma `24464:26350`). */
  const offerStrongGreen = useCallback(
    (chunks: ReactNode) => (
      <Text col={colors.success} fow={fontWeight.semibold}>
        {chunks}
      </Text>
    ),
    [colors.success],
  );
  const choosePersonal = useCallback(() => onChoose(REGISTRATION_TRACK.COMMISSION), [onChoose]);
  const chooseShop = useCallback(() => onChoose(REGISTRATION_TRACK.PACKAGE), [onChoose]);

  return (
    <Screen padded={false}>
      <YStack gap={space.xl} px={layout.padXLg} py={space.lg}>
        {onBack ? <BackArrow onPress={onBack} /> : null}
        <YStack gap={2}>
          {/*
            Figma `whitespace-nowrap`: MỘT dòng. Cỡ chữ tính vừa KHÍT bề ngang cột (`FitOneLineText`),
            không co theo nấc như `adjustsFontSizeToFit` - hai lề đều nhau.
          */}
          <FitOneLineText
            col={colors.text}
            fontSize={TITLE.fontSize}
            lineHeight={TITLE.lineHeight}
            fow={fontWeight.bold}
            accessibilityRole="header"
          >
            {t.rich('heroTitle', { brand })}
          </FitOneLineText>
          <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
            {tApp.rich('subtitle', { br: () => '\n' })}
          </Text>
        </YStack>

        <YStack gap={space.lg}>
          <TrackCard
            variant="personal"
            badge={t('personal.badge')}
            title={t('personal.title')}
            tagline={t('personal.tagline')}
            body={t('personal.body', { maxVehicles: BASIC_OWNER_VEHICLE_CAP })}
            features={[
              { key: 'noFee', icon: 'discount', label: tApp('personalFeatures.noFee') },
              {
                key: 'vehicleCap',
                icon: 'car-side',
                label: tApp('personalFeatures.vehicleCap', { maxVehicles: BASIC_OWNER_VEHICLE_CAP }),
              },
              { key: 'simple', icon: 'setting-sm', label: tApp('personalFeatures.simple') },
            ]}
            art={images.partnerTrackPersonal}
            offerTitle={t('personal.offerTitle')}
            // Khuôn câu Figma, khoảng % THẬT đọc từ chính sách phí (ADR 0101; người dùng chốt 20/11/2026).
            offerBody={
              commissionRange
                ? tApp('personalOfferBodyRange', commissionRange)
                : tApp('personalOfferBody')
            }
            // Nhãn CHUNG của Figma cho cả hai thẻ (người dùng chốt 19/11/2026); bấm vẫn chọn đúng tuyến của thẻ.
            cta={t('chooseCta')}
            onChoose={choosePersonal}
          />
          <TrackCard
            variant="shop"
            // Nhãn NGẮN của Figma ("Đề xuất"): dải đỏ chỉ còn chừng 70pt trước biểu tượng 👍.
            ribbon={t('shop.recommendedShort')}
            badge={t('shop.badge')}
            title={tApp('shopTitle')}
            tagline={tApp('shopTagline')}
            body={tApp.rich('shopBody', { offer: offerStrongGreen })}
            features={[
              { key: 'fleet', icon: 'buildings-sm', label: t('shop.features.fleet') },
              { key: 'operations', icon: 'car-side', label: t('shop.features.operations') },
              { key: 'reports', icon: 'setting-sm', label: t('shop.features.reports') },
            ]}
            art={images.partnerTrackShop}
            offerTitle={t.rich('shop.offerHighlight', { big: offerGreen })}
            offerBody={tApp('shopOfferBody')}
            cta={t('chooseCta')}
            onChoose={chooseShop}
          />
        </YStack>

      </YStack>
    </Screen>
  );
}

/**
 * Tiêu đề màn: Figma `20px/Bold` 20/30, app nâng lên 22/32 (người dùng chốt 20/11/2026) - vẫn MỘT dòng,
 * máy hẹp nhỏ lại vừa đúng bề ngang (`FitOneLineText`).
 */
const TITLE = { fontSize: 22, lineHeight: 32 } as const;

interface TrackFeature {
  key: string;
  /** Icon nét Figma 16 của ô điểm nhấn (`LineIcon`). */
  icon: LineIconName;
  label: string;
}

/**
 * Một tuyến = một thẻ (Figma "Personal Vehicle Registration" `24464:26302` · `24464:26341`): bo 16,
 * đệm 16, khe 12, viền `stroke/primary-100`. `personal` nền trắng + nút viền vàng; `shop` thêm ảnh
 * nền mờ, nhãn gradient chữ trắng, nút gradient và ruy băng "Đề xuất".
 */
const TrackCard = memo(function TrackCard({
  variant,
  ribbon,
  badge,
  title,
  tagline,
  body,
  features,
  art,
  offerTitle,
  offerBody,
  cta,
  onChoose,
}: {
  variant: 'personal' | 'shop';
  ribbon?: string;
  badge: string;
  title: string;
  tagline: string;
  body: ReactNode;
  features: TrackFeature[];
  art: ImageProps['source'];
  offerTitle: ReactNode;
  offerBody: ReactNode;
  cta: string;
  onChoose: () => void;
}) {
  const colors = useColors();
  const { scheme } = useAppScheme();
  const shop = variant === 'shop';

  return (
    <YStack
      gap={space.md}
      p={space.lg}
      br={radius.card}
      bw={1}
      bc={colors.primaryMuted}
      bg={colors.surface}
      ai="center"
    >
      {shop ? (
        <View style={[styles.cardBg, { opacity: SHOP_BG_OPACITY[scheme] }]} pointerEvents="none">
          <Image
            source={images.partnerTrackShopBg}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessible={false}
          />
        </View>
      ) : null}

      <XStack gap={space.sm} ai="flex-start" alignSelf="stretch">
        <YStack f={1} minWidth={0} gap={space.sm} ai="flex-start">
          {shop ? (
            <View style={styles.shopBadge}>
              <LinearGradient
                colors={MAIN_GRADIENT.colors}
                locations={MAIN_GRADIENT.locations}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
              <Text col={market.onDark} fos={BADGE_TEXT.fontSize} lh={BADGE_TEXT.lineHeight} fow={fontWeight.medium}>
                {badge}
              </Text>
            </View>
          ) : (
            <XStack px={6} py={2} br={radius.pill} bg={colors.primarySubtle}>
              <Text
                col={colors.primaryHover}
                fos={BADGE_TEXT.fontSize}
                lh={BADGE_TEXT.lineHeight}
                fow={fontWeight.medium}
              >
                {badge}
              </Text>
            </XStack>
          )}
          <YStack gap={2} alignSelf="stretch">
            <Text
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
              accessibilityRole="header"
            >
              {title}
            </Text>
            <Text
              col={colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={fontWeight.medium}
            >
              {tagline}
            </Text>
          </YStack>
        </YStack>
        {/* Minh hoạ TRANG TRÍ: mọi thứ nó nói đã có trong chữ. */}
        <Image
          source={art}
          style={
            shop
              ? [styles.shopArt, { aspectRatio: PARTNER_TRACK_SHOP_RATIO }]
              : [styles.personalArt, { aspectRatio: PARTNER_TRACK_PERSONAL_RATIO }]
          }
          contentFit="contain"
          cachePolicy="memory-disk"
          accessible={false}
        />
      </XStack>

      <Text
        alignSelf="stretch"
        col={colors.textMuted}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
      >
        {body}
      </Text>

      {/*
        Nhãn GIỮ cỡ 12 (người dùng chốt 20/11/2026: không co chữ) - nhường chỗ cho chữ thay vì thu chữ:
        hàng lấn ra 4 mỗi bên vào đệm thẻ, khe ô 6 (Figma 8), ô không đệm ngang (Figma 8).
      */}
      <XStack gap={FEATURE_GAP} alignSelf="stretch" mx={-space.xs}>
        {features.map((feature) => (
          <YStack
            key={feature.key}
            f={1}
            minWidth={0}
            ai="center"
            // Biểu tượng thẳng hàng ở ĐẦU ô (Figma) - căn giữa dọc thì ô có nhãn 3 dòng đẩy biểu tượng lệch.
            jc="flex-start"
            gap={space.sm}
            py={space.sm}
            br={radius.control}
            bg={colors.brandWash}
          >
            <XStack p={space.sm} br={radius.pill} bg={colors.brandIconBg}>
              <LineIcon name={feature.icon} size={FEATURE_ICON} color={colors.primary} />
            </XStack>
            <Text
              col={colors.text}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              fow={fontWeight.medium}
              ta="center"
            >
              {feature.label}
            </Text>
          </YStack>
        ))}
      </XStack>

      <YStack
        alignSelf="stretch"
        ai="center"
        gap={space.xs}
        px={space.lg}
        py={space.md}
        br={radius.control}
        bg={colors.background}
      >
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={OFFER_TITLE_LINE_HEIGHT}
          fow={fontWeight.semibold}
          ta="center"
        >
          {offerTitle}
        </Text>
        <Text
          col={colors.textMuted}
          fos={typeScale.label.fontSize}
          lh={typeScale.label.lineHeight}
          ta="center"
        >
          {offerBody}
        </Text>
      </YStack>

      <Button
        label={cta}
        variant={shop ? 'gradient' : 'brandOutline'}
        icon="arrow-forward"
        iconEnd
        block={false}
        align="center"
        onPress={onChoose}
      />

      {ribbon ? (
        <View style={styles.ribbon} pointerEvents="none">
          <Image
            source={images.partnerTrackRibbon}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            accessible={false}
          />
          <Text
            pos="absolute"
            left={RIBBON.textLeft}
            top={RIBBON.textTop}
            w={RIBBON.textWidth}
            ta="center"
            col={market.onDark}
            // Cỡ nhãn 12 cố định: "Gói đề xuất" vừa dải đỏ. `adjustsFontSizeToFit` không co trên
            // Android khi Text không có chiều cao cố định - chữ tràn ra ngoài ruy băng.
            fos={typeScale.label.fontSize}
            lh={typeScale.title.lineHeight}
            fow={fontWeight.bold}
            numberOfLines={1}
          >
            {ribbon}
          </Text>
        </View>
      ) : null}
    </YStack>
  );
});

/** Biểu tượng 16 trong ô tròn đệm 8 của ô điểm nhấn. */
const FEATURE_ICON = 16;
/** Khe giữa ba ô điểm nhấn (Figma 8) - hẹp lại để nhãn dài cỡ 12 đủ hai dòng. */
const FEATURE_GAP = 6;

const styles = StyleSheet.create({
  cardBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  shopBadge: {
    alignItems: 'center',
    borderColor: market.accent,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  personalArt: { width: PERSONAL_ART_WIDTH },
  /*
   * Thẻ gian hàng: bề rộng CỐ ĐỊNH như thẻ cá nhân. Bản `alignSelf: 'stretch'` + tỉ lệ khung suy bề
   * rộng từ chiều cao hàng - ảnh rộng ra ép chữ xuống thêm dòng, dòng thừa tràn đè lên đoạn mô tả
   * bên dưới (người dùng báo 19/11/2026).
   */
  shopArt: { width: PERSONAL_ART_WIDTH },
  ribbon: {
    aspectRatio: PARTNER_TRACK_RIBBON_RATIO,
    position: 'absolute',
    right: RIBBON.offsetRight,
    top: RIBBON.offsetTop,
    width: RIBBON.width,
  },
});
