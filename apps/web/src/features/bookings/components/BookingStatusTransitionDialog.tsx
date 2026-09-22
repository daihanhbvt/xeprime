'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY_VALUES,
  cancellationReasonNeedsText,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { DialogForm } from '@/components/form/DialogForm';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import { useTransitionBooking } from '../hooks/use-booking-mutations';
import type { BookingDetail } from '../types';
import styles from './BookingStatusTransitionDialog.module.css';

/** Trần lý do — cùng con số với `TransitionBookingDto.reason` ở backend. */
const REASON_MAX = 500;

/**
 * Hai kết thúc tiêu cực mà hộp này phục vụ. Kiểu hẹp có chủ đích: `active → completed` đi qua
 * biên bản nhận xe (design 14 §3), và `reserved → confirmed` không phá huỷ gì nên không cần
 * hộp xác nhận — mở hộp này cho chúng là mở một đường vòng qua luồng bàn giao.
 */
export type BookingClosingTarget = typeof BOOKING_STATUS.CANCELLED | typeof BOOKING_STATUS.NO_SHOW;

interface BookingStatusTransitionDialogProps {
  booking: BookingDetail;
  target: BookingClosingTarget;
  open: boolean;
  onClose: () => void;
}

/**
 * Xác nhận HỦY ĐƠN / GHI NHẬN KHÁCH KHÔNG ĐẾN — hai hành động phá huỷ của gian hàng.
 *
 * Vì sao là một hộp có form chứ không phải một `Modal.confirm` hai nút: cả hai đích đều khép đơn
 * lại vĩnh viễn (`isBookingFinal`) và **nhả lịch xe ngay trong cùng transaction** (ADR 0006) —
 * khung giờ vừa mở ra có thể bị đơn khác chiếm trong vài giây, nên không có đường lùi. UX
 * guidelines §3 buộc hành động không hoàn tác phải nêu rõ hậu quả và phạm vi, và bắt chọn lý do
 * khi nó đụng tới tiền; ở đây lý do là BẮT BUỘC, backend cũng từ chối nếu thiếu.
 *
 * Lý do đi vào audit (`afterJson.reason`), KHÔNG vào `booking.note`: note là nội dung của đơn,
 * người sau sửa đè được; lời giải thích cho một quyết định thì không được phép mất.
 *
 * Tiền đã thu KHÔNG bị đụng tới. XePrime không có cổng thanh toán (ADR 0013) nên không có gì để
 * hoàn tự động — hộp này nói thẳng điều đó TRƯỚC khi bấm, thay vì để nhân viên phát hiện ra khi
 * khách gọi đòi tiền.
 *
 * ## Huỷ đơn còn có một ô nữa: NHÓM lý do (ADR 0045 điều 1)
 *
 * Ô chữ tự do trả lời "vì sao" cho một con người đọc; nhóm lý do trả lời cùng câu đó cho một
 * câu SQL. Vận hành cần biết "xe hỏng" chiếm bao nhiêu phần trăm để sửa đúng chỗ, và chỉ số
 * uy tín cần một khoá để lọc — không cột nào làm được việc của cột kia.
 *
 * `no_show` KHÔNG có ô này: nó tự nó đã là một phân loại, và bên chịu trách nhiệm ở đó là
 * khách chứ không phải gian hàng.
 *
 * Danh sách nhóm KHÔNG có "bất khả kháng". Trách nhiệm do server suy từ người thao tác, không
 * do người huỷ tự khai — cho tự chọn là xoá luôn ý nghĩa của chỉ số uy tín.
 */
