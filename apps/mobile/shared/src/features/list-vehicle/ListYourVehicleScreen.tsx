import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, type ImageSourcePropType } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LEGAL_DOC } from '@xeprime/domain';
import { REGISTRATION_TRACK, type RegistrationTrack } from '@xeprime/types';
import { OWNER_PERSONAL_CAR_RATIO, OWNER_SHOP_SHOWROOM_RATIO, images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { InlineAction } from '@/components/ui/InlineAction';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { usePartnerOffer } from './use-partner-offer';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Số xe tối đa của chủ xe tuyến hoa hồng (Owner Lite — ADR 0041 điều 4).
 *
 * Để ở ĐÂY, không rải vào câu dịch: con số xuất hiện ở cả `vi` lẫn `en`, và một ngày nào đó nó đổi
 * theo gói — lúc đó phải chỉ có MỘT chỗ để sửa. Cùng hằng số, cùng giá trị với
 * `ListYourVehicleLanding` bên web; đổi một bên là đổi cả hai. Mức hoa hồng KHÔNG in thành số: nó là
 * bậc thang theo ngày thuê trong `fee_policies` (ADR 0064 điều 3).
 */
const BASIC_OWNER_VEHICLE_CAP = 3;

/** Đường kính số thứ tự của một bước trong dải "3 bước". */
const STEP_DOT = 28;
/** Ô biểu tượng của thẻ chọn tuyến. */
const TRACK_ICON_BOX = 44;

const styles = StyleSheet.create({
  // Minh hoạ chỉ chiếm ~70% bề ngang thẻ: đủ để nhận ra tuyến, không đẩy nút xuống hai màn cuộn.
  art: { width: '70%', alignSelf: 'center' },
  pressed: { opacity: 0.85 },
});

/**
 * Phần NHẤN trong câu ICU (`<strong>`). React Native lồng `Text` trong `Text` để đổi kiểu chữ
 * giữa câu — cách duy nhất có phần nhấn inline cho hai con số quan trọng nhất (mức phí, "0%").
 */
function strong(chunks: ReactNode): ReactNode {
  return <Text fow={fontWeight.semibold}>{chunks}</Text>;
}

/**
 * Landing "Đăng xe cho thuê" — cửa vào của chủ xe mới, HAI TUYẾN song song (ADR 0028). Bản native
 * của `ListYourVehicleLanding`; app khách dùng nó làm trang giới thiệu, app Partner dùng nó làm màn
 * chọn cách cho thuê cho tài khoản đối tác chưa có gian hàng.
 *
 * Bố cục di động (06/10/2026): web xếp hai thẻ tuyến đầy đủ cạnh nhau; trên điện thoại việc đó
 * thành hai màn cuộn và nút của tuyến thứ hai chìm dưới đáy. Ở đây hai tuyến là hai thẻ CHỌN gọn,
 * chỉ tuyến đang chọn bung chi tiết, và nút hành động ghim ở đáy màn. Nội dung và đích đi giữ
 * nguyên như web: trang không tự chuyển lựa chọn này thành lựa chọn kia, và không tự tạo gian hàng
 * cho ai — chỉ lượt bấm nút của đúng tuyến mới thể hiện ý định.
 */
export function ListYourVehicleScreen({
  showBack = true,
  footer,
  onChoose,
}: {
  /**
   * Thay đích mặc định của nút chính: màn đăng ký đối tác của app Partner dùng lựa chọn này để mở
   * form đăng ký một trang của đúng tuyến (như web `/register?track=`).
   */
  onChoose?: (track: RegistrationTrack) => void;
  /**
   * `false` = màn chọn cách cho thuê của app XePrime Partner cho tài khoản đối tác CHƯA có gian hàng
   * (web `PartnerRegisterView` → `showBack={false}`): không có nơi nào để lui về.
   */
  showBack?: boolean;
  /** Phần đuôi riêng của nơi dùng (vd. dòng Đăng xuất ở app Partner). */
  footer?: ReactNode;
} = {}) {
  const colors = useColors();
  const t = useTranslations('ListYourVehicle.landing');
  // Khoảng % hoa hồng đọc từ chính sách phí hiện hành; chưa có thì giữ câu chung, không đoán số.
  const offer = usePartnerOffer().data;
  const commissionRange =
    offer?.minOwnerCommissionPercent != null && offer.maxOwnerCommissionPercent != null
      ? { min: offer.minOwnerCommissionPercent, max: offer.maxOwnerCommissionPercent }
      : null;
  /* `.offerBig` web: "0%" màu `color-success` cỡ h3 (28px) giữa tiêu đề ưu đãi gian hàng. */
  const offerBig = (chunks: ReactNode) => (
    <Text col={colors.success} fos={fontSize.h3} lh={28}>
      {chunks}
    </Text>
  );
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const openLegalDoc = useOpenLegalDoc();
  // Tuyến nền tảng gợi ý trước là đăng xe cá nhân — giống thẻ `featured` của web.
  const [track, setTrack] = useState<RegistrationTrack>(REGISTRATION_TRACK.COMMISSION);
  const isPersonal = track === REGISTRATION_TRACK.COMMISSION;

  /*
   * Hai nút đi qua bản đồ route của TỪNG APP: ở app XePrime cả hai đổ về màn handoff sang app
   * Partner (ADR 0053); ở app Partner chúng là bước đầu THẬT của hai tuyến — wizard đăng xe nhanh
   * và onboarding gói.
   */
  const go = () => {
    if (onChoose) {
      onChoose(track);
      return;
    }
    navigateOnce(
      isPersonal
        ? ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.MARKETPLACE)
        : ROUTES.manage.onboarding(REGISTRATION_TRACK.PACKAGE),
    );
  };

  return (
    <>
      {/* Không đặt tiêu đề dài lên thanh (nó bị cắt): header mang logo, tiêu đề nằm ở khối mở đầu. */}
      {showBack ? (
        <AppHeader onBack={() => goBackOr(router, ROUTES.explore.home())} />
      ) : (
        <AppHeader />
      )}
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          <YStack gap={space.xs}>
            <Button
              label={isPersonal ? t('personal.cta') : t('shop.cta')}
              icon={isPersonal ? 'car-sport-outline' : 'storefront-outline'}
              onPress={go}
            />
            {/* Phần đuôi của nơi dùng (Đăng xuất ở app Partner) dính đáy cùng nút chính. */}
            {footer}
          </YStack>
        }
      >
        <YStack gap={space.lg} pb={space.md}>
          <Hero
            eyebrow={t('metaTitle')}
            title={t('title')}
            subtitle={t('appSubtitle')}
            stepsTitle={t('how.title')}
            steps={[
              { key: 'account', title: t('how.account.title'), desc: t('how.account.desc') },
              { key: 'choose', title: t('how.choose.title'), desc: t('how.choose.desc') },
              { key: 'publish', title: t('how.publish.title'), desc: t('how.publish.desc') },
            ]}
          />

          <YStack gap={space.sm}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
              {t('chooseTitle')}
            </Text>
            <TrackOption
              icon="car-sport-outline"
              badge={t('personal.badge')}
              title={t('personal.title')}
              tagline={t('personal.tagline')}
              selected={isPersonal}
              selectedLabel={t('selected')}
              onSelect={() => setTrack(REGISTRATION_TRACK.COMMISSION)}
            />
            <TrackOption
              icon="storefront-outline"
              badge={t('shop.badge')}
              recommended={t('shop.recommended')}
              title={t('shop.title')}
              tagline={t('shop.tagline')}
              selected={!isPersonal}
              selectedLabel={t('selected')}
              onSelect={() => setTrack(REGISTRATION_TRACK.PACKAGE)}
            />
          </YStack>

          {isPersonal ? (
            <TrackDetail
              body={t('personal.body', { maxVehicles: BASIC_OWNER_VEHICLE_CAP })}
              features={[
                {
                  key: 'noFee',
                  icon: 'document-text-outline',
                  label: t('personal.features.noFee'),
                },
                {
                  key: 'vehicleCap',
                  icon: 'car-outline',
                  label: t('personal.features.vehicleCap', {
                    maxVehicles: BASIC_OWNER_VEHICLE_CAP,
                  }),
                },
                { key: 'simple', icon: 'settings-outline', label: t('personal.features.simple') },
              ]}
              art={images.ownerPersonalCar}
              artRatio={OWNER_PERSONAL_CAR_RATIO}
              artNote={t('personal.art')}
              offerIcon="pricetag-outline"
              offerTitle={t('personal.offerTitle')}
              offerBody={
                commissionRange
                  ? t.rich('personal.offerBodyRange', { ...commissionRange, strong })
                  : t.rich('personal.offerBody', { strong })
              }
            />
          ) : (
            <TrackDetail
              body={t('shop.appBody')}
              features={[
                { key: 'fleet', icon: 'git-network-outline', label: t('shop.features.fleet') },
                {
                  key: 'operations',
                  icon: 'calendar-outline',
                  label: t('shop.features.operations'),
                },
                { key: 'reports', icon: 'bar-chart-outline', label: t('shop.features.reports') },
              ]}
              art={images.ownerShopShowroom}
              artRatio={OWNER_SHOP_SHOWROOM_RATIO}
              offerIcon="ribbon-outline"
              offerTitle={t.rich('shop.offerHighlight', { big: offerBig })}
              offerBody={t('shop.offerBody')}
            />
          )}

          <Card tone="muted" lift="flat">
            <XStack ai="flex-start" gap={space.sm}>
              <Ionicons name="sync-outline" size={iconSize.md} color={colors.primaryActive} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('upgrade.appTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('upgrade.appBody')}
                </Text>
              </YStack>
            </XStack>
          </Card>

          {/*
            Liên kết chính sách trỏ tới TÀI LIỆU CÓ THẬT (quy chế sàn) — không hứa điều nền tảng
            chưa có văn bản.
          */}
          <XStack ai="center" jc="center" gap={space.xs}>
            <Ionicons
              name="shield-checkmark-outline"
              size={iconSize.sm}
              color={colors.primaryActive}
            />
            <InlineAction
              label={t('policyLink')}
              onPress={() => openLegalDoc(LEGAL_DOC.MARKETPLACE_RULES)}
            />
          </XStack>
        </YStack>
      </Screen>
    </>
  );
}

