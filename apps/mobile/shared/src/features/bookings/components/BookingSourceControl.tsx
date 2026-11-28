import { memo, useEffect, useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { BOOKING_SOURCE_LABEL_MAX, PERMISSION, isMarketplaceBooking } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BookingSourceChip } from '@/components/ui/BookingSourceChip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { SheetConfirmFooter } from '@/components/ui/SheetConfirmFooter';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize, space } from '@/theme/tokens';
import { useUpdateBookingSource } from '../hooks/use-bookings';
import { bookingSourcePayload, bookingSourceShape } from '../source-schema';
import { BookingSourceFields } from './BookingSourceFields';

interface SourceBooking {
  id: string;
  code: string;
  source: string;
  sourceLabel?: string | null;
}

/**
 * Nguồn đơn ở ĐẦU chi tiết đơn (ADR 0110) — native port of web `BookingSourceControl`: viên nguồn đứng
 * cạnh nhãn chặng, kèm nút bút đổi nguồn (quyền `bookings.update`). Đơn qua sàn: nguồn mặc định, không
 * nhãn và không đổi được - không vẽ gì.
 */
export const BookingSourceControl = memo(function BookingSourceControl({
  booking,
}: {
  booking: SourceBooking;
}) {
  const t = useTranslations('Bookings.source');
  const colors = useColors();
  const { has } = usePermissions();
  const [open, setOpen] = useState(false);
  if (isMarketplaceBooking(booking.source)) return null;
  const canEdit = has(PERMISSION.BOOKING_UPDATE);

  return (
    <XStack ai="center" gap={space.xs} flexShrink={1} minWidth={0}>
      <BookingSourceChip source={booking.source} sourceLabel={booking.sourceLabel ?? null} />
      {canEdit ? (
        <>
          <IconSquareButton label={t('edit.action')} size="sm" onPress={() => setOpen(true)}>
            <LineIcon name="edit" size={iconSize.sm} color={colors.textMuted} />
          </IconSquareButton>
          <BookingSourceSheet booking={booking} open={open} onClose={() => setOpen(false)} />
        </>
      ) : null}
    </XStack>
  );
});

/**
 * Tấm "Đổi nguồn đơn" — native port of web `BookingSourceDialog`. Nguồn chỉ là nhãn thống kê: không
 * chạm tiền, lịch hay trạng thái. Server ghi audit; đơn qua sàn bị từ chối (`BOOKING_SOURCE_LOCKED`).
 */
function BookingSourceSheet({
  booking,
  open,
  onClose,
}: {
  booking: SourceBooking;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.source');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateBookingSource(booking.id);

  const schema = useMemo(
    () =>
      yup.object(
        bookingSourceShape({
          required: t('validation.required'),
          nameRequired: t('validation.nameRequired'),
          nameMax: t('validation.nameMax', { max: BOOKING_SOURCE_LABEL_MAX }),
        }),
      ),
    [t],
  );
  type Values = yup.InferType<typeof schema>;

  const { control, handleSubmit, reset } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: { source: booking.source, sourceLabel: booking.sourceLabel ?? '' },
  });

  // Mở lại với nguồn vừa đổi → nạp lại giá trị đang lưu, không giữ lựa chọn của lần trước.
  useEffect(() => {
    if (open) reset({ source: booking.source, sourceLabel: booking.sourceLabel ?? '' });
  }, [open, booking.source, booking.sourceLabel, reset]);

  const submit = handleSubmit((values) => {
    if (update.isPending) return;
    update.mutate(bookingSourcePayload(values), {
      onSuccess: () => {
        toast.showSuccess(t('edit.success'));
        onClose();
      },
      onError: (err) => toast.showError(errorMessage(err)),
    });
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('edit.title', { code: booking.code })}
      chrome="v2"
      headerDivider
      footer={
        <SheetConfirmFooter
          backLabel={tCommon('cancel')}
          onBack={onClose}
          confirmLabel={t('edit.save')}
          tone="primary"
          loading={update.isPending}
          onConfirm={() => void submit()}
        />
      }
    >
      <FieldAppearanceProvider value="v2">
        <YStack gap={space.md}>
          <BookingSourceFields control={control} sourceName="source" labelName="sourceLabel" />
        </YStack>
      </FieldAppearanceProvider>
    </BottomSheet>
  );
}
