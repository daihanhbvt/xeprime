import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  ROUTE_TYPE,
  ROUTE_TYPE_VALUES,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  VN_PHONE_PATTERN,
} from '@xeprime/types';
import { dayjs, type Dayjs, type RentalMode } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { RentalRangeSheet } from '@/features/marketplace/components/RentalRangeSheet';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useUpdateBooking } from '../hooks/use-bookings';
import type { BookingDetail, UpdateBookingInput } from '../api';

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
    serviceType: yup.string().oneOf(SERVICE_TYPE_VALUES).required(),
    routeType: yup.string().oneOf(ROUTE_TYPE_VALUES).required(),
    pickupAddress: yup.string().trim().max(500).default(''),
    destination: yup.string().trim().max(500).default(''),
    baseAmount: money(),
    discountAmount: money(),
    depositAmount: money(),
    note: yup.string().trim().max(NOTE_MAX).default(''),
  });
}

function money() {
  return yup
    .number()
    .transform((v, orig) => (orig === '' || orig === null || orig === undefined ? null : v))
    .integer()
    .min(0)
    .nullable()
    .default(null);
}

/** `null` = CHƯA NHẬP. `Number('') || 0` biến ô trống thành `0` và gửi đi "miễn phí". */
function numOrNull(value: string | null | undefined): number | null {
  return value === null || value === undefined || value === '' ? null : Number(value);
}

/**
 * Sửa một đơn đã tạo (BKG-08) — bản native của `BookingFormDialog` ở chế độ sửa.
 *
 * **Xe KHÔNG đổi được** — giống web, và vì lý do nghiệp vụ chứ không phải giới hạn kỹ thuật:
 * đơn đang chiếm chỗ trên lịch của CHIẾC XE ĐÓ (ADR 0006). Đổi xe nghĩa là nhả một chỗ và giữ
 * một chỗ khác, tức là huỷ và tạo lại — nên đó đúng là việc phải làm.
 *
 * **Phí giao nhận cố ý KHÔNG có ở đây**, đúng như web. Nó là con số hai bên thoả thuận ngoài
 * ứng dụng rồi ghi lại, và việc ghi lại đi kèm lý do vào nhật ký (`DeliveryFeeSheet`). Để nó
 * thành một ô lẫn giữa các ô khác là mở đường ghi thứ hai cho cùng một cột, và đường đó mất lý
 * do sửa. Nó vẫn được CỘNG vào tổng tiền vì đơn thật sự phải trả khoản đó.
 *
 * Tiền để trống = **không đổi trường đó** (`PATCH` chỉ nhận trường có mặt), khác hẳn với gửi
 * `"0"` nghĩa là "miễn phí".
 */
