import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  DRIVER_ASSIGNMENT_STATUS_META,
  isDriverReassignable,
  PERMISSION,
  SERVICE_TYPE,
  VN_PHONE_PATTERN,
} from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { MoneyField } from '@/components/ui/MoneyField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { useAssignDriver, useAssignableDrivers, useUpdateBooking } from '../hooks/use-bookings';
import type { BookingDetail, UpdateBookingInput } from '../api';
import { AssignDriverSheet } from './AssignDriverSheet';

const NOTE_MAX = 2000;

/** Suy từ CHÍNH schema — xem ghi chú ở `CreateBookingScreen`. */
type EditFormValues = yup.InferType<ReturnType<typeof buildEditSchema>>;

function buildEditSchema(labels: { name: string; phone: string }) {
  return yup.object({
    customerName: yup.string().trim().required(labels.name).max(255),
    customerPhone: yup
      .string()
      .trim()
      .default('')
      .matches(VN_PHONE_PATTERN, { message: labels.phone, excludeEmptyString: true }),
    depositAmount: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
      .integer()
      .min(0)
      .nullable()
      .default(null),
    note: yup.string().trim().max(NOTE_MAX).default(''),
  });
}

/**
 * Sửa một đơn đã tạo — bản native của `BookingFormDialog` (web).
 *
 * Chỉ còn BỐN trường (quyết định sản phẩm 19/10/2026): tên khách, SĐT, tiền cọc, ghi chú. Loại
 * dịch vụ, thời gian, lộ trình và giá đóng băng lúc tạo — server từ chối trường khác
 * (`forbidNonWhitelisted`). Phần đã chốt hiện chỉ-đọc trong thẻ đầu để người sửa biết vì sao.
 * Phí giao nhận vẫn có lối riêng (`DeliveryFeeSheet`, kèm lý do vào nhật ký).
 *
 * Đơn `with_driver` kèm hàng "Tài xế" (ADR 0063): chọn ở `AssignDriverSheet` (giữ lựa chọn TẠM,
 * chưa gửi), lưu = PATCH bốn trường rồi NẾU lựa chọn đổi thì `PATCH /bookings/:id/driver`. Lượt
 * gán hỏng không làm mất phần đã lưu — tấm ở lại để chọn người khác, lần bấm sau chỉ thử lại
 * phần tài xế.
 */
