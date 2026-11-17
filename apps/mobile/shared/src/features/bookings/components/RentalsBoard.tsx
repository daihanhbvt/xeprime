import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { RENTAL_STAGE_TONE, type RentalStage } from '../rental-stages';
import { RentalCardWidthContext } from './rental-card/RentalCard';
import { layout } from '@/theme/layout';

/** Bề rộng một cột — web "_Kanban Item" rộng ~ 320–360, cột cuộn ngang ở màn ≤1024. */
export const BOARD_COLUMN_WIDTH = 340;

export interface BoardColumn {
  stage: RentalStage;
  count: number | undefined;
  loading: boolean;
  error: boolean;
  items: readonly { key: string; node: ReactNode }[];
  /** Còn thẻ chưa tải — nút "Tải thêm" (web cuộn vô hạn 10 thẻ/trang). */
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

/**
 * Bảng Kanban của "Đơn thuê xe" trên màn RỘNG (iPad) — bản native của `board/RentalsBoard` web
 * (Figma `23895:15181`, sổ cái §3.2c): bốn cột Cần xử lý · Chờ khách thanh toán · Chờ giao xe · Đang
 * thuê, cuộn ngang như web ≤1024px. Mỗi cột tải 10 thẻ/lượt ở SERVER, cùng bộ lọc với dạng List;
 * thẻ là CÙNG thẻ với List (cùng hành động, quyền, tấm thoại) đặt trong cột hẹp.
 *
 * Kéo thả của web chỉ MỞ hộp của bước kế (1→2 duyệt, 3→4 mở trang giao xe) — trên cảm ứng các nút
 * ngay trên thẻ đã làm đúng hai việc đó, nên bảng native không dựng kéo thả.
 */
export function RentalsBoard({ columns }: { columns: readonly BoardColumn[] }) {
  const colors = useColors();
  const t = useTranslations('Bookings.board');
  const tKanban = useTranslations('Bookings.board.kanban');
  const tCommon = useTranslations('Common');
  const toneColor = {
    danger: colors.danger,
    warning: colors.warning,
    info: colors.info,
    success: colors.success,
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      contentContainerStyle={styles.board}
      accessibilityLabel={tKanban('label')}
    >
      {columns.map((column) => (
        <YStack
          key={column.stage}
          w={BOARD_COLUMN_WIDTH}
          br={radius.card}
          bw={1}
          bc={colors.border}
          bg={colors.background}
          ov="hidden"
        >
          <XStack px={layout.padX} py={space.sm} ai="center" gap={space.sm} borderBottomWidth={1} bc={colors.border}>
            <YStack w={3} h={16} br={radius.pill} bg={toneColor[RENTAL_STAGE_TONE[column.stage]]} />
            <Text f={1} col={colors.text} fos={16} lh={24} fow={fontWeight.semibold} numberOfLines={1} accessibilityRole="header">
              {t(`stage.${column.stage}`)}
            </Text>
            {column.count === undefined ? null : (
              <YStack px={space.sm} br={radius.pill} bw={1} bc={colors.border} bg={colors.surface}>
                <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {column.count}
                </Text>
              </YStack>
            )}
          </XStack>
          {/* Cột cao theo nội dung — màn ngoài cuộn dọc, bảng cuộn ngang (không lồng hai vùng cuộn dọc). */}
          <YStack p={space.sm} gap={space.md}>
            <RentalCardWidthContext.Provider value={BOARD_COLUMN_WIDTH}>
              {column.loading ? (
                <>
                  <RecordCardSkeleton />
                  <RecordCardSkeleton />
                </>
              ) : column.error ? (
                <ScreenMessage
                  icon="cloud-offline-outline"
                  title={tKanban('columnError')}
                  description={tCommon('states.errorHint')}
                  actionLabel={tKanban('retry')}
                  onAction={column.onRetry}
                />
              ) : column.items.length === 0 ? (
                <ScreenMessage
                  icon="checkmark-done-outline"
                  title={t(`stageEmpty.${column.stage}.title`)}
                  description={t(`stageEmpty.${column.stage}.body`)}
                />
              ) : (
                <>
                  {column.items.map((item) => (
                    <YStack key={item.key}>{item.node}</YStack>
                  ))}
                  {column.hasMore ? (
                    <Button
                      label={column.loadingMore ? tKanban('loadingMore') : tKanban('loadMore')}
                      variant="neutral"
                      size="md"
                      shape="square"
                      loading={column.loadingMore}
                      onPress={column.onLoadMore}
                    />
                  ) : null}
                </>
              )}
            </RentalCardWidthContext.Provider>
          </YStack>
        </YStack>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  board: { gap: space.md, paddingHorizontal: layout.padX, paddingBottom: space.lg, alignItems: 'flex-start' },
});
