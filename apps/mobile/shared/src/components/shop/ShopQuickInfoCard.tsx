import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { VerifiedName } from '@/components/ui/VerifiedName';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { useAppFormat } from '@/i18n/use-app-format';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { roundedCount } from '@/lib/rounded-count';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';
import { shopHighlightOf } from './shop-highlight';

export interface ShopQuickInfoCardShop {
  name: string;
  slug: string;
  logoUrl?: string | null;
  verified: boolean;
  province?: string | null;
  bio?: string | null;
  /**
   * `undefined` KHÁC `null`/`0` — một máy chủ chưa lên bản mới vẫn trả thiếu trường này (cùng
   * lý do đã ghi ở `HostMetrics`). Component phải im lặng, không vỡ màn.
   */
  ratingAvg?: string | null;
  ratingCount?: number;
  completedTripCount?: number;
}

/**
 * Thẻ "thông tin nhanh gian hàng" DÙNG CHUNG — bản native của
 * `apps/web/src/components/shop/ShopQuickInfoCard.tsx`.
 *
 * Hai nơi gọi, đúng như web: trang chi tiết xe (`variant="full"`) và cột tóm tắt của luồng gửi
 * yêu cầu thuê (`variant="compact"`). Trước 23/09/2026 mỗi nơi tự dựng avatar + tên + rating
 * riêng, và hai bản lệch nhau cả về DỮ LIỆU lẫn kiểu dáng — bản ở luồng đặt xe hiện rating của
 * CHIẾC XE dưới tên GIAN HÀNG, tức một con số nói về thứ khác với nhãn của nó.
 *
 * `compact` bỏ giới thiệu, ba chỉ số và dòng tóm tắt uy tín: cột tóm tắt của luồng đặt xe đã có
 * ảnh xe, giá và thông số ngay phía trên, không phải chỗ lặp lại cả một hồ sơ gian hàng.
 */