export function BookingStatusTransitionDialog({
  booking,
  target,
  open,
  onClose,
}: BookingStatusTransitionDialogProps) {
  const t = useTranslations('Bookings.statusActions.dialog');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const transition = useTransitionBooking(booking.id);

  const isCancel = target === BOOKING_STATUS.CANCELLED;

  /*
   * Schema dựng TRONG component vì thông điệp lỗi phải theo ngôn ngữ đang dùng (ADR 0012), mà
   * `@xeprime/validators` là gói framework-free không đọc được bộ dịch của request. `useMemo`
   * theo `t` để mỗi lần gõ không dựng lại resolver.
   */
  const schema = useMemo(
    () =>
      yup.object({
        reason: yup
          .string()
          .trim()
          .required(t('reasonRequired'))
          .max(REASON_MAX, t('reasonTooLong'))
          .default(''),
        /*
         * Bắt buộc CHỈ khi huỷ. `no_show` đi qua cùng hộp này nhưng không phải một lượt huỷ,
         * và backend cũng chỉ đòi nhóm lý do khi `status = cancelled` — hai phía phải hỏi
         * đúng một câu, nếu không sẽ có một ô bắt buộc mà server chẳng dùng tới.
         *
         * Điều kiện nằm trong `.test()` chứ không phải một ternary chọn giữa hai schema: ternary
         * cho ra HAI hình dạng object khác nhau, và `useForm` mất khả năng suy kiểu từ resolver
         * (TS2322 hàng loạt ở mọi `control`). Một hình dạng, một phép kiểm chạy lúc gửi.
         */
        reasonCategory: yup
          .string()
          .defined()
          .default('')
          .test(
            'category-required-on-cancel',
            t('categoryRequired'),
            (value) =>
              !isCancel ||
              (CANCELLATION_REASON_CATEGORY_VALUES as readonly string[]).includes(value),
          ),
      }),
    [t, isCancel],
  );

  /*
   * Ô nhóm lý do khai là `string` BẮT BUỘC với mặc định rỗng, không phải `string | undefined`.
   *
   * Không phải chuyện thẩm mỹ: `useForm` suy tham số kiểu thứ ba từ resolver, và một khoá tuỳ
   * chọn trong kiểu yup sinh ra làm phép suy đó gãy — mọi `control` truyền xuống field thành
   * TS2322. Cả kho dùng đúng một lối: field khai `defined()`, luật nằm ở `.test()`.
   * Chuỗi rỗng không bao giờ ra tới API — `submit` chỉ gửi khi đang HUỶ, và lúc đó `.test()`
   * đã buộc nó phải là một mã hợp lệ.
   */
  const { control, handleSubmit, watch } = useForm<{ reason: string; reasonCategory: string }>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '', reasonCategory: '' },
  });

  /*
   * "Lý do khác" thì ô chữ phải nói được điều mà nhóm không nói. Nó vốn đã bắt buộc ở hộp này,
   * nên chỗ này chỉ đổi GỢI Ý dưới ô — một câu nhắc đúng lúc rẻ hơn một lỗi đỏ sau khi gửi.
   */
  const needsText = cancellationReasonNeedsText(
    watch('reasonCategory') as CancellationReasonCategory,
  );

  const categoryOptions = CANCELLATION_REASON_CATEGORY_VALUES.map((value) => ({
    value,
    label: domainLabel('cancellationReasonCategory', value),
  }));

  /*
   * "Đã thu" là tiền gian hàng ĐANG CẦM của khách — gồm cả phiếu thu tay ghi ở sổ Thu-Chi.
   * Đây là con số duy nhất có nghĩa ở đây; `depositAmount` là cọc theo cấu hình đơn, chưa chắc
   * đã thu được đồng nào.
   */
  const hasCollected = !isZeroMoney(booking.collectedAmount);

  function submit(values: { reason: string; reasonCategory: string }) {
    transition.mutate(
      {
        status: target,
        reason: values.reason.trim(),
        /*
         * `no_show` không gửi nhóm lý do — DTO chỉ đòi nó khi huỷ, và gửi thừa là nói dối dữ
         * liệu. Ép kiểu ở đây là chỗ DUY NHẤT hợp lệ: ô chọn chỉ dựng được từ
         * `CANCELLATION_REASON_CATEGORY_VALUES`, và `.test()` của schema đã chặn mọi giá trị
         * ngoài danh sách trước khi `submit` chạy.
         */
        ...(isCancel
          ? { reasonCategory: values.reasonCategory as CancellationReasonCategory }
          : {}),
      },
      {
        onSuccess: () => {
          message.success(
            isCancel
              ? t('cancelSuccess', { code: booking.code })
              : t('noShowSuccess', { code: booking.code }),
          );
          onClose();
        },
        // Lỗi ở lại TRONG hộp (UX guidelines §5): người dùng còn phải xử lý nó, và toast thì bay
        // đi mất. Form giữ nguyên chữ đã gõ.
      },
    );
  }

  return (
    <ResponsiveDialog
      title={
        isCancel
          ? t('cancelTitle', { code: booking.code })
          : t('noShowTitle', { code: booking.code })
      }
      open={open}
      onClose={onClose}
      size="sm"
      // Form ⇒ bàn phím ảo cần chỗ: quy tắc 5 của ResponsiveDialog (sheet 85dvh bị che mất ô nhập).
      mobileMode="fullscreen"
      destructive
      okText={isCancel ? t('cancelOk') : t('noShowOk')}
      cancelText={t('keep')}
      onOk={() => void handleSubmit(submit)()}
      // Chống bấm lặp: AntD khoá nút, ResponsiveDialog khoá luôn Esc và nền khi đang gửi.
      confirmLoading={transition.isPending}
    >
      <DialogForm
        className={styles.body}
        labelWidth="sm"
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        <p className={styles.lead}>{isCancel ? t('cancelLead') : t('noShowLead')}</p>

        {/* Nói rõ đang đụng vào ĐƠN NÀO: mã đơn, khách, xe, khung giờ (UX guidelines §3). */}
        <dl className={styles.summary}>
          <div className={styles.row}>
            <dt>{t('customer')}</dt>
            <dd>{booking.customerName}</dd>
          </div>
          <div className={styles.row}>
            <dt>{t('vehicle')}</dt>
            <dd>
              {booking.vehicleName}
              {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
            </dd>
          </div>
          <div className={styles.row}>
            <dt>{t('period')}</dt>
            <dd>{fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}</dd>
          </div>
        </dl>

        {hasCollected ? (
          <Alert
            type="warning"
            showIcon
            title={t('paidTitle', { amount: fmt.money(booking.collectedAmount) })}
            description={t('paidDescription')}
          />
        ) : null}

        {isCancel ? (
          <SelectField
            control={control}
            name="reasonCategory"
            label={t('categoryLabel')}
            options={categoryOptions}
            placeholder={t('categoryPlaceholder')}
            help={t('categoryHelp')}
            required
          />
        ) : null}

        <TextAreaField
          control={control}
          name="reason"
          label={t('reasonLabel')}
          placeholder={t('reasonPlaceholder')}
          help={needsText ? t('reasonHelpOther') : t('reasonHelp')}
          maxLength={REASON_MAX}
          rows={3}
          required
        />

        {transition.isError ? (
          <Alert type="error" showIcon role="alert" title={errorMessage(transition.error)} />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