export function EditBookingSheet({
  booking,
  onClose,
}: {
  booking: BookingDetail;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.edit');
  const tCreate = useTranslations('Bookings.create');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdateBooking(booking.id);

  const [scheduling, setScheduling] = useState(false);
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [conflict, setConflict] = useState(false);
  const [range, setRange] = useState<{ pickupAt: Dayjs | null; returnAt: Dayjs | null }>({
    pickupAt: dayjs(booking.pickupAt),
    returnAt: dayjs(booking.returnAt),
  });

  const schema = useMemo(
    () =>
      buildEditSchema({
        name: tCreate('customer.nameLabel'),
        phone: tCreate('customer.phoneLabel'),
      }),
    [tCreate],
  );

  const { control, handleSubmit } = useForm<EditFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      customerName: booking.customerName,
      customerPhone: booking.customerPhone ?? '',
      serviceType: booking.serviceType as EditFormValues['serviceType'],
      routeType: (booking.routeType ?? ROUTE_TYPE.IN_CITY) as EditFormValues['routeType'],
      pickupAddress: booking.pickupAddress ?? '',
      destination: booking.destination ?? '',
      baseAmount: numOrNull(booking.baseAmount),
      discountAmount: numOrNull(booking.discountAmount),
      depositAmount: numOrNull(booking.depositAmount),
      note: booking.note ?? '',
    },
  });

  const [serviceType, routeType, baseAmount, discountAmount] = useWatch({
    control,
    name: ['serviceType', 'routeType', 'baseAmount', 'discountAmount'],
  });

  /*
   * Tổng = tiền thuê + phí giao nhận − giảm giá, kẹp ở 0. CÙNG công thức với web, và phí giao
   * nhận vào tổng dù không sửa được ở đây — nó vẫn là tiền đơn phải trả.
   *
   * Số SUY RA, không phải một ô nhập: server vẫn tính lại khi lưu (ADR 0007), đây chỉ là để
   * người đang gõ thấy ngay con số cuối.
   */
  const total = Math.max(
    0,
    (baseAmount ?? 0) + (numOrNull(booking.deliveryFee) ?? 0) - (discountAmount ?? 0),
  );

  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;

  const submit = handleSubmit((values) => {
    setConflict(false);
    const body: UpdateBookingInput = {
      customerName: values.customerName,
      ...(values.customerPhone ? { customerPhone: values.customerPhone } : {}),
      serviceType: values.serviceType,
      ...(range.pickupAt ? { pickupAt: range.pickupAt.toISOString() } : {}),
      ...(range.returnAt ? { returnAt: range.returnAt.toISOString() } : {}),
      ...moneyField(values.baseAmount, 'baseAmount'),
      ...moneyField(values.discountAmount, 'discountAmount'),
      ...moneyField(values.depositAmount, 'depositAmount'),
      note: values.note,
      /* Hành trình chỉ có nghĩa với chuyến CÓ TÀI XẾ — server validate lại cùng bộ luật. */
      ...(values.serviceType === SERVICE_TYPE.WITH_DRIVER
        ? {
            routeType: values.routeType,
            ...(values.pickupAddress ? { pickupAddress: values.pickupAddress } : {}),
            ...(values.routeType !== ROUTE_TYPE.IN_CITY && values.destination
              ? { destination: values.destination }
              : {}),
          }
        : {}),
    };

    update.mutate(body, {
      onSuccess: () => {
        toast.showSuccess(t('success'));
        onClose();
      },
      onError: (error) => {
        /* Trùng lịch nói thẳng tại form, không đẩy ra toast: lối ra là đổi giờ ngay ở đây. */
        if (getErrorCode(error) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
          setConflict(true);
          return;
        }
        toast.showError(errorMessage(error));
      },
    });
  });

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={t('title')}
        subtitle={booking.code}
        footer={
          <Button label={t('open')} loading={update.isPending} onPress={() => void submit()} />
        }
      >
        {conflict ? (
          <YStack bg={colors.dangerSurface} p={space.md} br={radius.md} gap={2}>
            <Text col={colors.danger} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('conflictTitle')}
            </Text>
            <Text col={colors.text} fos={fontSize.label}>
              {t('conflictBody')}
            </Text>
          </YStack>
        ) : null}

        {/* Xe khoá — nói rõ vì sao ngay tại chỗ, đừng để người dùng đi tìm nút đổi xe. */}
        <Card tone="muted" lift="flat">
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {booking.vehicleName}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('vehicleLocked')}
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

        <SelectField
          control={control}
          name="serviceType"
          label={t('serviceTypeLabel')}
          options={SERVICE_TYPE_VALUES.map((value) => ({
            value,
            label: domainLabel('serviceType', value),
          }))}
          required
        />

        {withDriver ? (
          <>
            <SelectField
              control={control}
              name="routeType"
              label={t('routeTypeLabel')}
              options={ROUTE_TYPE_VALUES.map((value) => ({
                value,
                label: domainLabel('routeType', value),
              }))}
              required
            />
            <TextField
              control={control}
              name="pickupAddress"
              label={t('pickupAddressLabel')}
              placeholder={t('pickupAddressPlaceholder')}
            />
            {routeType !== ROUTE_TYPE.IN_CITY ? (
              <TextField
                control={control}
                name="destination"
                label={t('destinationLabel')}
                placeholder={t('destinationPlaceholder')}
              />
            ) : null}
          </>
        ) : null}

        <Card onPress={() => setScheduling(true)} accessibilityLabel={t('scheduleLabel')}>
          <YStack gap={2}>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('scheduleLabel')}
            </Text>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
              {range.pickupAt && range.returnAt
                ? `${fmt.rentalPoint(range.pickupAt)} – ${fmt.rentalPoint(range.returnAt)}`
                : tCreate('schedule.empty')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('scheduleNote')}
            </Text>
          </YStack>
        </Card>

        <MoneyField control={control} name="baseAmount" label={tCreate('price.baseAmount')} />
        <MoneyField
          control={control}
          name="discountAmount"
          label={tCreate('price.discountAmount')}
        />
        <MoneyField
          control={control}
          name="depositAmount"
          label={tCreate('price.depositAmount')}
          hint={tCreate('price.depositHint')}
        />

        {/* Hàng TỔNG KẾT, không phải một ô nhập — nên nó không mang khung ô như các dòng trên. */}
        <XStack
          ai="center"
          jc="space-between"
          gap={space.sm}
          p={space.md}
          br={radius.md}
          bg={colors.surfaceMuted}
        >
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('total')}
          </Text>
          <Text col={colors.price} fos={fontSize.body} fow={fontWeight.bold}>
            {fmt.money(String(total))}
          </Text>
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('deliveryFeeNote')}
        </Text>

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

      <RentalRangeSheet
        open={scheduling}
        value={range}
        mode={rentalMode}
        onChange={setRange}
        onModeChange={setRentalMode}
        onApply={() => setScheduling(false)}
        onCancel={() => setScheduling(false)}
      />
    </>
  );
}

/** Bỏ hẳn trường khi trống: `PATCH` chỉ đổi trường CÓ MẶT, gửi `"0"` là đặt nó về miễn phí. */
function moneyField(
  value: number | null,
  key: 'baseAmount' | 'discountAmount' | 'depositAmount',
): Partial<UpdateBookingInput> {
  return value == null ? {} : { [key]: String(value) };
}