interface HeroStep {
  key: string;
  title: string;
  desc: string;
}

/** Khối mở đầu: nhãn, tiêu đề, mô tả và dải "3 bước" để người mới biết đường đi trước khi chọn. */
function Hero({
  eyebrow,
  title,
  subtitle,
  stepsTitle,
  steps,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  stepsTitle: string;
  steps: HeroStep[];
}) {
  const colors = useColors();
  return (
    <Card tone="accent">
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <XStack
            alignSelf="flex-start"
            ai="center"
            gap={4}
            px={space.sm}
            py={2}
            br={radius.pill}
            bg={colors.primary}
          >
            <Ionicons name="key-outline" size={iconSize.xs} color={colors.onPrimary} />
            <Text col={colors.onPrimary} fos={fontSize.meta} fow={fontWeight.semibold}>
              {eyebrow}
            </Text>
          </XStack>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {subtitle}
          </Text>
        </YStack>

        <YStack gap={space.sm} p={space.sm} br={radius.md} bg={colors.surface}>
          <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
            {stepsTitle}
          </Text>
          {steps.map((step, index) => (
            <XStack key={step.key} ai="flex-start" gap={space.sm}>
              <YStack
                w={STEP_DOT}
                h={STEP_DOT}
                br={STEP_DOT / 2}
                ai="center"
                jc="center"
                bg={colors.primaryLight}
              >
                <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.bold}>
                  {index + 1}
                </Text>
              </YStack>
              <YStack f={1} minWidth={0}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {step.title}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {step.desc}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

/** Thẻ CHỌN một tuyến — gọn, có trạng thái chọn rõ (viền + dấu tích), đọc được bằng trình đọc màn hình. */
function TrackOption({
  icon,
  badge,
  recommended,
  title,
  tagline,
  selected,
  selectedLabel,
  onSelect,
}: {
  icon: IconName;
  badge?: string;
  /** Nhãn "Gói đề xuất" — cùng nhãn góc thẻ gian hàng của web (Figma `20043:54654`). */
  recommended?: string;
  title: string;
  tagline: string;
  selected: boolean;
  selectedLabel: string;
  onSelect: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={title}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      <XStack
        ai="center"
        gap={space.sm}
        p={space.md}
        br={radius.lg}
        bw={selected ? 2 : 1}
        bc={selected ? colors.primary : colors.border}
        bg={selected ? colors.surfaceSelected : colors.surface}
      >
        <YStack
          w={TRACK_ICON_BOX}
          h={TRACK_ICON_BOX}
          br={radius.md}
          ai="center"
          jc="center"
          bg={selected ? colors.primary : colors.surfaceMuted}
        >
          <Ionicons
            name={icon}
            size={iconSize.md}
            color={selected ? colors.onPrimary : colors.textMuted}
          />
        </YStack>
        <YStack f={1} minWidth={0} gap={2}>
          {recommended ? (
            <XStack
              alignSelf="flex-start"
              ai="center"
              gap={4}
              px={space.xs}
              py={2}
              br={radius.pill}
              bg={colors.danger}
            >
              <Ionicons name="thumbs-up" size={iconSize.xs} color={colors.surface} />
              <Text col={colors.surface} fos={fontSize.meta} fow={fontWeight.bold}>
                {recommended}
              </Text>
            </XStack>
          ) : null}
          {badge ? (
            <Text col={colors.primaryActive} fos={fontSize.meta} fow={fontWeight.semibold}>
              {badge}
            </Text>
          ) : null}
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
            {tagline}
          </Text>
        </YStack>
        <Ionicons
          name={selected ? 'checkmark-circle' : 'ellipse-outline'}
          size={iconSize.md}
          color={selected ? colors.primaryActive : colors.textMuted}
          accessibilityLabel={selected ? selectedLabel : undefined}
        />
      </XStack>
    </Pressable>
  );
}

interface TrackFeature {
  key: string;
  icon: IconName;
  label: string;
}

/**
 * Chi tiết của tuyến đang chọn: mô tả, ba gạch đầu dòng, minh hoạ và khối ưu đãi. `artNote` là
 * CHỮ THẬT của giao diện, không vẽ vào ảnh — nó phải dịch được.
 */
function TrackDetail({
  body,
  features,
  art,
  artRatio,
  artNote,
  offerIcon,
  offerTitle,
  offerBody,
}: {
  body: ReactNode;
  features: TrackFeature[];
  art: ImageSourcePropType;
  /** Rộng ÷ cao của chính file SVG — giữ khung trước khi ảnh tải xong, không để thẻ nhảy. */
  artRatio: number;
  artNote?: string;
  offerIcon: IconName;
  offerTitle: ReactNode;
  offerBody: ReactNode;
}) {
  const colors = useColors();
  return (
    <Card>
      <YStack gap={space.md}>
        <Image
          source={art}
          style={[styles.art, { aspectRatio: artRatio }]}
          contentFit="contain"
          // Ảnh TRANG TRÍ: mọi thứ nó nói đã có trong chữ bên dưới.
          accessible={false}
        />
        {artNote ? (
          <Text col={colors.textMuted} fos={fontSize.meta} ta="center" mt={-space.sm}>
            {artNote}
          </Text>
        ) : null}

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
        </Text>

        <XStack flexWrap="wrap" gap={space.xs}>
          {features.map((feature) => (
            <XStack
              key={feature.key}
              ai="center"
              gap={4}
              px={space.sm}
              py={4}
              br={radius.pill}
              bg={colors.surfaceMuted}
            >
              <Ionicons name={feature.icon} size={iconSize.sm} color={colors.primaryActive} />
              <Text col={colors.text} fos={fontSize.label}>
                {feature.label}
              </Text>
            </XStack>
          ))}
        </XStack>

        <XStack ai="flex-start" gap={space.sm} p={space.sm} br={radius.md} bg={colors.primaryLight}>
          <Ionicons name={offerIcon} size={iconSize.sm} color={colors.primaryActive} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {offerTitle}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {offerBody}
            </Text>
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}
