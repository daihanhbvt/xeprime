import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STALE_TIME } from '@xeprime/api-client';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { queryKeys } from '@/queries/query-keys';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { marketplaceApi, type ShopReviewItem } from '../api';

/** Web lấy 6 — vừa một màn cuộn, đủ để đọc được giọng của gian hàng mà không thành một trang riêng. */
const SHOP_REVIEW_LIMIT = 6;

/** Ảnh đại diện của người đánh giá — đủ to để chữ cái đầu đọc được, không lấn phần chữ. */
const REVIEWER_AVATAR = 36;

/** Thang điểm — số sao vẽ ra ở mỗi hàng. */
const MAX_STARS = 5;

/**
 * Đánh giá của CẢ gian hàng.
 *
 * Khác khối đánh giá trên trang một chiếc xe: khách chọn gian hàng trước rồi mới chọn xe, nên câu
 * hỏi "chỗ này làm ăn thế nào" phải trả lời được ở tầng gian hàng.
 *
 * Mỗi thẻ dẫn về ĐÚNG chiếc xe được đánh giá — một lời khen về chiếc Vios không nói gì về chiếc
 * Fortuner, và người đọc đang tìm xe chứ không đọc hồi ký gian hàng.
 *
 * Lỗi tải thì DẤU KHỐI đi, không dựng thẻ lỗi: đánh giá là thông tin phụ trợ, một dải đỏ ở đây
 * làm hỏng cả trang vì một thứ không ai đang chờ.
 */
export function ShopReviews({ slug }: { slug: string }) {
  const t = useTranslations('Shops.reviews');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  /*
   * Mở sẵn, không gập sẵn: đánh giá là BẰNG CHỨNG XÃ HỘI — giấu nó sau một cú chạm là bỏ phí
   * đúng thứ khách vào trang gian hàng để đọc. Nút gập ở đây phục vụ chiều ngược lại: sáu
   * đánh giá dài đẩy danh sách xe xuống quá xa, và người đã đọc xong cần một đường dọn chúng
   * đi để đi tiếp.
   */
  const [collapsed, setCollapsed] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.marketplace.shopReviews(slug, SHOP_REVIEW_LIMIT),
    queryFn: () => marketplaceApi.shopReviews(slug, SHOP_REVIEW_LIMIT),
    staleTime: STALE_TIME.REFERENCE,
  });

  if (query.isPending) {
    return (
      <Card>
        <MiniRowsSkeleton rows={3} />
      </Card>
    );
  }

  if (query.isError || !query.data) return null;

  const { summary } = query.data;
  /*
   * `?? []`: cùng lý do với `summary?` ngay dưới. Một phản hồi thiếu `data` vẫn là `query.data`
   * hợp lệ với TanStack Query, và `data.length` khi đó làm VỠ CẢ TRANG gian hàng vì một khối
   * phụ trợ — đúng thứ docblock ở trên nói là không được để xảy ra.
   */
  const data = query.data.data ?? [];
  // `summary?.ratingCount`: phản hồi thiếu `summary` (dữ liệu cũ chưa qua đợt tính rating) vẫn
  // là một `query.data` hợp lệ — đọc thẳng `summary.ratingCount` lúc đó ném lỗi undefined.
  const title =
    (summary?.ratingCount ?? 0) > 0
      ? t('titleWithCount', { count: summary.ratingCount })
      : t('title');

  return (
    <Card>
      <YStack gap={space.sm} accessibilityLabel={t('sectionLabel')}>
        <BlockTitle collapsed={collapsed} onToggleCollapsed={() => setCollapsed((v) => !v)}>
          {title}
        </BlockTitle>

        {collapsed ? null : data.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          data.map((review, index) => (
            <ReviewRow
              key={review.id}
              review={review}
              vehicleLabel={t('vehicle', { name: review.vehicleName })}
              date={fmt.date(review.createdAt)}
              /* Vạch giữa các hàng, KHÔNG dưới hàng cuối — một vạch treo lơ lửng ở đáy đọc
                 ra như danh sách bị cắt giữa chừng. */
              divided={index > 0}
              onPress={() => navigateOnce(ROUTES.explore.listingDetail(review.vehicleId))}
            />
          ))
        )}
      </YStack>
    </Card>
  );
}

