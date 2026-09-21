import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STOREFRONT_KIND } from '@xeprime/types';
import { VerifiedName } from '@/components/ui/VerifiedName';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { ShopChatButton } from '@/features/chat/components/ShopChatButton';
import { useShopChatAvailable } from '@/features/chat/hooks/use-shop-chat-available';
import { ShopCover, ShopLogo, SHOP_LOGO } from '@/components/ui/ShopCover';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { PublicShop } from '../api';

/**
 * Đầu trang gian hàng công khai (MKT-05) — bản native của
 * `apps/web/src/features/marketplace/components/ShopHeader.tsx`.
 *
 * Cùng dữ liệu, cùng thứ tự: bìa → logo → tên → tỉnh · điểm đánh giá → gọi → giới thiệu → địa
 * chỉ. Chỉ dữ liệu CÔNG KHAI, không có gì phải đăng nhập mới xem được.
 *
 * Khác web ở nút gọi: web là `<a href="tel:">` nằm cùng hàng với tên; native đưa xuống thành
 * một nút đủ 44dp vì đây là hành động chính của trang này trên điện thoại — khách xem gian hàng
 * thường là để hỏi trước khi đặt.
 *
 * Bìa và logo lấy từ `ShopCover`/`ShopLogo` — CÙNG hiện thực với `ShopIdentityCard` bên khu
 * quản lý, vì khối đó là bản xem trước của chính màn này.
 */
export function ShopHeader({ shop }: { shop: PublicShop }) {
  const t = useTranslations('Shops.header');
  const fmt = useAppFormat();

  const rating = Number(shop.ratingAvg);
  const hasRating = (shop.ratingCount ?? 0) > 0 && Number.isFinite(rating);
  /* Hỏi ở đây để bỏ luôn hàng chứa nút: một `XStack` rỗng vẫn ăn trọn một nhịp `gap` của cột. */
  const canChat = useShopChatAvailable(shop.slug, shop.chatOpen);

  /*
   * HAI MẶT TIỀN, hai cách vẽ (ADR 0028).
   *
   * `shop` là doanh nghiệp: có ảnh bìa, có dải thông tin nổi bật. `personal` là một CON
   * NGƯỜI cho thuê vài chiếc xe — dựng cho họ một mặt tiền doanh nghiệp là hứa một quy mô
   * không có thật, và một dải bìa trống thì càng nói rõ điều đó.
   */
  const isShop = shop.storefrontKind === STOREFRONT_KIND.SHOP;

  return (
    <YStack>
      {isShop ? <ShopCover url={shop.coverUrl} /> : null}

      <YStack px={layout.screenX} gap={space.sm} mt={isShop ? -SHOP_LOGO / 2 : space.md}>
        <ShopLogo url={shop.logoUrl} name={shop.name} />

        <YStack gap={space.xs}>
          {/*
            Dấu xác minh CÓ ĐIỀU KIỆN: nó nói gian hàng đã qua duyệt hồ sơ VÀ đang trả tiền thuê
            bao. Gắn cho mọi gian hàng là làm dấu mất hết nghĩa (ADR 0028).

            Dấu ở đây KHÔNG `decorative`: khối logo phía trên là ảnh bìa + logo vuông, không phải
            avatar tròn có dấu, nên đây là nơi DUY NHẤT câu ấy được nói ra.
          */}
          <VerifiedName
            name={shop.name}
            verifiedLabel={shop.verified ? t('verified') : undefined}
            size={fontSize.h3}
            weight={fontWeight.bold}
            markSize={20}
            numberOfLines={2}
          />

          {/* "Tham gia từ" / "Đối tác từ" — hai vế khác nhau, đúng như hai mặt tiền. */}
          <Text col={colors.placeholder} fos={fontSize.label}>
            {t(isShop ? 'joinedShop' : 'joinedPersonal', {
              date: fmt.date(shop.joinedAt),
            })}
          </Text>

          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            {/*
              Gian hàng phục vụ nhiều tỉnh thì NÓI ĐỦ: `provinceName` là tỉnh ĐẶT trụ sở, và
              một khách ở Đà Nẵng bỏ qua gian hàng Hà Nội có giao xe tới nơi là mất một
              chuyến vì thiếu một dòng chữ.
            */}
            {shop.serviceProvinceNames.length > 0 ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="location-outline" size={iconSize.xs} color={colors.textMuted} />
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {shop.serviceProvinceNames.join(LIST_SEPARATOR)}
                </Text>
              </XStack>
            ) : shop.provinceName ? (
              <XStack ai="center" gap={space.xs}>
                <Ionicons name="location-outline" size={iconSize.xs} color={colors.textMuted} />
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {shop.provinceName}
                </Text>
              </XStack>
            ) : null}

            <XStack ai="center" gap={space.xs}>
              <Ionicons name="star" size={iconSize.xs} color={colors.primary} />
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {hasRating
                  ? t('rating', { avg: fmt.rating(rating), count: shop.ratingCount })
                  : t('noRating')}
              </Text>
            </XStack>
          </XStack>
        </YStack>

        {/*
          Liên hệ đi qua HỘP THƯ, không qua số điện thoại (ADR 0038).

          `PublicShopDto` đã bỏ `phone`: trả nó ra là đăng số riêng của chủ xe lên một trang không
          cần đăng nhập, nơi mọi trình thu thập đều đọc được. Số vẫn tới tay khách — ở bước bàn
          giao, sau khi đã có một chuyến thật.
        */}
        {canChat ? (
          <XStack>
            <ShopChatButton
              shopSlug={shop.slug}
              publicChatOpen={shop.chatOpen}
              label={t('message')}
              size="sm"
            />
          </XStack>
        ) : null}

        {/*
          Giới thiệu và địa chỉ đã chuyển sang ShopAbout, nơi chúng đứng cạnh bốn con số của
          gian hàng. Đầu trang giữ đúng phần NHẬN DẠNG — tên, dấu xác minh, vùng phục vụ, điểm
          đánh giá, nút liên hệ — để phần cuộn đầu tiên trả lời "đây là ai", không phải "đây kể
          gì về mình".
        */}
      </YStack>
    </YStack>
  );
}
