import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STOREFRONT_KIND } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PublicShop } from '../api';
import { HostMetrics } from './HostMetrics';

/** Một ô trong lưới số liệu đếm được. */
type ShopStat = { key: string; value: string; label: string; icon: IconName };

/**
 * Số ô trên MỘT hàng.
 *
 * Chia hàng bằng tay chứ không thả cho `flexWrap` tự xếp: với `flex: 1`, bề ngang thật của màn
 * quyết định có ba hay hai ô lọt một hàng — và ca ba-ô để lại ô cuối đứng một mình KÉO DÃN hết
 * bề ngang, đọc ra như một khối khác loại. Hai cột thì luôn là 2+1, giống nhau trên mọi máy.
 */
const STATS_PER_ROW = 2;

/**
 * Khối "gian hàng này là ai" — lời giới thiệu, địa chỉ, ba chỉ số uy tín, và lưới số liệu đếm được.
 *
 * ## Con số RỖNG thì BỎ, không hiện 0
 *
 * "0,0 sao" khi chưa có đánh giá là một lời buộc tội dựng từ chỗ trống, nên `ratingCount === 0`
 * bị LOẠI khỏi lưới chứ không in ra số 0.
 *
 * ## Ba chỉ số UY TÍN tách khỏi lưới số liệu
 *
 * Lưới ở đây là những thứ ĐẾM ĐƯỢC không cần diễn giải (bao nhiêu xe, bao nhiêu chuyến). Ba chỉ
 * số của ADR 0045 thì mỗi con số cần một định nghĩa mẫu số đi kèm, và chúng dùng chung một
 * ngưỡng "đủ dữ liệu" — trộn vào cùng lưới sẽ có ô biến mất ô còn, trông như lỗi hiển thị.
 * `HostMetrics` vì thế là khối riêng, dùng chung với trang chi tiết xe và khớp bản web.
 *
 * Thẻ vì thế LUÔN được dựng: `HostMetrics` luôn có điều để nói — ít nhất là "chưa đủ dữ liệu,
 * mới có N yêu cầu". Một gian hàng chưa viết giới thiệu vẫn là một gian hàng khách cần đọc được
 * ba chỉ số.
 *
 * ## Thu gọn được phần CHỮ, nhưng bằng chứng thì không
 *
 * Lời giới thiệu do chủ xe tự viết nên dài ngắn tuỳ người — có gian hàng viết ba dòng, có gian
 * hàng viết cả trang, và trang dài đó đẩy danh sách xe (thứ khách vào đây để xem) xuống dưới
 * tầm mắt. Nên phần CHỮ gập được.
 *
 * Ba chỉ số và lưới số liệu thì ở lại kể cả khi gập: chúng là bằng chứng, cao cố định, và giấu
 * chúng sau một cú chạm là giấu chính thứ thuyết phục người đọc. `BlockTitle` không tự ẩn gì —
 * docblock của nó nói rõ nội dung do nơi gọi quyết định, và đây là chỗ quyết định đó có nghĩa.
 */
export function ShopAbout({ shop }: { shop: PublicShop }) {
  const t = useTranslations('Shops');
  const fmt = useAppFormat();
  const [collapsed, setCollapsed] = useState(false);

  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;
  const rating = Number(shop.ratingAvg);

  const stats: ShopStat[] = [
    {
      key: 'vehicles',
      value: fmt.count(shop.vehicleCount),
      label: t('stats.vehicles'),
      icon: 'car-outline',
    },
    {
      key: 'completedTrips',
      value: fmt.count(shop.completedTripCount),
      label: t('stats.completedTrips'),
      icon: 'checkmark-done-outline',
    },
    (shop.ratingCount ?? 0) > 0 && Number.isFinite(rating)
      ? {
          key: 'rating',
          value: fmt.rating(rating),
          label: t('stats.rating'),
          icon: 'star-outline',
        }
      : null,
  ].filter((stat): stat is ShopStat => stat !== null);

  const title = t(isShop ? 'about.titleShop' : 'about.titlePersonal');
  const statRows = Array.from({ length: Math.ceil(stats.length / STATS_PER_ROW) }, (_unused, row) =>
    stats.slice(row * STATS_PER_ROW, (row + 1) * STATS_PER_ROW),
  );
  const hasText = Boolean(shop.bio || shop.address);

  return (
    <Card>
      <YStack gap={space.sm}>
        {/*
          Chỉ bắt chạm khi CÓ chữ để gập. Một mũi tên lật trên khối chỉ còn số là một cú chạm
          không làm gì — tệ hơn là nó hứa có nội dung đang bị giấu.
        */}
        <BlockTitle
          {...(hasText ? { collapsed, onToggleCollapsed: () => setCollapsed((v) => !v) } : {})}
        >
          {title}
        </BlockTitle>

        {hasText && !collapsed ? (
          <YStack gap={space.sm}>
            {shop.bio ? (
              <Text col={colors.text} fos={fontSize.bodySm} lineHeight={20}>
                {shop.bio}
              </Text>
            ) : null}
            {shop.address ? (
              /*
                Địa chỉ đi cùng một biểu tượng ghim và nền mờ: nó là DỮ KIỆN, không phải một câu
                nữa trong lời giới thiệu. Không có nền thì hai đoạn chữ xám nối nhau và người đọc
                phải tự tách ra đâu là lời tự giới thiệu, đâu là chỗ gian hàng đứng.
              */
              <XStack
                ai="flex-start"
                gap={space.xs}
                p={space.sm}
                br={radius.md}
                bg={colors.surfaceMuted}
              >
                <Ionicons
                  name="location-outline"
                  size={iconSize.sm}
                  color={colors.primaryActive}
                  accessibilityElementsHidden
                />
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {shop.address}
                </Text>
              </XStack>
            ) : null}
          </YStack>
        ) : null}

        {/* Ngoài vùng gập: ba chỉ số là bằng chứng, không phải lời tự giới thiệu. */}
        <HostMetrics metrics={shop.metrics} />

        {stats.length > 0 ? (
          <YStack gap={space.sm} accessibilityLabel={t('stats.sectionLabel')}>
            {statRows.map((row) => (
              <XStack key={row[0]?.key} gap={space.sm}>
                {row.map((stat) => (
                  <YStack
                    key={stat.key}
                    f={1}
                    gap={2}
                    p={space.sm}
                    br={radius.md}
                    bg={colors.surfaceMuted}
                  >
                    <XStack ai="center" gap={space.xs}>
                      <Ionicons
                        name={stat.icon}
                        size={iconSize.sm}
                        color={colors.primaryActive}
                        accessibilityElementsHidden
                      />
                      <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                        {stat.value}
                      </Text>
                    </XStack>
                    <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
                      {stat.label}
                    </Text>
                  </YStack>
                ))}
                {/*
                  Hàng lẻ: một ô rỗng giữ ô thật ở đúng nửa bề ngang. Thiếu nó thì `f={1}` kéo
                  ô cuối dãn hết hàng và nó trông như một khối khác loại.
                */}
                {row.length < STATS_PER_ROW ? <YStack f={1} /> : null}
              </XStack>
            ))}
          </YStack>
        ) : null}
      </YStack>
    </Card>
  );
}