function ReviewRow({
  review,
  vehicleLabel,
  date,
  divided,
  onPress,
}: {
  review: ShopReviewItem;
  vehicleLabel: string;
  date: string;
  divided: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={vehicleLabel} onPress={onPress}>
      <XStack
        gap={space.sm}
        pt={divided ? space.sm : 0}
        {...(divided ? { borderTopWidth: 1, borderTopColor: colors.borderSubtle } : {})}
      >
        {/*
          Ảnh đại diện chữ cái đầu: sáu đánh giá xếp dọc không có gì phân cách về THỊ GIÁC thì
          đọc ra như một đoạn văn dài, và mắt không tìm được chỗ một nhận xét bắt đầu. Cột ảnh
          bên trái làm đúng việc đó mà không cần thêm một đường kẻ nào nữa.

          `PublicShopDto` không trả ảnh thật của khách — và cũng không nên: đây là trang công
          khai. Chữ cái đầu là tất cả những gì được phép hiện.
        */}
        <Avatar name={review.customerName} size={REVIEWER_AVATAR} />

        <YStack f={1} minWidth={0} gap={space.xs}>
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              col={colors.text}
              fos={fontSize.bodySm}
              fow={fontWeight.semibold}
              numberOfLines={1}
            >
              {review.customerName}
            </Text>
            <Stars rating={review.rating} />
          </XStack>

          {review.comment ? (
            <Text col={colors.text} fos={fontSize.bodySm} lineHeight={20} numberOfLines={3}>
              {review.comment}
            </Text>
          ) : null}

          {/*
            Tên xe thành một VIÊN NHÃN, ngày đứng riêng bên phải.

            Trước đây cả hai là chữ xám cùng cỡ nằm hai đầu một hàng, nên chúng đọc ra như một
            câu bị ngắt làm đôi. Chiếc xe là thứ có thể CHẠM tới (cả hàng dẫn sang trang xe đó),
            còn ngày thì không — hai vai khác nhau phải trông khác nhau.
          */}
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <XStack
              ai="center"
              gap={4}
              px={space.xs}
              py={2}
              br={radius.sm}
              bg={colors.surfaceMuted}
              flexShrink={1}
            >
              <Ionicons
                name="car-outline"
                size={iconSize.xs}
                color={colors.textMuted}
                accessibilityElementsHidden
              />
              <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                {review.vehicleName}
              </Text>
            </XStack>
            <Text col={colors.placeholder} fos={fontSize.label}>
              {date}
            </Text>
          </XStack>
        </YStack>
      </XStack>
    </Pressable>
  );
}

/**
 * Năm ngôi sao, tô đầy tới mức điểm.
 *
 * Một ngôi sao kèm con số ("★ 5") bắt người đọc tự nhớ thang điểm là mấy; năm ngôi sao nói ra
 * thang ấy bằng chính hình vẽ, và so hai hàng với nhau chỉ mất một cái liếc.
 *
 * Nhãn cho trình đọc màn hình vẫn là con số — năm hình vẽ giống nhau là năm lần lặp vô nghĩa.
 */
function Stars({ rating }: { rating: number }) {
  const t = useTranslations('Shops.reviews');
  return (
    <XStack ai="center" gap={1} accessibilityLabel={t('ratingValue', { rating })}>
      {Array.from({ length: MAX_STARS }, (_unused, index) => (
        <Ionicons
          key={index}
          name={index < Math.round(rating) ? 'star' : 'star-outline'}
          size={iconSize.xs}
          color={index < Math.round(rating) ? colors.primary : colors.borderInput}
          accessibilityElementsHidden
        />
      ))}
    </XStack>
  );
}
