import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  STOREFRONT_KIND,
  hostMetricState,
} from '@xeprime/types';
import { images } from '@/assets';
import { InfoHint } from '@/components/ui/InfoHint';
import { ShopCover, useImageLoadFailure } from '@/components/ui/ShopCover';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { PublicShop } from '../api';
import { CardVerifiedMark } from './home/HomeCardAvatar';
import {
  ShopChartIcon,
  ShopCheckIcon,
  ShopInfoIcon,
  ShopLocationIcon,
  ShopStarIcon,
} from './shop-icons';

/** Kích thước ở bề ngang điện thoại của web (`ShopHeader.module.css` @640px). */
const AVATAR = 56;

/** `.cardShop .chat` web ≤640px: lề phải 44px để nút nhắn tin không lấn vào vương miện. */
const SHOP_CROWN_CLEARANCE = 44;
const CROWN = 56;
/** Thẻ hồ sơ gian hàng đè lên mép dưới ảnh bìa (`.headerShop .inner { margin-top: -40px }`). */
const CARD_OVERLAP = 40;
/** Dải nền trên thẻ chủ xe cá nhân (chưa gồm safe area) — đủ cho nút lui nổi + phần thẻ đè lên. */
const PERSONAL_BAND = 96;
/** Bo góc riêng của thẻ gian hàng (`.cardShop { border-radius: 24px }`) — không có token. */
const SHOP_CARD_RADIUS = 24;
/** `.cardShop { border-bottom-width: 3px }` — gờ vàng dày hơn ở đáy thẻ. */
const SHOP_CARD_BOTTOM_EDGE = 3;
/** Ô dấu xác minh trên avatar (`.avatarMark` 20×20). */
const AVATAR_MARK = 20;

interface ShopStat {
  key: string;
  value: string;
  label: string;
  star?: boolean;
  hint?: { label: string; content: string };
}

/**
 * Đầu trang gian hàng công khai — bản native của web `ShopHeader` (#222, Figma chủ xe cá nhân
 * `20058:71218`, gian hàng `20063:59332`). MỘT thẻ gom ba thứ: ai (tên, nơi có xe, điểm, số chuyến,
 * điểm nổi bật) → họ tự giới thiệu gì → hệ thống đếm được gì về họ.
 *
 * Hai mặt tiền (`storefrontKind`): `personal` — không ảnh bìa, thẻ viền xám; `shop` — ảnh bìa, thẻ
 * viền vàng đè lên bìa, vương miện, ô "Chi nhánh". Ô thiếu dữ liệu thì BIẾN MẤT, không hiện 0
 * (điểm khi chưa ai chấm; chỉ số uy tín dưới ngưỡng mẫu — ADR 0045 điều 3).
 */