export function ShopQuickInfoCard({
  shop,
  metrics,
  variant = 'full',
  actions,
  openLabel,
}: {
  shop: ShopQuickInfoCardShop;
  metrics: HostMetricsShape | null | undefined;
  /**
   * `inline` = biến thể của trang chi tiết xe (web #212 `variant="inline"`): bố cục như `full`,
   * nhưng nhãn chỉ số ngắn (`Shops.metrics.inlineLabel.*` — "Tỉ lệ đồng ý", "Phản hồi trong").
   */
  variant?: 'full' | 'compact' | 'inline';
  /** Nút nằm trong thẻ — `full` xếp xuống dưới, `compact` nằm cuối hàng danh tính. */
  actions?: ReactNode;
  /**
   * Nhãn của việc mà CHẠM VÀO THẺ sẽ làm ("Xem gian hàng") — chỉ dùng ở `compact`.
   *
   * Nó vừa là chữ hiện lên (web có một liên kết chữ ở đúng chỗ này) vừa là phần thứ hai của nhãn
   * khả truy cập: một thẻ chỉ đọc lên tên gian hàng thì trình đọc màn hình nói "Gara ABC, nút" —
   * người nghe biết bấm được nhưng không biết bấm ra cái gì.
   */
  openLabel?: string;
}) {
  const colors = useColors();
  const t = useTranslations('Shops');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();

  const compact = variant === 'compact';
  const ratingAvg = shop.ratingAvg != null ? Number(shop.ratingAvg) : null;
  const hasRating =
    typeof shop.ratingCount === 'number' &&
    shop.ratingCount > 0 &&
    ratingAvg != null &&
    Number.isFinite(ratingAvg);
  const hasTrips = typeof shop.completedTripCount === 'number';
  const trips = hasTrips ? roundedCount(shop.completedTripCount as number) : null;

  /*
   * Dòng ghi chú LUÔN có ở biến thể đầy đủ — nội dung đổi theo số liệu thật của từng gian hàng
   * (`shopHighlightOf`). Để trống chỗ này với gian hàng chưa nổi bật làm thẻ trông như thiếu
   * mất một phần, mà mọi gian hàng đều có ít nhất một điều đúng để nói.
   */
  const highlight = compact
    ? null
    : shopHighlightOf({
        metrics,
        ratingAvg,
        ratingCount: shop.ratingCount,
        completedTripCount: shop.completedTripCount,
      });

  if (variant === 'inline') {
    return (
      <InlineShopCard
        shop={shop}
        metrics={metrics}
        rating={hasRating ? (ratingAvg as number) : null}
        trips={trips}
        highlightText={
          highlight
            ? t(`card.highlight.${highlight.key}`, {
                rating: highlight.rating === null ? '' : fmt.rating(highlight.rating),
                count: highlight.count,
              })
            : null
        }
        onOpen={() => navigateOnce(ROUTES.explore.shopDetail(shop.slug))}
      />
    );
  }

  /*
    CẢ THẺ mở trang gian hàng, không phải riêng cái tên như web: một dòng chữ 14px là đích chạm
    quá nhỏ, và trong thẻ không có gì khác để bấm ngoài các nút ở `actions` (chúng tự nuốt sự
    kiện chạm của mình).

    `compact` KHÔNG tự bọc `Card`: nơi gọi duy nhất của nó (`VehicleSummaryCard`) đã nằm trong
    một thẻ, và một thẻ lồng trong thẻ ở native đọc ra như hai khối rời — web tránh đúng điều
    này bằng cách để biến thể compact là một `div` trần và cho nơi gọi tự vẽ đường phân cách.
  */
  const body = (
    <YStack gap={space.sm}>
      <XStack ai="center" gap={compact ? space.sm : space.md}>
        <Avatar
          name={shop.name}
          url={shop.logoUrl}
          size={compact ? 36 : 44}
          verifiedLabel={shop.verified ? t('header.verified') : undefined}
        />
        <YStack f={1} gap={2}>
          {/*
              Hai tuyến trên một chợ (ADR 0028) — như web #212 (`Shops.card.type.*`): đã xác minh là
              gian hàng, còn lại là chủ xe cá nhân. Cùng tín hiệu với thẻ xe ở trang kết quả.
            */}
          {compact ? null : (
            <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
              {shop.verified ? t('card.type.shop') : t('card.type.owner')}
            </Text>
          )}
          {/*
              Dấu xác minh CÓ ĐIỀU KIỆN (ADR 0028): nó nói "gian hàng thuê bao đã xác minh", mà
              chủ xe cá nhân tuyến hoa hồng cũng lên chợ được. Gắn cho tất cả là làm dấu mất nghĩa.
            */}
          <VerifiedName
            name={shop.name}
            verifiedLabel={shop.verified ? t('header.verified') : undefined}
            size={compact ? fontSize.bodySm : fontSize.body}
            markSize={16}
            decorativeMark
          />
          {/* Tỉnh + lời giới thiệu chỉ ở biến thể `full` (`inline` có thẻ riêng `InlineShopCard`). */}
          {variant === 'full' && shop.province ? (
            <XStack ai="center" gap={4}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                {shop.province}
              </Text>
            </XStack>
          ) : null}
          {variant === 'full' && shop.bio ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {shop.bio}
            </Text>
          ) : null}
          {/*
              Điểm đánh giá và số chuyến là của GIAN HÀNG (`shopRatingAvg`/`shopCompletedTripCount`),
              KHÔNG phải của chiếc xe đang xem — thẻ này nói về người bán.
            */}
          {hasRating || hasTrips ? (
            <XStack ai="center" gap={space.xs} flexWrap="wrap">
              {hasRating ? (
                <XStack ai="center" gap={4}>
                  <Ionicons name="star" size={12} color={market.star} />
                  <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                    {fmt.rating(ratingAvg as number)}
                    {shop.ratingCount ? (
                      <Text col={colors.textMuted} fow={fontWeight.regular}>
                        {` (${shop.ratingCount})`}
                      </Text>
                    ) : null}
                  </Text>
                </XStack>
              ) : null}
              {hasRating && hasTrips ? (
                <Text col={colors.borderSubtle} fos={fontSize.label}>
                  •
                </Text>
              ) : null}
              {hasTrips && trips ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('card.trips', {
                    count: trips.display,
                    plus: trips.approximate ? '+' : '',
                  })}
                </Text>
              ) : null}
            </XStack>
          ) : null}
        </YStack>
        {/*
            `compact` bày NHÃN hành động rồi mới tới mũi tên — web có một liên kết chữ "Xem gian
            hàng" ở đúng chỗ này, và một mũi tên trần thì trình đọc màn hình không đọc ra được.
            Nhãn là chữ THƯỜNG, không phải một nút lồng: cả hàng đã là đích chạm, và một nút bên
            trong một nút là hai đích cho cùng một việc.
          */}
        {compact ? (
          <XStack ai="center" gap={4}>
            {openLabel ? (
              <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.medium}>
                {openLabel}
              </Text>
            ) : null}
            {actions}
            <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.placeholder} />
          </XStack>
        ) : null}
      </XStack>

      {compact ? null : (
        <HostMetrics metrics={metrics} />
      )}

      {highlight ? (
        <XStack ai="flex-start" gap={space.xs}>
          <Ionicons name="ribbon-outline" size={14} color={colors.primary} />
          <Text f={1} col={colors.textMuted} fos={fontSize.label}>
            {t(`card.highlight.${highlight.key}`, {
              rating: highlight.rating === null ? '' : fmt.rating(highlight.rating),
              count: highlight.count,
            })}
          </Text>
        </XStack>
      ) : null}

      {!compact && actions ? <YStack gap={space.xs}>{actions}</YStack> : null}
    </YStack>
  );

  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        /* Tên gian hàng + VIỆC sẽ xảy ra — xem `openLabel`. */
        accessibilityLabel={openLabel ? `${shop.name} — ${openLabel}` : shop.name}
        onPress={() => navigateOnce(ROUTES.explore.shopDetail(shop.slug))}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <Card
      lift="flat"
      onPress={() => navigateOnce(ROUTES.explore.shopDetail(shop.slug))}
      accessibilityLabel={shop.name}
    >
      {body}
    </Card>
  );
}

