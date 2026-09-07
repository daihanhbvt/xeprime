import { useEffect, useRef } from 'react';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, HANDOVER_TYPE } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SkeletonText } from '@/components/ui/Skeleton';
import { getErrorCode } from '@/lib/api-client';
import { space } from '@/theme/tokens';
import { useHandoverContext } from '../hooks/use-handovers';
import { ResolveOdometerSheet } from './ResolveOdometerSheet';
import type { MissingOdometerItem } from '../api';

/**
 * Mở tấm bổ sung KM cho MỘT việc trong hàng đợi — bản native của `ResolveQueueItem` bên web.
 *
 * Dòng ở hàng đợi chỉ mang bản tóm tắt, còn form cần cả biên bản (số KM, `rowVersion`, mốc giao),
 * nên khi mở mới tải ngữ cảnh bàn giao của đúng đơn đó rồi dùng LẠI `ResolveOdometerSheet` của
 * màn biên bản. Một form sửa KM, hai nơi gọi: vẫn đúng một đường ghi có mã lý do + diễn giải bắt
 * buộc vào `audit_logs`, và luật giảm KM (`vehicles.odometer.decrease`) chỉ sống ở một chỗ.
 */
export function ResolveQueueSheet({
  item,
  onClose,
  onResolved,
}: {
  item: MissingOdometerItem;
  onClose: () => void;
  /** Việc đã xong ở nơi khác — hàng đợi cần tải lại để dòng đó biến mất. */
  onResolved?: () => void;
}) {
  const t = useTranslations('Bookings.missingKm');
  const tActions = useTranslations('Common.actions');
  const { data, isLoading, isError, error, refetch } = useHandoverContext(item.bookingId);
  const handover = data?.return ?? null;

  /*
   * Việc đã được người khác xử lý xong (hoặc biên bản không còn) — CHỈ khi server trả lời thành
   * công mà không còn gì phải làm. Lỗi mạng/500 KHÔNG rơi vào nhánh này, nếu không một lần rớt
   * mạng sẽ bị tính là "đã xử lý xong" và việc biến khỏi hàng đợi dù KM vẫn thiếu.
   */
  const resolvedElsewhere = !isLoading && !isError && (!data || !handover?.odometerMissing);

  // Chốt "đã báo rồi" bằng ref: cha truyền callback dạng arrow nên identity đổi mỗi lần render;
  // không có chốt này thì effect chạy lại liên tục và thành vòng làm mới vô hạn.
  const notified = useRef(false);
  useEffect(() => {
    if (!resolvedElsewhere || notified.current) return;
    notified.current = true;
    onClose();
    onResolved?.();
  }, [resolvedElsewhere, onClose, onResolved]);

  if (isError) {
    // Thiếu quyền là câu trả lời cuối cùng, không phải sự cố tạm — không mời thử lại.
    const code = getErrorCode(error);
    const forbidden =
      code === API_ERROR_CODE.FORBIDDEN || code === API_ERROR_CODE.MISSING_PERMISSION;
    return (
      <BottomSheet open onClose={onClose} title={t('fix')}>
        <YStack gap={space.sm}>
          <Callout
            tone={forbidden ? 'warning' : 'danger'}
            title={forbidden ? t('resolveForbiddenTitle') : t('resolveErrorTitle')}
          >
            {forbidden ? t('resolveForbiddenBody') : t('resolveErrorBody')}
          </Callout>
          {/* Lỗi mạng/máy chủ: GIỮ nguyên bề mặt và cho thử lại — không âm thầm coi việc là xong. */}
          {forbidden ? null : (
            <Button
              label={tActions('retry')}
              variant="secondary"
              icon="refresh-outline"
              onPress={() => void refetch()}
            />
          )}
        </YStack>
      </BottomSheet>
    );
  }

  if (isLoading) {
    return (
      <BottomSheet open onClose={onClose} title={t('fix')}>
        <SkeletonText lines={4} />
      </BottomSheet>
    );
  }

  if (resolvedElsewhere || !data || !handover) return null;

  return (
    <ResolveOdometerSheet
      bookingId={item.bookingId}
      type={HANDOVER_TYPE.RETURN}
      context={data}
      handover={handover}
      onClose={onClose}
    />
  );
}
