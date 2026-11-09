'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button } from 'antd';
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
import { InfoHint } from '@/components/data-display/InfoHint';
import { DialogForm } from '@/components/form/DialogForm';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
// Cùng khuôn với hai hộp có lý do của chặng yêu cầu (Figma `23930:44688`) — một bộ style, ba hộp.
import decision from '@/features/booking-requests/components/DecisionReasonDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import { useTransitionBooking } from '../hooks/use-booking-mutations';
import type { BookingListItem } from '../types';
import styles from './BookingStatusTransitionDialog.module.css';

/** Trần lý do — cùng con số với `TransitionBookingDto.reason` ở backend. */
const REASON_MAX = 500;

/**
 * Hai kết thúc tiêu cực mà hộp này phục vụ. Kiểu hẹp có chủ đích: `active → completed` đi qua
 * biên bản nhận xe (design 14 §3), và `reserved → confirmed` không phá huỷ gì nên không cần
 * hộp xác nhận — mở hộp này cho chúng là mở một đường vòng qua luồng bàn giao.
 */
export type BookingClosingTarget = typeof BOOKING_STATUS.CANCELLED | typeof BOOKING_STATUS.NO_SHOW;

/**
 * Khi nào ô chữ BẮT BUỘC — cùng luật với `transitionNeedsReason` của DTO (người dùng chốt
 * 06/11/2026): no-show luôn cần (hộp chỉ có mỗi ô đó); huỷ chỉ khi nhóm là "Lý do khác".
 */
function closingNeedsText(target: BookingClosingTarget, category: string): boolean {
  return (
    target === BOOKING_STATUS.NO_SHOW ||
    cancellationReasonNeedsText(category as CancellationReasonCategory)
  );
}

interface BookingStatusTransitionDialogProps {
  /** Dòng danh sách là đủ (chi tiết đơn kế thừa nó) — thẻ "Chờ giao xe" mở hộp này thẳng (05/11/2026). */
  booking: BookingListItem;
  target: BookingClosingTarget;
  open: boolean;
  onClose: () => void;
  /**
   * Nhóm lý do chọn sẵn — lối "Huỷ chuyến do thiếu tài xế" của khối Tài xế (ADR 0074) mở hộp với
   * `driver_unavailable`. Người huỷ vẫn đổi được; chỉ có tác dụng khi huỷ.
   */
  defaultReasonCategory?: CancellationReasonCategory;
}