export function ShopHeader({ shop }: { shop: PublicShop }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const t = useTranslations('Shops');
  const fmt = useAppFormat();
  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  // Tỉnh ĐANG có xe; chưa có xe công khai nào ⇒ rơi về tỉnh trong hồ sơ.
  const provinces =
    shop.serviceProvinceNames.length > 0
      ? shop.serviceProvinceNames
      : shop.provinceName
        ? [shop.provinceName]
        : [];

  // "Đã xác minh" đọc PHIẾU DUYỆT gian hàng (`trust.shopVerified`), không đọc `verified` (ADR 0040).
  const highlights = [
    shop.trust.shopVerified ? t('profile.verified') : null,
    shop.branchCount > 1 ? t('profile.branches', { count: shop.branchCount }) : null,
    shop.deliveryAvailable ? t('profile.delivery') : null,
  ].filter((chip): chip is string => chip !== null);

  const metricsReady = hostMetricState(shop.metrics.sampleCount) === HOST_METRIC_STATE.READY;
  const responseRate = metricsReady ? shop.metrics.responseRatePercent : null;
  const acceptKeepRate = metricsReady ? shop.metrics.acceptKeepRatePercent : null;
  // "02", "07" như bản vẽ web.
  const countValue = (value: number) => (value < 10 ? `0${value}` : fmt.count(value));

  const stats = (
    [
      isShop
        ? { key: 'branches', value: countValue(shop.branchCount), label: t('profile.stats.branches') }
        : null,
      { key: 'vehicles', value: countValue(shop.vehicleCount), label: t('profile.stats.vehicles') },
      {
        key: 'completedTrips',
        value: countValue(shop.completedTripCount),
        label: t('profile.stats.completedTrips'),
      },
      hasRating
        ? { key: 'rating', value: fmt.rating(rating), label: t('profile.stats.rating'), star: true }
        : null,
      responseRate !== null
        ? {
            key: 'responseRate',
            value: t('metrics.responseRateValue', { percent: responseRate }),
            label: t('profile.stats.responseRate'),
          }
        : null,
      acceptKeepRate !== null
        ? {
            key: 'acceptKeep',
            value: t('metrics.acceptKeepValue', { percent: acceptKeepRate }),
            label: t('profile.stats.acceptKeep'),
            hint: {
              label: t('metrics.acceptKeepHintLabel'),
              content: t('metrics.acceptKeepHint', { days: HOST_METRIC_WINDOW_DAYS }),
            },
          }
        : null,
    ] satisfies (ShopStat | null)[]
  ).filter((stat): stat is NonNullable<typeof stat> => stat !== null);
  // Hai cột ở bề ngang điện thoại (web @640px `repeat(2, 1fr)`).
  const statRows = Array.from({ length: Math.ceil(stats.length / 2) }, (_unused, row) =>
    stats.slice(row * 2, row * 2 + 2),
  );

  return (
    <YStack>
      {isShop ? (
        <ShopCover url={shop.coverUrl} />
      ) : (
        /*
          Chủ xe cá nhân KHÔNG có ảnh bìa (như web), nhưng thẻ hồ sơ đứng sát đỉnh thì thanh trạng thái
          và nút lui nổi đè lên nó (người dùng chốt 28/10/2026). Một dải nền vàng nhạt TRƠN — không
          phải ảnh bìa, không mượn ngôn ngữ gian hàng — chừa chỗ cho hai thứ đó, thẻ đè lên mép dưới.
        */
        <YStack h={insets.top + PERSONAL_BAND} ov="hidden">
          <LinearGradient
            colors={[colors.primaryLight, colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Hai vòng tròn mờ trang trí góc phải — cùng hoạ tiết màn "Trở thành chủ xe". */}
          <YStack pos="absolute" top={-60} right={-50} w={180} h={180} br={90} bg={colors.primary} opacity={0.12} />
          <YStack pos="absolute" top={insets.top + 30} right={90} w={60} h={60} br={30} bg={colors.primary} opacity={0.1} />
        </YStack>
      )}

      <YStack px={layout.screenX} mt={-CARD_OVERLAP}>
        <YStack
          p={space.md}
          gap={20}
          bw={1}
          bc={isShop ? colors.primaryGlow : colors.border}
          borderBottomWidth={isShop ? SHOP_CARD_BOTTOM_EDGE : 1}
          br={isShop ? SHOP_CARD_RADIUS : radius.card}
          bg={colors.surface}
          ov="visible"
        >
          {isShop ? (
            /*
              Vân nền thẻ gian hàng: ảnh `card-texture` phủ một lớp nền thẻ 80% — đúng
              `linear-gradient(rgba(255,255,255,.8)…)` của web, nhưng lớp phủ lấy màu nền THẺ của
              palette hiện hành để giao diện tối không thành một khối trắng.
            */
            <YStack style={StyleSheet.absoluteFill} br={SHOP_CARD_RADIUS} ov="hidden">
              <Image
                source={images.shopCardTexture}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                contentPosition="top"
                accessible={false}
              />
              <YStack style={StyleSheet.absoluteFill} bg={colors.surface} opacity={0.8} />
            </YStack>
          ) : null}
          {isShop ? (
            <Image
              source={images.shopCrown}
              style={{ position: 'absolute', top: -12, right: -6, width: CROWN, height: CROWN }}
              contentFit="contain"
              accessible={false}
            />
          ) : null}

          {/* Tóm tắt: danh tính + điểm nổi bật, ngăn với phần dưới bằng một đường kẻ. */}
          <YStack
            gap={isShop ? 20 : space.sm + space.xs}
            pb={space.md}
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            <XStack ai="flex-start" gap={space.sm + space.xs}>
              <ShopAvatar shop={shop} isShop={isShop} verifiedLabel={t('header.verified')} />

              <YStack f={1} minWidth={0} gap={isShop ? space.sm : 6}>
                <XStack ai="center" flexWrap="wrap" columnGap={space.sm + space.xs} rowGap={space.sm}>
                  <Text
                    col={colors.text}
                    fos={fontSize.h2}
                    fow={fontWeight.semibold}
                    accessibilityRole="header"
                  >
                    {shop.name}
                  </Text>
                  <YStack px={space.sm} py={2} br={radius.card} bg={colors.primaryLight}>
                    <Text col={colors.primary} fos={fontSize.body} fow={fontWeight.medium}>
                      {t(isShop ? 'profile.badgeShop' : 'profile.badgePersonal')}
                    </Text>
                  </YStack>
                </XStack>

                {/* Bề ngang điện thoại: các dòng meta xếp DỌC (web @640px `flex-direction: column`). */}
                <YStack gap={space.xs}>
                  {provinces.length > 0 ? (
                    <MetaRow icon={<ShopLocationIcon color={colors.textPlaceholder} />}>
                      <Text col={colors.textMuted} fos={fontSize.body}>
                        {provinces.join(' · ')}
                      </Text>
                    </MetaRow>
                  ) : null}
                  <MetaRow icon={hasRating ? <ShopStarIcon /> : null}>
                    {hasRating ? (
                      <Text col={colors.textMuted} fos={fontSize.body}>
                        {`${fmt.rating(rating)} `}
                        <Text col={colors.textPlaceholder}>
                          {t('profile.ratingCount', { count: shop.ratingCount })}
                        </Text>
                      </Text>
                    ) : (
                      <Text col={colors.textPlaceholder} fos={fontSize.body}>
                        {t('header.noRating')}
                      </Text>
                    )}
                  </MetaRow>
                  <MetaRow icon={<ShopChartIcon color={colors.success} />}>
                    <Text col={colors.text} fos={fontSize.body}>
                      {t('profile.trips', { count: shop.completedTripCount })}
                    </Text>
                  </MetaRow>
                </YStack>
              </YStack>

              {/*
                Nút nhắn tin tròn ở mép phải hàng danh tính (web `.chat`); tự ẩn khi hộp thư tắt.
                Gian hàng ≤640px: `.cardShop .chat { margin-right: 44px }` — vương miện 56px chiếm ~44px
                mép phải thẻ nên nút đứng hẳn ra ngoài. Khi nút ẩn, 44dp đó vẫn là vùng của vương miện.
              */}
              <YStack marginRight={isShop ? SHOP_CROWN_CLEARANCE : 0}>
                <ShopChatButton
                  shopSlug={shop.slug}
                  publicChatOpen={shop.chatOpen}
                  label={t('profile.message')}
                  iconOnly
                  iconTone="surface"
                />
              </YStack>
            </XStack>

            {highlights.length > 0 ? (
              <XStack
                flexWrap="wrap"
                columnGap={space.md}
                rowGap={space.sm}
                accessibilityLabel={t('profile.highlightsLabel')}
              >
                {highlights.map((chip) => (
                  <XStack
                    key={chip}
                    ai="center"
                    gap={6}
                    px={space.sm}
                    py={space.xs}
                    br={radius.card}
                    bg={colors.infoSurface}
                  >
                    <ShopCheckIcon color={colors.info} />
                    <Text col={colors.info} fos={fontSize.body} fow={fontWeight.medium}>
                      {chip}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            ) : null}
          </YStack>

          {shop.bio || shop.address ? (
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold} accessibilityRole="header">
                {t('profile.aboutTitle')}
              </Text>
              {shop.bio ? (
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {shop.bio}
                </Text>
              ) : null}
              {shop.address ? (
                <Text col={colors.textMuted} fos={fontSize.body} mt={shop.bio ? space.xs : 0}>
                  {t('profile.address', { address: shop.address })}
                </Text>
              ) : null}
            </YStack>
          ) : null}

          <YStack gap={space.sm + space.xs} accessibilityLabel={t('profile.stats.label')}>
            {statRows.map((row) => (
              <XStack key={row[0]?.key} gap={space.sm + space.xs}>
                {row.map((stat) => (
                  <YStack
                    key={stat.key}
                    f={1}
                    minWidth={0}
                    ai="center"
                    jc="center"
                    gap={space.xs}
                    py={space.sm}
                    px={space.sm + space.xs}
                    br={radius.control}
                    bg={isShop ? colors.surface : colors.background}
                  >
                    <XStack ai="center" gap={space.xs}>
                      <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
                        {stat.value}
                      </Text>
                      {stat.star ? (
                        <ShopStarIcon size={16} />
                      ) : null}
                    </XStack>
                    <XStack ai="flex-start" gap={space.xs} maxWidth="100%">
                      <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
                        {stat.label}
                      </Text>
                      {stat.hint ? (
                        <InfoHint label={stat.hint.label} content={stat.hint.content} />
                      ) : null}
                    </XStack>
                  </YStack>
                ))}
                {/* Hàng lẻ: một ô rỗng giữ ô thật ở đúng nửa bề ngang, như lưới 2 cột của web. */}
                {row.length < 2 ? <YStack f={1} /> : null}
              </XStack>
            ))}
          </YStack>

          <XStack ai="center" gap={space.sm}>
            <ShopInfoIcon color={colors.textPlaceholder} />
            <Text col={colors.textPlaceholder} fos={fontSize.body} fontStyle="italic" f={1}>
              {t('profile.joined', { date: fmt.monthYear(new Date(shop.joinedAt)) })}
            </Text>
          </XStack>
        </YStack>
      </YStack>
    </YStack>
  );
}

/** Một dòng meta có ô icon 20×20 đứng trước (web `.metaItem` + `.metaIcon`). */
function MetaRow({ icon, children }: { icon: ReactNode | null; children: ReactNode }) {
  return (
    <XStack ai="center" gap={space.sm} minWidth={0}>
      {icon ? (
        <YStack w={20} h={20} ai="center" jc="center">
          {icon}
        </YStack>
      ) : null}
      <YStack f={1} minWidth={0}>
        {children}
      </YStack>
    </XStack>
  );
}

/**
 * Avatar tròn 56 — logo hoặc chữ cái đầu trên nền vàng nhạt; gian hàng có vành vàng. Dấu XANH ở
 * góc là dấu GIAN HÀNG (`shop.verified`), cùng dấu ở logo trên thẻ xe.
 */
function ShopAvatar({
  shop,
  isShop,
  verifiedLabel,
}: {
  shop: PublicShop;
  isShop: boolean;
  verifiedLabel: string;
}) {
  const colors = useColors();
  const { failed, onError } = useImageLoadFailure(shop.logoUrl);
  const showImage = Boolean(shop.logoUrl) && !failed;

  return (
    <YStack w={AVATAR} h={AVATAR} flexShrink={0}>
      <YStack
        w={AVATAR}
        h={AVATAR}
        br={radius.pill}
        bg={colors.primaryLight}
        bw={isShop ? 1 : 0}
        bc={colors.primaryGlow}
        ai="center"
        jc="center"
        ov="hidden"
      >
        {showImage ? (
          <Image
            source={{ uri: shop.logoUrl as string }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel={shop.name}
            onError={onError}
          />
        ) : (
          <Text col={colors.primaryStrong} fos={fontSize.h2} fow={fontWeight.semibold}>
            {shop.name.trim().charAt(0).toLocaleUpperCase() || '?'}
          </Text>
        )}
      </YStack>
      {shop.verified ? (
        <YStack
          position="absolute"
          right={-2}
          bottom={-2}
          w={AVATAR_MARK}
          h={AVATAR_MARK}
          br={radius.pill}
          bg={colors.surface}
          ai="center"
          jc="center"
          accessibilityRole="image"
          accessibilityLabel={verifiedLabel}
        >
          {/* Huy hiệu XANH `card-verified.svg` — cùng dấu ở logo gian hàng trên thẻ xe. */}
          <CardVerifiedMark size={17} />
        </YStack>
      ) : null}
    </YStack>
  );
}
