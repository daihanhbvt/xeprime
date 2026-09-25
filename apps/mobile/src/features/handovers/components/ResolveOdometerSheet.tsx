import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  API_ERROR_CODE,
  ODOMETER_CORRECTION_REASON,
  ODOMETER_CORRECTION_REASON_VALUES,
  ODOMETER_MAX_KM,
  type HandoverType,
} from '@xeprime/types';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { getErrorCode } from '@/lib/api-client';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, radius, space } from '@/theme/tokens';
import { useResolveHandoverOdometer } from '../hooks/use-handovers';
import type { Handover, HandoverContext } from '../api';
import { getErrorMessage } from '@/lib/get-error-message';

/** Suy từ CHÍNH schema — `yup.oneOf` thu hẹp kiểu, interface viết tay sẽ lệch với resolver. */
type ResolveFormValues = yup.InferType<ReturnType<typeof buildSchema>>;

function buildSchema(labels: {
  notNumber: string;
  notInteger: string;
  negative: string;
  tooLarge: string;
  required: string;
  reason: string;
}) {
  return yup.object({
    /* Bốn câu báo lỗi khác nhau — xem chú thích cùng chỗ ở `HandoverScreen`. */
    odometerKm: yup
      .number()
      .transform((v, orig) => (orig === '' || orig === null ? undefined : v))
      .typeError(labels.notNumber)
      .integer(labels.notInteger)
      .min(0, labels.negative)
      .max(ODOMETER_MAX_KM, labels.tooLarge)
      .required(labels.required),
    reasonCode: yup
      .string()
      .oneOf(ODOMETER_CORRECTION_REASON_VALUES)
      .default(ODOMETER_CORRECTION_REASON.HANDOVER_ERROR)
      .required(),
    reason: yup.string().trim().required(labels.reason).max(REASON_MAX, labels.reason),
  });
}

/**
 * Sửa chỉ số KM của một biên bản **ĐÃ XÁC NHẬN**.
 *
 * `confirmed` là điểm không quay lại, nên đây là đường DUY NHẤT đổi được số KM — và nó đắt hơn
 * hẳn một lần lưu nháp: bắt buộc mã lý do + diễn giải chi tiết, cả hai vào `audit_logs`.
 *
 * **Giảm** số KM cần quyền riêng `vehicles.odometer.decrease`: KM là số có thẩm quyền dùng để
 * tính bảo dưỡng và đối soát bàn giao, hạ nó xuống có thể che giấu quãng đường đã chạy. Server
 * trả `ODOMETER_DECREASE_FORBIDDEN`, và tấm này hiện đúng câu giải thích đó chứ không phải một
 * lỗi chung — người dùng cần biết phải đi xin quyền, không phải nghĩ là hệ thống hỏng.
 */