/**
 * Thẻ "Chủ xe" của trang chi tiết xe — `inlineCard` web ≤640px (Figma `19771:72767`):
 *
 * - khung: đệm 16, viền 1px `primary-glow` (tối: `primary-muted` — vàng chói quá gắt trên nền tối),
 *   bo `card` 16, nền thẻ;
 * - avatar 48 + nhãn tuyến (16 `text-tertiary`) / tên gian hàng (16 Semibold);
 * - ba chỉ số (nhãn ngắn) cách 16;
 * - điểm ★ (số lượt) · số chuyến (icon cột xanh) dưới cùng, cách 16;
 * - dòng nổi bật của gian hàng (như web) nếu có.
 *
 * Cả thẻ mở trang gian hàng — cùng lý do với biến thể `full`.
 */
function InlineShopCard({
  shop,
  metrics,
  rating,
  trips,
  highlightText,
  onOpen,
}: {
  shop: ShopQuickInfoCardShop;
  metrics: HostMetricsShape | null | undefined;
  rating: number | null;
  trips: ReturnType<typeof roundedCount> | null;
  highlightText: string | null;
  onOpen: () => void;
}) {
  const colors = useColors();
  const { scheme } = useAppScheme();
  const t = useTranslations('Shops');
  const fmt = useAppFormat();

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={shop.name}
      style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
    >
      <YStack
        p={space.md}
        gap={space.md}
        bw={1}
        bc={scheme === 'dark' ? colors.primaryMuted : colors.primaryGlow}
        br={radius.card}
        bg={colors.surface}
      >
        <XStack ai="center" gap={12}>
          <Avatar
            name={shop.name}
            url={shop.logoUrl}
            size={48}
            verifiedLabel={shop.verified ? t('header.verified') : undefined}
          />
          <YStack f={1} minWidth={0}>
            <Text col={colors.placeholder} fos={fontSize.body}>
              {shop.verified ? t('card.type.shop') : t('card.type.owner')}
            </Text>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
              {shop.name}
            </Text>
          </YStack>
        </XStack>

        <HostMetrics metrics={metrics} inlineLabels />

        {rating != null || trips ? (
          <XStack ai="center" jc="space-between" gap={space.sm}>
            {rating != null ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="star" size={20} color={market.star} />
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {fmt.rating(rating)}
                  {shop.ratingCount ? (
                    <Text col={colors.placeholder} fow={fontWeight.regular}>
                      {` (${shop.ratingCount})`}
                    </Text>
                  ) : null}
                </Text>
              </XStack>
            ) : (
              <YStack />
            )}
            {trips ? (
              <XStack ai="center" gap={space.sm}>
                {/* Web `TripsIcon`: biểu đồ cột viền xanh `success`. */}
                <Ionicons name="stats-chart-outline" size={18} color={colors.success} />
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {t('card.trips', { count: trips.display, plus: trips.approximate ? '+' : '' })}
                </Text>
              </XStack>
            ) : null}
          </XStack>
        ) : null}

        {highlightText ? (
          <XStack
            ai="flex-start"
            gap={10}
            px={14}
            py={12}
            br={radius.md}
            bg={colors.primarySubtle}
            bw={1}
            bc={colors.primaryLight}
          >
            <Ionicons name="ribbon" size={17} color={colors.primary} />
            <Text f={1} col={colors.textMuted} fos={fontSize.body}>
              {highlightText}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </Pressable>
  );
}
