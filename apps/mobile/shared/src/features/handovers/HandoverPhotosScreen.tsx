import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HANDOVER_TYPE, type HandoverType } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, iconSize, radius, space } from '@/theme/tokens';
import { HandoverPhotoGrid } from './components/HandoverPhotoGrid';
import { useHandoverContext } from './hooks/use-handovers';
import type { Handover } from './api';

/**
 * Bổ sung ẢNH cho biên bản bàn giao ĐÃ LẬP — bản native của `HandoverSupplementDialog`.
 *
 * Vì sao cần: luồng nhanh cố tình cho xác nhận trong một cú bấm, nên quên đính ảnh là chuyện
 * thường ngày chứ không phải ngoại lệ. Không có bề mặt này thì bằng chứng KHÔNG BAO GIỜ vào được
 * hệ thống — người vận hành chụp ảnh trong điện thoại rồi để đó.
 *
 * Ranh giới cố ý HẸP: **chỉ ảnh**. Số KM sau khi xác nhận đi đường điều chỉnh riêng (có lý do +
 * quyền `vehicles.odometer.correct` + nhật ký), còn giờ giấc và trạng thái thì bất biến — mở
 * chúng ra ở đây là biến biên bản đã ký thành một biểu mẫu sửa được.
 *
 * Ảnh thêm SAU khi xác nhận được đánh dấu rõ: một tấm chụp ba ngày sau không được đọc như bằng
 * chứng hiện trạng lúc bàn giao.
 */
export function HandoverPhotosScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings.handover.supplement');
  const router = useRouter();
  const query = useHandoverContext(bookingId);

  const back = () => goBackOr(router, ROUTES.manage.bookingDetail(bookingId));
  const refreshing = query.isRefetching;
  const onRefresh = () => void query.refetch();

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
          <YStack gap={layout.section}>
            <SkeletonText lines={2} />
            <Skeleton height={200} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={query.error} onRetry={() => void query.refetch()} />
        </Screen>
      </>
    );
  }

  /** Chỉ những chiều ĐÃ có biên bản — chưa giao xe thì không có gì để bổ sung. */
  const available = (
    [
      { type: HANDOVER_TYPE.PICKUP, handover: query.data.pickup },
      { type: HANDOVER_TYPE.RETURN, handover: query.data.return },
    ] as const
  ).filter((entry): entry is { type: HandoverType; handover: Handover } => Boolean(entry.handover));

  if (available.length === 0) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="images-outline"
            title={t('emptyTitle')}
            description={t('emptyBody')}
          />
        </Screen>
      </>
    );
  }

  return (
    <SupplementBody
      bookingId={bookingId}
      available={available}
      title={t('title')}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={back}
    />
  );
}

function SupplementBody({
  bookingId,
  available,
  title,
  refreshing,
  onRefresh,
  onBack,
}: {
  bookingId: string;
  available: readonly { type: HandoverType; handover: Handover }[];
  title: string;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Bookings.handover.supplement');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const [active, setActive] = useState<HandoverType>(available[0]?.type ?? HANDOVER_TYPE.PICKUP);
  const current = available.find((entry) => entry.type === active) ?? available[0];

  if (!current) return null;

  return (
    <>
      <AppHeader title={title} onBack={onBack} />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          {/* Hai chiều có ảnh RIÊNG — gộp chung một lưới là trộn hiện trạng đầu và cuối chuyến. */}
          {available.length > 1 ? (
            <XStack gap={space.xs}>
              {available.map((entry) => (
                <Chip
                  key={entry.type}
                  label={domainLabel('handoverType', entry.type)}
                  selected={entry.type === active}
                  size="sm"
                  grow
                  onPress={() => setActive(entry.type)}
                />
              ))}
            </XStack>
          ) : null}

          {current.handover.confirmedAt ? (
            <XStack
              ai="flex-start"
              gap={space.sm}
              bg={colors.warningSurface}
              p={space.md}
              br={radius.md}
            >
              <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.warning} />
              <YStack f={1} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {t('confirmedTitle', { time: fmt.dateTime(current.handover.confirmedAt) })}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('confirmedBody')}
                </Text>
              </YStack>
            </XStack>
          ) : null}

          <Card>
            <HandoverPhotoGrid
              bookingId={bookingId}
              type={current.type}
              handover={current.handover}
            />
          </Card>
        </YStack>
      </Screen>
    </>
  );
}
