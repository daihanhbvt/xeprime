import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY_VALUES,
  cancellationReasonNeedsText,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { isZeroMoney } from '@xeprime/domain';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/TextField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/** Trần lý do — khớp DTO backend. */
const REASON_MAX = 500;

export type Decision = typeof BOOKING_STATUS.CANCELLED | typeof BOOKING_STATUS.NO_SHOW;

/**
 * Hai quyết định bấm tay DUY NHẤT của gian hàng trên một đơn: **huỷ đơn** và **ghi nhận khách
 * không đến**.
 *
 * `active` và `completed` KHÔNG bao giờ đặt được bằng một cú bấm — chúng là hệ quả của một lần
 * xác nhận bàn giao thật (có giờ giao/nhận + số KM). Và không có nút "Xác nhận đơn": sự xác
 * nhận của gian hàng đã xảy ra ở `Duyệt & giữ xe` trên yêu cầu thuê, đó là thứ sinh ra chính
 * đơn này.
 *
 * Lý do là BẮT BUỘC ở cả hai, và nó vào `audit_logs` — KHÔNG vào `note` của đơn. Khác với lý do
 * TỪ CHỐI yêu cầu (khách đọc được), lý do ở đây là ghi chép nội bộ để đối chiếu về sau.
 *
 * ## Huỷ đơn còn một ô nữa: NHÓM lý do (ADR 0045 điều 1)
 *
 * Ô chữ tự do trả lời "vì sao" cho một con người đọc; nhóm lý do trả lời cùng câu đó cho một câu
 * SQL. Vận hành cần biết "xe hỏng" chiếm bao nhiêu phần trăm để sửa đúng chỗ, và chỉ số uy tín
 * cần một khoá để lọc — không cột nào làm được việc của cột kia.
 *
 * `TransitionBookingDto` ĐÒI `reasonCategory` khi `status = cancelled`, nên đây không phải một ô
 * trang trí: thiếu nó thì lượt huỷ nhận 400 và gian hàng không huỷ được đơn nào từ app.
 *
 * `no_show` KHÔNG có ô này: nó tự nó đã là một phân loại, và bên chịu trách nhiệm ở đó là khách
 * chứ không phải gian hàng.
 *
 * Danh sách nhóm KHÔNG có "bất khả kháng" — trách nhiệm do SERVER suy từ người thao tác, không do
 * người huỷ tự khai (ADR 0045 điều 2).
 */