/**
 * Xác nhận HỦY ĐƠN / GHI NHẬN KHÁCH KHÔNG ĐẾN — hai hành động phá huỷ của gian hàng.
 *
 * Vì sao là một hộp có form chứ không phải một `Modal.confirm` hai nút: cả hai đích đều khép đơn
 * lại vĩnh viễn (`isBookingFinal`) và **nhả lịch xe ngay trong cùng transaction** (ADR 0006) —
 * khung giờ vừa mở ra có thể bị đơn khác chiếm trong vài giây, nên không có đường lùi. UX
 * guidelines §3 buộc hành động không hoàn tác phải nêu rõ hậu quả và phạm vi, và bắt chọn lý do
 * khi nó đụng tới tiền. Nhóm lý do (huỷ) luôn bắt buộc; ô chữ bắt buộc khi no-show hoặc khi nhóm
 * là "Lý do khác" (`closingNeedsText`) — backend kiểm đúng luật đó.
 *
 * Lý do đi vào audit (`afterJson.reason`), KHÔNG vào `booking.note`: note là nội dung của đơn,
 * người sau sửa đè được; lời giải thích cho một quyết định thì không được phép mất. Huỷ một đơn
 * đặt qua CHỢ thì câu đó còn là "Ghi chú cho khách" — thông báo huỷ gửi khách mang nguyên nó.
 *
 * Khuôn hình theo Figma Partner-XePrime "Huỷ yêu cầu thuê xe" (`23930:44688`, 06/11/2026), cùng
 * khuôn với hộp huỷ ở chặng chờ thanh toán: hậu quả ở phụ đề; viên tóm tắt khách · xe, thêm biển
 * số và khung giờ (người dùng chốt — để chắc đang huỷ đúng chuyến); nhãn trên ô; ô cảnh báo đỏ
 * (chỉ đơn qua chợ); hai nút cuối.
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
  defaultReasonCategory,
}: BookingStatusTransitionDialogProps) {
  const t = useTranslations('Bookings.statusActions.dialog');
  // Giải thích chỉ số uy tín dùng chung với hộp huỷ yêu cầu — một câu, một bản dịch.
  const tRequestCancel = useTranslations('BookingRequests.cancel');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const transition = useTransitionBooking(booking.id);

  const isCancel = target === BOOKING_STATUS.CANCELLED;
  /** Đơn sinh ra từ một yêu cầu trên chợ — có tài khoản khách, có chỉ số uy tín, có giữ chỗ. */
  const fromMarketplace = booking.bookingRequestId != null;
  /**
   * Lượt HUỶ đơn qua chợ gửi nguyên ghi chú này cho khách trong thông báo huỷ (06/11/2026). Lý do
   * no-show và lý do huỷ đơn tự lập chỉ vào nhật ký — nhãn phải nói đúng ai sẽ đọc nó.
   */
  const noteForCustomer = isCancel && fromMarketplace;

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
          .max(REASON_MAX, t('reasonTooLong'))
          .default('')
          .test(
            'reason-required',
            noteForCustomer ? t('customerNoteRequired') : t('reasonRequired'),
            function (value) {
              const { reasonCategory } = this.parent as { reasonCategory: string };
              return !closingNeedsText(target, reasonCategory) || value.length > 0;
            },
          ),
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
            t('cancelReasonRequired'),
            (value) =>
              !isCancel ||
              (CANCELLATION_REASON_CATEGORY_VALUES as readonly string[]).includes(value),
          ),
      }),
    [t, isCancel, noteForCustomer, target],
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
    defaultValues: { reason: '', reasonCategory: defaultReasonCategory ?? '' },
  });

  // Dấu `*` của ô chữ đi theo nhóm đang chọn — chọn "Lý do khác" là ô thành bắt buộc ngay.
  const textRequired = closingNeedsText(target, watch('reasonCategory'));

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
    const reason = values.reason.trim();
    transition.mutate(
      {
        status: target,
        // Ghi chú tuỳ chọn để trống thì không gửi — không có "lý do rỗng" trong audit.
        ...(reason ? { reason } : {}),
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
        <span className={decision.titleBlock}>
          <span>
            {isCancel
              ? t('cancelTitle', { code: booking.code })
              : t('noShowTitle', { code: booking.code })}
          </span>
          <span className={decision.subtitle}>
            {isCancel
              ? t.rich('cancelSubtitle', {
                  b: (chunks) => <strong>{chunks}</strong>,
                  status: domainLabel('bookingStatus', booking.status),
                })
              : t('noShowLead')}
          </span>
        </span>
      }
      open={open}
      onClose={onClose}
      size="sm"
      // Form ⇒ bàn phím ảo cần chỗ: quy tắc 5 của ResponsiveDialog (sheet 85dvh bị che mất ô nhập).
      mobileMode="fullscreen"
      // Chống bấm lặp: ResponsiveDialog khoá Esc và nền khi đang gửi; nút chính tự quay.
      confirmLoading={transition.isPending}
      footer={
        <div className={decision.footer}>
          <Button size="large" onClick={onClose} disabled={transition.isPending}>
            {t('back')}
          </Button>
          <Button
            size="large"
            type="primary"
            danger
            loading={transition.isPending}
            onClick={() => void handleSubmit(submit)()}
          >
            {isCancel ? t('cancelOk') : t('noShowOk')}
          </Button>
        </div>
      }
    >
      <DialogForm
        className={styles.form}
        labelPosition="top"
        requiredMark={trailingRequiredMark}
        onSubmit={(event) => void handleSubmit(submit)(event)}
      >
        {/* Nói rõ đang đụng vào ĐƠN NÀO: khách · xe · biển số, rồi khung giờ (UX guidelines §3). */}
        <div className={cx(decision.summary, decision.summaryStack)}>
          <p className={decision.summaryLine}>
            <span className={decision.summaryName}>{booking.customerName}</span>
            <span className={decision.summaryDot} aria-hidden="true" />
            <span className={decision.summaryVehicle}>
              {booking.vehicleName}
              {booking.vehiclePlate ? ` · ${booking.vehiclePlate}` : ''}
            </span>
          </p>
          <p className={decision.summaryMeta}>
            {fmt.rentalRange(booking.pickupAt, booking.returnAt)}
          </p>
        </div>

        {isCancel ? (
          <SelectField
            control={control}
            name="reasonCategory"
            label={t('cancelReasonLabel')}
            options={categoryOptions}
            placeholder={t('cancelReasonPlaceholder')}
            required
          />
        ) : null}

        {/*
         * Nhãn nói đúng AI đọc ô này — không cần thêm dòng giải thích dưới ô (người dùng bỏ
         * 06/11/2026): huỷ đơn qua chợ → khách đọc; huỷ đơn tự lập → chỉ nhật ký; no-show → lý do.
         */}
        <TextAreaField
          control={control}
          name="reason"
          label={
            noteForCustomer
              ? t('customerNoteLabel')
              : isCancel
                ? t('internalNoteLabel')
                : t('reasonLabel')
          }
          placeholder={noteForCustomer ? t('customerNotePlaceholder') : t('reasonPlaceholder')}
          maxLength={REASON_MAX}
          rows={3}
          required={textRequired}
        />

        {/*
         * Hệ quả là chữ chính, không nằm trong tooltip — người bấm nút đỏ cần biết uy tín và tiền
         * đi đâu TRƯỚC khi bấm. Chỉ đơn đặt qua CHỢ: đơn tự lập không có yêu cầu nào nên không vào
         * mẫu số chỉ số uy tín (ADR 0045 điều 3), và cũng không có tiền giữ chỗ để hoàn.
         */}
        {isCancel && fromMarketplace ? (
          <div className={decision.warning} role="note">
            <p>
              {t.rich('cancelWarning', { b: (chunks) => <strong>{chunks}</strong> })}
              <InfoHint
                className={decision.infoHint}
                label={tRequestCancel('effects.metricsHintLabel')}
                content={tRequestCancel('effects.metricsHint')}
              />
            </p>
            <p>{t('cancelWarningMoney')}</p>
          </div>
        ) : null}

        {hasCollected ? (
          <Alert
            type="warning"
            showIcon
            title={t('paidTitle', { amount: fmt.money(booking.collectedAmount) })}
            description={t('paidDescription')}
          />
        ) : null}

        {transition.isError ? (
          <Alert type="error" showIcon role="alert" title={errorMessage(transition.error)} />
        ) : null}
      </DialogForm>
    </ResponsiveDialog>
  );
}
