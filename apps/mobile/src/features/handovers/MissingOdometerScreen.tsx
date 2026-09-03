import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { HANDOVER_TYPE, PERMISSION } from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { useMissingOdometerQueue } from './hooks/use-handovers';
import type { MissingOdometerItem } from './api';

const SKELETON_ROWS = 3;

/**
 * Hàng đợi "Thiếu KM trả" toàn gian hàng.
 *
 * Một biên bản TRẢ đã xác nhận mà không có số KM là một lỗ trong hồ sơ xe: mọi phép tính bảo
 * dưỡng theo KM sau đó chạy trên một mốc cũ, và không ai biết nó sai cho tới lần bảo dưỡng lỡ
 * hạn. Màn này là chỗ đi vá chúng.
 *
 * Phân trang ở SERVER — không kéo cả kho về rồi lọc tại chỗ.
 *
 * Bổ sung KM đi qua CHÍNH màn biên bản (đường điều chỉnh có lý do + quyền riêng), không phải một
 * ô nhập nhanh ở đây: sửa một con số có thẩm quyền mà không ai biết vì sao là thứ không được
 * phép tồn tại, và có hai đường ghi cho cùng một giá trị thì đường nào cũng thành đường tắt.
 */
export function MissingOdometerScreen() {
  const t = useTranslations('Bookings.missingKm');
  const router = useRouter();
  const permissions = usePermissions();

  const [page, setPage] = useState(1);
  const query = useMissingOdometerQueue(page);

  const back = useCallback(() => goBackOr(router, ROUTES.manage.more()), [router]);

  if (!permissions.isLoading && !permissions.has(PERMISSION.HANDOVER_VIEW)) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage icon="lock-closed-outline" title={t('title')} />
        </Screen>
      </>
    );
  }

  return (
    <>
      <AppHeader title={t('title')} onBack={back} />
      <Screen edges={['left', 'right', 'bottom']} scroll={false} padded={false}>
        {query.isPending ? (
          <YStack p={layout.screenX} gap={layout.inline}>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <RecordCardSkeleton key={i} />
            ))}
          </YStack>
        ) : query.isError ? (
          <ScreenError
            error={query.error}
            title={t('errorTitle')}
            onRetry={() => void query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <ScreenMessage
            icon="checkmark-circle-outline"
            title={t('empty')}
            description={t('lead')}
          />
        ) : (
          <FlatList
            data={query.data.items}
            keyExtractor={(item) => item.handoverId}
            renderItem={({ item }) => (
              <QueueCard
                item={item}
                onFix={() =>
                  router.push(ROUTES.manage.handover(item.bookingId, HANDOVER_TYPE.RETURN))
                }
              />
            )}
            contentContainerStyle={{ padding: layout.screenX, gap: layout.inline }}
            ListHeaderComponent={
              <Text col={colors.textMuted} fos={fontSize.bodySm} pb={space.xs}>
                {t('lead')}
              </Text>
            }
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching}
                onRefresh={() => void query.refetch()}
                tintColor={colors.primaryActive}
              />
            }
            /*
             * Phân trang bằng NÚT chứ không phải cuộn vô hạn: đây là một hàng việc phải làm cho
             * hết, và người dùng cần biết còn bao nhiêu — cuộn vô hạn giấu mất con số đó.
             */
            ListFooterComponent={
              query.data.meta.hasNext ? (
                <Button
                  label={t('open')}
                  variant="secondary"
                  onPress={() => setPage((p) => p + 1)}
                />
              ) : null
            }
          />
        )}
      </Screen>
    </>
  );
}

function QueueCard({ item, onFix }: { item: MissingOdometerItem; onFix: () => void }) {
  const t = useTranslations('Bookings.missingKm');
  const fmt = useAppFormat();

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.xs}>
          <Ionicons name="warning-outline" size={iconSize.md} color={colors.warning} />
          <Text
            f={1}
            col={colors.text}
            fos={fontSize.body}
            fow={fontWeight.semibold}
            numberOfLines={1}
          >
            {item.vehicleName}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {item.bookingCode}
          </Text>
        </XStack>

        {item.plateNumber ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {item.plateNumber}
          </Text>
        ) : null}

        <DataRow label={t('confirmedAt')} value={fmt.dateTime(item.confirmedAt)} />
        {/*
          `null` = biên bản GIAO cũng chưa có số, tức là không có mốc sàn để đối chiếu — nói rõ
          thay vì hiện 0 km, vì 0 ở đây là một số đo bịa.
        */}
        <DataRow
          label={t('pickupKm')}
          value={item.pickupOdometerKm == null ? '—' : fmt.km(item.pickupOdometerKm)}
          tone={item.pickupOdometerKm == null ? 'muted' : 'default'}
        />

        <Button label={t('fix')} variant="secondary" icon="create-outline" onPress={onFix} />
      </YStack>
    </Card>
  );
}