export function ResolveOdometerSheet({
  bookingId,
  type,
  context,
  handover,
  onClose,
}: {
  bookingId: string;
  type: HandoverType;
  /** Ngữ cảnh bàn giao của đơn — nguồn của hai con số đối chiếu ở đầu tấm. */
  context: HandoverContext;
  handover: Handover;
  onClose: () => void;
}) {
  const t = useTranslations('Bookings.handover.odometerFix');
  const tOdoError = useTranslations('Bookings.handover.odometerError');
  const tConflict = useTranslations('Bookings.handover.conflict');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const toast = useAppToast();
  const resolve = useResolveHandoverOdometer(bookingId, type);

  /*
   * Hai câu trả lời KHÁC NHAU cùng mang mã `ODOMETER_DECREASE_FORBIDDEN`:
   *
   * - 403: thiếu hẳn `vehicles.odometer.decrease` — đi xin quyền, không có đường vòng.
   * - 409 (`requiresConfirmation`): CÓ quyền, chỉ là chưa xác nhận — còn một bước nữa.
   *
   * Gộp hai thứ đó vào một câu đỏ như trước là khoá cứng người có thẩm quyền: họ không bao giờ
   * giảm được số KM từ app, trong khi web cho họ bấm "vẫn giảm".
   */
  const [decrease, setDecrease] = useState<{ message: string; canConfirm: boolean } | null>(null);

  const schema = useMemo(
    () =>
      buildSchema({
        notNumber: tOdoError('notNumber'),
        notInteger: tOdoError('notInteger'),
        negative: tOdoError('negative'),
        tooLarge: tOdoError('tooLarge', { max: ODOMETER_MAX_KM }),
        required: tOdoError('required'),
        reason: t('reasonHint'),
      }),
    [t, tOdoError],
  );

  const { control, handleSubmit } = useForm<ResolveFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      odometerKm: handover.odometerKm ?? 0,
      reasonCode: ODOMETER_CORRECTION_REASON.HANDOVER_ERROR,
      reason: '',
    },
  });

  const submit = (confirmDecrease = false) =>
    handleSubmit((values) => {
      setDecrease(null);
      resolve.mutate(
        {
          odometerKm: values.odometerKm,
          reasonCode: values.reasonCode,
          reason: values.reason,
          confirmDecrease,
          expectedRowVersion: handover.rowVersion,
        },
        {
          onSuccess: () => {
            toast.showSuccess(t('success'));
            onClose();
          },
          onError: (error) => {
            const code = getErrorCode(error);
            /*
             * 409 = `expectedRowVersion` đã cũ: ai đó vừa sửa chính biên bản này.
             *
             * Bấm lại CŨNG hỏng, vì số phiên bản trong tay vẫn là số cũ — nên đường đúng là đóng
             * tấm này lại (mutation đã invalidate biên bản) và mở lại trên dữ liệu mới. Rơi vào
             * câu lỗi chung như trước là để người dùng bấm mãi một nút chắc chắn không chạy.
             */
            if (code === API_ERROR_CODE.CONFLICT) {
              toast.showError(tConflict('body'));
              onClose();
              return;
            }
            if (code !== API_ERROR_CODE.ODOMETER_DECREASE_FORBIDDEN) {
              toast.showError(getErrorMessage(error));
              return;
            }
            /*
             * Đúng `ResolveOdometerDialog` bên web: câu NGUYÊN VĂN của server (nó nói rõ thiếu
             * quyền hay cần xác nhận) và LUÔN kèm lối "vẫn giảm" — server mới là nơi quyết định
             * người này có được giảm hay không; bấm mà thiếu quyền thì server trả lỗi lần nữa.
             */
            setDecrease({ message: getErrorMessage(error), canConfirm: true });
          },
        },
      );
    })();

  return (
    <BottomSheet
      open
      onClose={onClose}
      /* Tiêu đề theo VIỆC, như web: bổ sung một số còn thiếu khác với sửa một số đã ghi. */
      title={handover.odometerMissing ? t('openMissing') : t('openCorrect')}
      footer={
        <Button
          label={t('confirm')}
          icon="speedometer-outline"
          loading={resolve.isPending}
          onPress={() => submit()}
        />
      }
    >
      <YStack gap={space.sm}>
        {/* Cùng ba khối mở đầu với web: cảnh báo · ô đối chiếu · form. */}
        {handover.odometerMissing ? (
          <Callout tone="warning" title={t('missingTitle')}>
            {t('missingBody')}
          </Callout>
        ) : null}

        {/*
          Hai con số để ĐỐI CHIẾU trước khi gõ: KM hiện tại của xe và KM lúc giao. Không có chúng
          thì người dùng nhập một số vào khoảng không và chỉ biết mình sai khi server từ chối.
        */}
        <YStack
          p={space.sm}
          br={radius.md}
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.borderSubtle}
        >
          <DataRow label={t('currentVehicleKm')} value={fmt.km(context.vehicleOdometerKm)} />
          {context.pickupOdometerKm == null ? null : (
            <DataRow label={t('pickupKm')} value={fmt.km(context.pickupOdometerKm)} />
          )}
        </YStack>

        {decrease ? (
          <Callout tone="danger" title={t('decreaseTitle')}>
            {decrease.message}
          </Callout>
        ) : null}
        {decrease?.canConfirm ? (
          <Button
            label={t('decreaseOverride')}
            /* Cảnh báo, không phải dấu tích: đây là đường ghi ĐÈ một số đo đã bị chặn một lần. */
            icon="warning-outline"
            variant="danger"
            loading={resolve.isPending}
            onPress={() => submit(true)}
          />
        ) : null}

        <NumberField
          control={control}
          name="odometerKm"
          label={t('kmLabel')}
          suffix="km"
          min={0}
          integer
          required
        />

        <SelectField
          control={control}
          name="reasonCode"
          label={t('reasonCodeLabel')}
          options={ODOMETER_CORRECTION_REASON_VALUES.map((code) => ({
            value: code,
            label: domainLabel('odometerCorrectionReason', code),
          }))}
          required
        />

        <TextField
          control={control}
          name="reason"
          label={t('reasonLabel')}
          placeholder={t('reasonPlaceholder')}
          hint={t('reasonHint')}
          multiline
          rows={3}
          maxLength={REASON_MAX}
          required
        />
      </YStack>
    </BottomSheet>
  );
}