export function EditBookingSheet({
  booking,
  onClose,
}: {
  booking: BookingDetail;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.edit');
  const permissions = usePermissions();
  const tCreate = useTranslations('Bookings.create');
  const tDriver = useTranslations('Bookings.driver');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const update = useUpdateBooking(booking.id);
  const assign = useAssignDriver(booking.id);

  const withDriver = booking.serviceType === SERVICE_TYPE.WITH_DRIVER;
  // Bộ chọn tài xế chỉ có khi đơn CHƯA giao xe — sau bàn giao tài xế đã chốt (DRIVER_ASSIGNMENT_LOCKED).
  const driverEditable =
    withDriver && isDriverReassignable(booking.status) && permissions.has(PERMISSION.DRIVER_VIEW);
  const currentDriverId = booking.driver?.id ?? null;
  const [driverId, setDriverId] = useState<string | null>(currentDriverId);
  const [picking, setPicking] = useState(false);
  const [detailsSaved, setDetailsSaved] = useState(false);

  // Cùng khoá với `AssignDriverSheet` — đọc tên người vừa chọn mà không hỏi thêm lần nào.
  const drivers = useAssignableDrivers(
    { pickupAt: booking.pickupAt, returnAt: booking.returnAt, excludeBookingId: booking.id },
    driverEditable,
  );

  const schema = useMemo(
    () => buildEditSchema({ name: t('nameRequired'), phone: t('phoneInvalid') }),
    [t],
  );

  const { control, handleSubmit } = useForm<EditFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      customerName: booking.customerName,
      customerPhone: booking.customerPhone ?? '',
      depositAmount:
        booking.depositAmount === null || booking.depositAmount === undefined
          ? null
          : Number(booking.depositAmount),
      note: booking.note ?? '',
    },
  });

  const driverChanged = driverEditable && driverId !== currentDriverId;
  const pending = update.isPending || assign.isPending;

  const submit = handleSubmit(async (values) => {
    if (!detailsSaved) {
      const body: UpdateBookingInput = {
        customerName: values.customerName,
        ...(values.customerPhone ? { customerPhone: values.customerPhone } : {}),
        // Để trống = không đổi (PATCH chỉ đổi trường có mặt); "0" mới là bỏ cọc.
        ...(values.depositAmount == null ? {} : { depositAmount: String(values.depositAmount) }),
        note: values.note,
      };
      try {
        await update.mutateAsync(body);
      } catch (error) {
        toast.showError(errorMessage(error));
        return;
      }
      setDetailsSaved(true);
    }
    if (driverChanged) {
      try {
        await assign.mutateAsync(driverId);
      } catch (error) {
        toast.showError(t('driverFailed', { error: errorMessage(error) }));
        return;
      }
    }
    toast.showSuccess(t('success'));
    onClose();
  });

  /** Tên của người đang chọn: người đang gán, hoặc người vừa chọn trong danh sách khả dụng. */
  const selectedName =
    driverId === null
      ? null
      : driverId === booking.driver?.id
        ? booking.driver.name
        : (drivers.data?.find((d) => d.id === driverId)?.name ?? null);
  const showsCurrentStatus = booking.driver && driverId === booking.driver.id;

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t('title')}
        subtitle={booking.code}
        footer={<Button label={t('save')} loading={pending} onPress={() => void submit()} />}
      >
        {/* Phần đã chốt — đọc, không sửa; nói rõ vì sao ngay tại chỗ. */}
        <Card tone="muted" lift="flat">
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {booking.vehicleName}
              {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {domainLabel('serviceType', booking.serviceType)}
              {withDriver && booking.routeType
                ? ` · ${domainLabel('routeType', booking.routeType)}`
                : ''}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
            </Text>
            <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
              {fmt.money(booking.totalAmount)}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('frozenNote')}
            </Text>
          </YStack>
        </Card>

        <TextField
          control={control}
          name="customerName"
          label={tCreate('customer.nameLabel')}
          placeholder={tCreate('customer.namePlaceholder')}
          required
        />
        <TextField
          control={control}
          name="customerPhone"
          label={tCreate('customer.phoneLabel')}
          placeholder={tCreate('customer.phonePlaceholder')}
          keyboardType="phone-pad"
        />
        <MoneyField
          control={control}
          name="depositAmount"
          label={tCreate('price.depositAmount')}
          hint={tCreate('price.depositHint')}
        />

        {driverEditable ? (
          <Card onPress={() => setPicking(true)} accessibilityLabel={t('driverLabel')}>
            <YStack gap={space.xs}>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('driverLabel')}
              </Text>
              <XStack ai="center" gap={space.sm}>
                <Ionicons
                  name="person-circle-outline"
                  size={iconSize.lg}
                  color={colors.textMuted}
                />
                {driverId === null ? (
                  <Text f={1} col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {tDriver('none')}
                  </Text>
                ) : (
                  <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {selectedName ?? '…'}
                  </Text>
                )}
                {showsCurrentStatus && booking.driver ? (
                  <StatusBadge
                    label={domainLabel(
                      'driverAssignmentStatus',
                      booking.driver.assignmentStatus,
                      DRIVER_ASSIGNMENT_STATUS_META[booking.driver.assignmentStatus].label,
                    )}
                    color={DRIVER_ASSIGNMENT_STATUS_META[booking.driver.assignmentStatus].color}
                    size="sm"
                  />
                ) : null}
                {driverId !== null ? (
                  <IconButton
                    icon="person-remove-outline"
                    label={t('driverNone')}
                    tone="dangerSurface"
                    onPress={() => setDriverId(null)}
                  />
                ) : null}
              </XStack>
              {driverChanged && driverId !== null ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('driverPendingNote')}
                </Text>
              ) : null}
            </YStack>
          </Card>
        ) : null}

        <TextField
          control={control}
          name="note"
          label={tCreate('customer.noteLabel')}
          placeholder={tCreate('customer.notePlaceholder')}
          multiline
          rows={3}
          maxLength={NOTE_MAX}
        />
      </BottomSheet>

      {driverEditable ? (
        <AssignDriverSheet
          open={picking}
          onClose={() => setPicking(false)}
          booking={booking}
          selectedId={driverId}
          onSelect={(id) => {
            setDriverId(id);
            setPicking(false);
          }}
        />
      ) : null}
    </>
  );
}