export function BookingStatusSheet({
  open,
  onClose,
  booking,
  decision,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingDetail;
  decision: Decision;
  /**
   * `reasonCategory` chỉ đi kèm lượt HUỶ — DTO chỉ đòi nó khi `status = cancelled`, và gửi thừa
   * ở `no_show` là nói dối dữ liệu.
   */
  onConfirm: (input: { reason: string; reasonCategory?: CancellationReasonCategory }) => void;
  loading: boolean;
}) {
  const t = useTranslations('Bookings.statusActions.dialog');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const cancelling = decision === BOOKING_STATUS.CANCELLED;

  /*
   * Nhóm lý do sống ở `useState`, không trong schema: ràng buộc của nó phụ thuộc `decision`, và
   * một schema đổi hình theo điều kiện làm `useForm` mất phép suy kiểu từ resolver — đúng cái bẫy
   * mà bản web ghi lại trong `BookingStatusTransitionDialog`.
   */
  const [category, setCategory] = useState<CancellationReasonCategory | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  /* "Lý do khác" thì ô chữ phải nói được điều nhóm không nói — đổi GỢI Ý, không đổi ràng buộc. */
  const needsText = category !== null && cancellationReasonNeedsText(category);

  const schema = useMemo(
    () =>
      yup.object({
        reason: yup
          .string()
          .trim()
          .required(t('reasonRequired'))
          .max(REASON_MAX, t('reasonTooLong')),
      }),
    [t],
  );

  const { control, handleSubmit } = useForm<{ reason: string }>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit((values) => {
    // Huỷ mà chưa chọn nhóm thì dừng tại chỗ: gửi lên chỉ để nhận 400 là bắt người ta gõ lại lý do.
    if (cancelling && category === null) return;
    onConfirm({
      reason: values.reason,
      ...(cancelling && category ? { reasonCategory: category } : {}),
    });
  });

  /**
   * Bật cờ "đã chạm" NGAY tại cú bấm, TRƯỚC `handleSubmit`.
   *
   * Nhóm lý do sống ngoài React Hook Form, nên nếu chỉ bật cờ bên trong callback của
   * `handleSubmit` thì nó không bao giờ chạy khi ô CHỮ còn trống — RHF chặn callback trước. Hệ
   * quả là hai lỗi hiện TUẦN TỰ: bấm lần một chỉ báo thiếu lý do, gõ lý do rồi bấm lần hai mới
   * báo thiếu nhóm. Web kiểm cả hai trường trong cùng một schema nên hiện đủ ngay lần đầu; đây
   * là cách rẻ nhất để mobile nói cùng một điều tại cùng một thời điểm.
   */
  function pressConfirm() {
    setCategoryTouched(true);
    void submit();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={
        cancelling
          ? t('cancelTitle', { code: booking.code })
          : t('noShowTitle', { code: booking.code })
      }
      footer={
        <>
          <Button
            label={cancelling ? t('cancelOk') : t('noShowOk')}
            icon="close-circle-outline"
            variant="danger"
            loading={loading}
            onPress={pressConfirm}
          />
          <Button label={t('keep')} variant="ghost" onPress={onClose} />
        </>
      }
    >
      <Text col={colors.text} fos={fontSize.bodySm}>
        {cancelling ? t('cancelLead') : t('noShowLead')}
      </Text>

      <Card tone="muted" lift="flat">
        <YStack gap={space.xs}>
          <Line label={t('customer')} value={booking.customerName} />
          <Line label={t('vehicle')} value={booking.vehicleName} />
          <Line
            label={t('period')}
            value={fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
          />
        </YStack>
      </Card>

      {/*
        Đơn đã ghi nhận tiền thu: XePrime KHÔNG tự hoàn tiền và cũng không xoá khoản đã ghi.
        Nói thẳng ra trước khi bấm, vì sau khi đơn khép lại thì không sửa được nữa (ADR 0013).
      */}
      {isZeroMoney(booking.collectedAmount) ? null : (
        <YStack bg={colors.warningSurface} p={space.md} br={radius.md} gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('paidTitle', { amount: fmt.money(booking.collectedAmount) })}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('paidDescription')}
          </Text>
        </YStack>
      )}

      {/*
        NHÓM lý do — chỉ ở lượt HUỶ. Chip chọn-MỘT chứ không phải chip gợi-ý-gõ-nhanh: lựa chọn ở
        đây đi THẲNG vào dữ liệu, cùng hình thái với tấm huỷ yêu cầu thuê.
      */}
      {cancelling ? (
        <YStack gap={space.sm} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('categoryLabel')}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            {CANCELLATION_REASON_CATEGORY_VALUES.map((value) => (
              <Chip
                key={value}
                label={domainLabel('cancellationReasonCategory', value)}
                size="sm"
                selected={category === value}
                onPress={() => {
                  setCategory(value);
                  setCategoryTouched(true);
                }}
              />
            ))}
          </XStack>
          {categoryTouched && category === null ? (
            <Text col={colors.danger} fos={fontSize.label}>
              {t('categoryRequired')}
            </Text>
          ) : (
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('categoryHelp')}
            </Text>
          )}
        </YStack>
      ) : null}

      <TextField
        control={control}
        name="reason"
        label={t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={needsText ? t('reasonHelpOther') : t('reasonHelp')}
        multiline
        rows={3}
        maxLength={REASON_MAX}
        required
      />
    </BottomSheet>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm}>
        {value}
      </Text>
    </YStack>
  );
}
