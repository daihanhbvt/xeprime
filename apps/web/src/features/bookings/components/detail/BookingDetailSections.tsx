'use client';

import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { rentalProgress } from '@xeprime/domain';
import {
  BOOKING_HISTORY_OUTCOME,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_TYPE,
  PERMISSION,
  STATUS_COLOR,
  type BookingStatus,
  type HandoverPrepItem,
  type HandoverType,
  type StatusColor,
} from '@xeprime/types';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { SectionCard } from '@/components/layout/SectionCard';
import { SegmentedTabs } from '@/components/navigation/SegmentedTabs';
import { ROUTES } from '@/constants/routes';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { useStartBookingRequestConversation } from '@/features/booking-requests/hooks/use-booking-request-mutations';
import { saveHandoverDraft } from '@/features/handovers/api';
import { HandoverPhotoGrid } from '@/features/handovers/components/HandoverPhotoGrid';
import { useInvalidateHandovers } from '@/features/handovers/hooks';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { dayjs } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { useSetHandoverPrepCheck } from '../../hooks/use-booking-mutations';
import {
  HANDOVER_PHOTOS_ANCHOR,
  HANDOVER_PREP_ANCHOR,
  useBookingDetailActions,
} from './BookingDetailActions';
import { depositOutstanding, prepRowStates, type PrepKey } from './handover-readiness';
import styles from './BookingDetail.module.css';

type Stage = 'awaitingPickup' | 'renting' | 'completed' | 'cancelled' | 'noShow';

/** Chặng hiển thị của đơn — một nguồn cho chip tiêu đề, stepper và câu tình trạng. */
export function bookingStageOf(status: string): Stage {
  switch (status as BookingStatus) {
    case BOOKING_STATUS.ACTIVE:
      return 'renting';
    case BOOKING_STATUS.COMPLETED:
      return 'completed';
    case BOOKING_STATUS.CANCELLED:
      return 'cancelled';
    case BOOKING_STATUS.NO_SHOW:
      return 'noShow';
    default:
      return 'awaitingPickup';
  }
}

type StepState = 'done' | 'current' | 'todo' | 'failed';

/**
 * Đã xác nhận → Chờ giao xe → Đang thuê → Hoàn thành, mỗi bước kèm MỐC GIỜ (Figma `23845:49956`,
 * 03/11/2026): lúc xác nhận · lúc tiền giữ chỗ về (design ghi "nhận cọc" — đổi theo ADR 0044 điều
 * 9: khoản QR là tiền giữ chỗ, không phải cọc) · giờ phải giao / đã giao · giờ trả / đã nhận lại.
 *
 * Đơn huỷ / khách không đến KHÔNG có thanh bước (Figma "Details - Failed" `23948:99504`, 05/11/2026
 * — thay bước đỏ tự dựng 02/11): chuyến không diễn ra, banner kết cục ngay dưới tiêu đề nói đủ.
 */
export function BookingStepper() {
  const t = useTranslations('Bookings.detailPage');
  const fmt = useAppFormat();
  const { booking, handover } = useBookingDetailActions();
  const stage = bookingStageOf(booking.status);
  const ended = stage === 'cancelled' || stage === 'noShow';
  if (ended) return null;
  // Biên bản do LỜI CỦA KHÁCH (ADR 0081) — thanh bước nói rõ không phải gian hàng đã kiểm xe.
  const pickupByCustomer = handover?.pickup?.confirmSource === HANDOVER_CONFIRM_SOURCE.CUSTOMER;
  const returnAuto = handover?.return?.confirmSource === HANDOVER_CONFIRM_SOURCE.AUTO;
  const at = (
    key:
      | 'confirmed'
      | 'holdPaid'
      | 'pickupDue'
      | 'pickedUp'
      | 'pickedUpByCustomer'
      | 'returnDue'
      | 'returned'
      | 'returnedAuto',
    iso: string,
  ) => t(`stepAt.${key}`, { time: fmt.shortDateTime(iso) });

  const confirmed = {
    key: 'confirmed',
    label: t('stage.confirmed'),
    hint: at('confirmed', booking.confirmedAt),
  };
  const steps: { key: string; label: string; hint: string | null; state: StepState }[] = (
        [
          confirmed,
          {
            key: 'awaitingPickup',
            label: t('stage.awaitingPickup'),
            // Kèm SỐ TIỀN đã về (06/11/2026) — số khách thực chuyển cho XePrime, đọc ở thẻ Thanh toán.
            hint: booking.holdPaidAt
              ? booking.holdPaidAmount
                ? t('stepAt.holdPaidAmount', {
                    amount: fmt.money(booking.holdPaidAmount),
                    time: fmt.shortDateTime(booking.holdPaidAt),
                  })
                : at('holdPaid', booking.holdPaidAt)
              : null,
          },
          {
            key: 'renting',
            label: t('stage.renting'),
            hint: booking.actualPickupAt
              ? at(pickupByCustomer ? 'pickedUpByCustomer' : 'pickedUp', booking.actualPickupAt)
              : at('pickupDue', booking.pickupAt),
          },
          {
            key: 'completed',
            label: t('stage.completed'),
            hint: booking.actualReturnAt
              ? at(returnAuto ? 'returnedAuto' : 'returned', booking.actualReturnAt)
              : at('returnDue', booking.returnAt),
          },
        ] as const
      ).map((step, index) => {
        const current = { awaitingPickup: 1, renting: 2, completed: 3 }[stage];
        const state: StepState =
          index < current || stage === 'completed'
            ? 'done'
            : index === current
              ? 'current'
              : 'todo';
        return { ...step, state };
      });

  return (
    <ol className={styles.stepper} aria-label={t('stepperLabel')}>
      {steps.map((step) => (
        <li
          key={step.key}
          className={cx(styles.step, styles[`step_${step.state}`])}
          aria-current={step.state === 'current' ? 'step' : undefined}
        >
          <span className={styles.stepDot} aria-hidden="true">
            {step.state === 'done' ? (
              <CheckOutlined />
            ) : step.state === 'failed' ? (
              <CloseOutlined />
            ) : null}
          </span>
          <span className={styles.stepLabel}>{step.label}</span>
          {step.hint ? <span className={styles.stepHint}>{step.hint}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/**
 * "CHUẨN BỊ BÀN GIAO" — hai cột việc (Figma `23845:49956`), trạng thái do SERVER suy
 * (`handoverPrep`), nút ở cuối dòng mở đúng hộp thoại đã có. Tuyến hoa hồng không có hai dòng
 * tiền: nền tảng không ghi sổ thu ở tuyến cơ bản (ADR 0028 7A) — cùng cổng với nút "Thu tiền".
 *
 * Tự động + TAY (03/11/2026): giấy tờ, hợp đồng, ảnh, tài xế đánh dấu tay được bằng chính vòng
 * tròn của dòng khi việc diễn ra ngoài hệ thống — dòng ghi rõ ai đánh dấu, lúc nào. Hai việc TIỀN
 * không đánh dấu tay: "Xác nhận đã thu" ghi một phiếu thu thật.
 *
 * Bấm giao xe khi còn thiếu: dòng chưa xong nháy viền đỏ (lượt cảnh báo trong context).
 */
export function HandoverPrepCard() {
  const t = useTranslations('Bookings.detailPage.prep');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const {
    booking,
    can,
    alert,
    openDocuments,
    openPay,
    openDeposit,
    openContract,
    contractPending,
  } = useBookingDetailActions();
  const setCheck = useSetHandoverPrepCheck(booking.id);
  const prep = booking.handoverPrep;
  if (!prep) return null;

  const toggle = (item: HandoverPrepItem, checked: boolean) => {
    if (setCheck.isPending) return;
    setCheck.mutate({ item, checked }, { onError: (err) => message.error(errorMessage(err)) });
  };
  const flagged = new Set<PrepKey>(alert?.type === HANDOVER_TYPE.PICKUP ? alert.prep : []);

  const content: Record<
    PrepKey,
    { title: string; body: React.ReactNode; action?: React.ReactNode }
  > = {
    confirm: {
      title: t('confirm'),
      body: [booking.customerName, booking.customerPhone].filter(Boolean).join(' · '),
      action: <ContactButtons />,
    },
    documents: {
      title: t('documents'),
      body: prep.documentsReady ? t('documentsDone') : t('documentsPending'),
      action: can.documents ? (
        <Button onClick={openDocuments}>{t('documentsAction')}</Button>
      ) : null,
    },
    rent: {
      title: t('rent'),
      body: isZeroMoney(prep.rentDueAmount)
        ? t('rentDone')
        : t.rich('rentPending', {
            amount: fmt.money(prep.rentDueAmount),
            b: (chunks) => <b>{chunks}</b>,
          }),
      action: isZeroMoney(prep.rentDueAmount) ? null : (
        <Button onClick={openPay}>{t('collectAction')}</Button>
      ),
    },
    deposit: {
      title: t('deposit'),
      body: isZeroMoney(depositOutstanding(prep))
        ? t('depositDone', { amount: fmt.money(prep.depositReceived) })
        : isZeroMoney(prep.depositReceived)
          ? t.rich('depositPending', {
              amount: fmt.money(prep.depositRequired),
              b: (chunks) => <b>{chunks}</b>,
            })
          : t.rich('depositPartial', {
              received: fmt.money(prep.depositReceived),
              amount: fmt.money(depositOutstanding(prep)),
              b: (chunks) => <b>{chunks}</b>,
            }),
      action: isZeroMoney(depositOutstanding(prep)) ? null : (
        <Button onClick={openDeposit}>{t('collectAction')}</Button>
      ),
    },
    contract: {
      title: t('contract'),
      body: prep.contractSigned
        ? t('contractSigned')
        : prep.contractId
          ? t('contractDraft')
          : t('contractNone'),
      action: (
        <Button loading={contractPending} onClick={openContract}>
          {prep.contractId ? t('contractView') : t('contractCreate')}
        </Button>
      ),
    },
    photos: {
      title: t('photos'),
      body:
        prep.pickupPhotoCount >= prep.pickupPhotoRequired
          ? t('photosDone')
          : t('photosPending', { count: prep.pickupPhotoCount, total: prep.pickupPhotoRequired }),
      action: can.managePhotos ? (
        <Button
          onClick={() =>
            document
              .getElementById(HANDOVER_PHOTOS_ANCHOR)
              ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
          }
        >
          {t('photosAction')}
        </Button>
      ) : null,
    },
    driver: {
      title: t('driver'),
      body: prep.driverReady ? t('driverDone') : t('driverPending'),
    },
  };

  const rows = prepRowStates(prep, can);
  const done = rows.filter((row) => row.done).length;

  return (
    <SectionCard
      id={HANDOVER_PREP_ANCHOR}
      title={t('title')}
      extra={
        <span className={styles.prepProgress}>
          <span
            className={styles.prepTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={rows.length}
            aria-valuenow={done}
          >
            <span
              className={styles.prepBar}
              // Giá trị chỉ biết lúc chạy — ngoại lệ duy nhất của luật cấm inline style.
              style={{ '--progress': `${(done / rows.length) * 100}%` } as React.CSSProperties}
            />
          </span>
          {t('progress', { done, total: rows.length })}
        </span>
      }
    >
      <ul
        className={styles.prepList}
        // Hai cột đổ theo CỘT (trái hết rồi mới sang phải) — số hàng chỉ biết lúc chạy.
        style={{ '--prep-rows': Math.ceil(rows.length / 2) } as React.CSSProperties}
      >
        {rows.map((row) => {
          const { title, body, action } = content[row.key];
          const isFlagged = !row.done && flagged.has(row.key);
          const manualLabel = row.manual
            ? t('unmark', { item: title })
            : t('markDone', { item: title });
          return (
            <li
              key={row.key}
              className={cx(styles.prepRow, isFlagged && styles.prepFlagged)}
              data-flagged={isFlagged || undefined}
            >
              {row.manualItem && (row.manual || !row.done) && can.markPrep ? (
                <button
                  type="button"
                  className={cx(
                    styles.prepCheck,
                    styles.prepCheckButton,
                    row.done && styles.prepCheckDone,
                  )}
                  aria-pressed={row.manual !== null}
                  aria-label={manualLabel}
                  title={manualLabel}
                  disabled={setCheck.isPending}
                  onClick={() => toggle(row.manualItem!, row.manual === null)}
                >
                  {row.done ? <CheckOutlined aria-hidden="true" /> : null}
                </button>
              ) : (
                <span
                  className={cx(styles.prepCheck, row.done && styles.prepCheckDone)}
                  aria-hidden="true"
                >
                  {row.done ? <CheckOutlined /> : null}
                </span>
              )}
              <span className={styles.prepText}>
                <span className={styles.prepTitle}>{title}</span>
                <span className={styles.prepBody}>{body}</span>
                {row.manual ? (
                  <span className={styles.prepManual}>
                    {row.manual.checkedByName
                      ? t('manualBy', {
                          name: row.manual.checkedByName,
                          time: fmt.shortDateTime(row.manual.checkedAt),
                        })
                      : t('manualByUnknown', { time: fmt.shortDateTime(row.manual.checkedAt) })}
                  </span>
                ) : null}
              </span>
              {action ? <span className={styles.prepAction}>{action}</span> : null}
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

/**
 * Nhắn tin (hội thoại của yêu cầu gốc) · gọi · Zalo — cùng bộ nút với thẻ yêu cầu/thẻ đơn.
 * `labeled` cho hộp Công nợ (design `23872:60767` vẽ ba nút có chữ).
 */
export function ContactButtons({ variant = 'icon' }: { variant?: 'labeled' | 'icon' } = {}) {
  const { booking } = useBookingDetailActions();
  const { has } = usePermissions();
  const router = useRouter();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const chatHidden = useSupportHides(SUPPORT_HIDDEN_AREA.CHAT);
  const start = useStartBookingRequestConversation();
  const requestId = booking.bookingRequestId;
  const canMessage = has(PERMISSION.BOOKING_REQUEST_VIEW) && !chatHidden && Boolean(requestId);

  return (
    <CustomerContactButtons
      variant={variant}
      name={booking.customerName}
      phone={booking.customerPhone}
      onMessage={
        canMessage && requestId
          ? () =>
              start.mutate(requestId, {
                onSuccess: (conversation) =>
                  router.push(`${ROUTES.MANAGE.CHAT}?c=${conversation.id}`),
                onError: (err) => message.error(errorMessage(err)),
              })
          : undefined
      }
      messageUnavailable={!booking.canMessageOnPlatform}
      messageLoading={start.isPending}
      disabled={start.isPending}
    />
  );
}

/**
 * "CHUYẾN ĐI & THỜI GIAN THUÊ" — Nhận xe (giờ hẹn, tiến độ theo giờ xe THẬT rời tay, câu tình
 * trạng) rồi Trả xe, xếp dọc như design `23845:49956`. Mốc thực tế + KM lấy từ biên bản bàn
 * giao đã xác nhận.
 */
export function TripScheduleCard() {
  const t = useTranslations('Bookings.detailPage.trip');
  const fmt = useAppFormat();
  const { booking, handover } = useBookingDetailActions();
  const stage = bookingStageOf(booking.status);
  const pickupDone = booking.actualPickupAt;
  const progress = rentalProgress(booking.actualPickupAt ?? booking.pickupAt, booking.returnAt);
  const percent = stage === 'completed' ? 100 : stage === 'renting' ? progress.percent : 0;
  const late =
    booking.actualReturnAt && new Date(booking.actualReturnAt) > new Date(booking.returnAt);
  const pickupOdo = handover?.pickup?.confirmedAt ? handover.pickup.odometerKm : null;
  const returnOdo = handover?.return?.confirmedAt ? handover.return.odometerKm : null;
  const notes = [handover?.pickup?.notes, handover?.return?.notes].filter(Boolean);
  const overdue = stage === 'renting' && progress.overdueMinutes > 0;

  const pickupLine =
    stage === 'cancelled' || stage === 'noShow'
      ? t('notHappened')
      : stage === 'awaitingPickup'
        ? t('notStarted')
        : pickupDone
          ? [
              t('handedOver', { time: fmt.shortDateTime(pickupDone) }),
              pickupOdo != null ? t('odometer', { km: fmt.km(pickupOdo) }) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null;
  const returnLine =
    stage === 'completed' && booking.actualReturnAt
      ? [
          late
            ? t('returnedLate', { time: fmt.shortDateTime(booking.actualReturnAt) })
            : t('returnedOnTime', { time: fmt.shortDateTime(booking.actualReturnAt) }),
          returnOdo != null ? t('odometer', { km: fmt.km(returnOdo) }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : stage === 'renting'
        ? overdue
          ? t('overdue', { duration: fmt.roughDuration(progress.overdueMinutes) })
          : t('remaining', { duration: fmt.roughDuration(progress.remainingMinutes) })
        : null;

  return (
    <SectionCard title={t('title')} className={styles.fillCard}>
      <div className={styles.tripBlock}>
        <div className={styles.tripHead}>
          <span>{t('pickup')}</span>
          <b>{fmt.rentalPoint(dayjs(booking.pickupAt))}</b>
        </div>
        <span className={styles.tripTrack}>
          <span
            className={cx(styles.tripBar, overdue && styles.tripBarDanger)}
            style={{ '--progress': `${Math.max(percent, 1)}%` } as React.CSSProperties}
          />
        </span>
        {pickupLine ? <p className={styles.tripLine}>{pickupLine}</p> : null}
      </div>
      <div className={styles.tripBlock}>
        <div className={styles.tripHead}>
          <span>{t('return')}</span>
          <b>{fmt.rentalPoint(dayjs(booking.returnAt))}</b>
        </div>
        <p
          className={cx(
            styles.tripLine,
            !returnLine && styles.tripMuted,
            overdue && styles.tripDanger,
          )}
        >
          {returnLine ?? t('notRecorded')}
        </p>
      </div>
      {notes.length > 0 ? (
        <p className={styles.tripNote}>{t('note', { note: notes.join(' · ') })}</p>
      ) : null}
    </SectionCard>
  );
}

/**
 * "THÔNG TIN BÀN GIAO" — hai tab (trước giao / sau nhận) ở đầu khối, năm ô ảnh MỘT hàng có ảnh
 * thu nhỏ (Figma `23845:49956`). Tải ảnh trước khi giao là soạn sẵn biên bản nháp
 * (`ensureHandover` tạo nháp đúng lúc chọn ảnh đầu tiên); sau khi đã xác nhận, tải thêm là BỔ
 * SUNG biên bản. Góc còn thiếu nháy viền đỏ khi bấm giao/nhận xe mà chưa đủ ảnh.
 */
export function HandoverPhotosCard() {
  const t = useTranslations('Bookings.detailPage.photos');
  const { booking, handover, can, closed, alert } = useBookingDetailActions();
  const { has } = usePermissions();
  const invalidate = useInvalidateHandovers(booking.id, booking.vehicleId);
  const pickupConfirmed = Boolean(handover?.pickup?.confirmedAt);
  // Tab mặc định theo chặng, nhưng biên bản bàn giao tải SAU lần render đầu — nên chỉ khoá lựa chọn
  // khi người dùng tự bấm. Lượt cảnh báo thiếu ảnh kéo về đúng tab của chiều đang bàn giao.
  const [picked, setTab] = useState<HandoverType | null>(null);
  if (!can.viewPhotos || !handover) return null;
  const tab =
    alert && alert.slots.length > 0
      ? alert.type
      : (picked ?? (pickupConfirmed ? HANDOVER_TYPE.RETURN : HANDOVER_TYPE.PICKUP));

  const current = tab === HANDOVER_TYPE.PICKUP ? handover.pickup : handover.return;
  const locked = tab === HANDOVER_TYPE.RETURN && !pickupConfirmed;
  const editable = can.managePhotos && !closed && !locked;
  const highlightSlots =
    alert && alert.type === tab && alert.slots.length > 0
      ? new Set<string>(alert.slots)
      : undefined;

  return (
    <SectionCard
      title={t('title')}
      id={HANDOVER_PHOTOS_ANCHOR}
      extra={
        <SegmentedTabs
          label={t('title')}
          value={tab}
          onChange={setTab}
          items={[
            { value: HANDOVER_TYPE.PICKUP, label: t('before') },
            { value: HANDOVER_TYPE.RETURN, label: t('after') },
          ]}
        />
      }
    >
      {locked ? (
        <p className={styles.photoHint}>{t('afterLocked')}</p>
      ) : (
        <>
          <HandoverPhotoGrid
            key={tab}
            variant="row"
            vehicleType={booking.vehicleType}
            bookingId={booking.id}
            type={tab}
            photos={current?.photos ?? []}
            canViewFiles={has(PERMISSION.HANDOVER_FILE_VIEW)}
            disabled={!editable}
            highlightSlots={highlightSlots}
            ensureHandover={
              current
                ? undefined
                : async () => {
                    await saveHandoverDraft(booking.id, tab, {});
                    invalidate();
                  }
            }
            onChanged={() => invalidate()}
          />
          <p className={styles.photoHint}>
            {closed
              ? t('readOnly')
              : tab === HANDOVER_TYPE.PICKUP
                ? t('hintBefore')
                : t('hintAfter')}
          </p>
        </>
      )}
    </SectionCard>
  );
}

/**
 * Banner kết cục của đơn đã khép — hoàn thành nói số đã vào ví (khi có); huỷ nói LÝ DO (nhóm lý do +
 * câu gửi khách của `booking_cancellations`, Figma "Details - Failed" 05/11/2026), đơn cũ không có
 * dòng trách nhiệm thì câu chung.
 */
export function BookingOutcomeBanner() {
  const t = useTranslations('Bookings.detailPage');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { booking } = useBookingDetailActions();
  const stage = bookingStageOf(booking.status);
  if (stage === 'completed') {
    const payable = booking.ownerPayout?.ownerPayableAmount;
    return (
      <Alert
        type="success"
        className={styles.banner}
        title={
          payable && !isZeroMoney(payable)
            ? t('completedBanner', { amount: fmt.money(payable) })
            : t('completedBannerPlain')
        }
      />
    );
  }
  if (stage === 'cancelled' || stage === 'noShow') {
    const reason = [
      booking.cancellationReasonCategory
        ? domainLabel('cancellationReasonCategory', booking.cancellationReasonCategory)
        : null,
      booking.cancellationReason?.trim() || null,
    ]
      .filter(Boolean)
      .join(' - ');
    return (
      <Alert
        type="error"
        className={styles.banner}
        title={
          stage === 'noShow'
            ? t('noShowBanner')
            : reason
              ? t('cancelledBannerWithReason', { reason })
              : t('cancelledBanner')
        }
      />
    );
  }
  return null;
}

const STAGE_COLOR: Record<Stage, StatusColor> = {
  awaitingPickup: STATUS_COLOR.WARNING,
  renting: STATUS_COLOR.INFO,
  completed: STATUS_COLOR.SUCCESS,
  cancelled: STATUS_COLOR.DANGER,
  noShow: STATUS_COLOR.DANGER,
};

/**
 * Chip chặng ở tiêu đề — cùng nhãn với stepper, cùng sắc với thẻ danh sách đơn. Đơn huỷ nói AI huỷ
 * ("Khách hàng đã huỷ" / "Bạn đã huỷ" — design "Details - Failed"), cùng nhãn kết cục với màn "Đơn đã
 * kết thúc"; phía huỷ do SERVER suy (ADR 0045 điều 2).
 */
export function BookingStageChip({
  status,
  cancellationParty,
}: {
  status: string;
  cancellationParty?: string | null;
}) {
  const t = useTranslations('Bookings.detailPage.stage');
  const domainLabel = useDomainLabel();
  const stage = bookingStageOf(status);
  const label =
    stage === 'cancelled' && cancellationParty === CANCELLATION_PARTY.CUSTOMER
      ? domainLabel('bookingHistoryOutcome', BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER)
      : stage === 'cancelled' && cancellationParty === CANCELLATION_PARTY.HOST
        ? domainLabel('bookingHistoryOutcome', BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST)
        : t(stage);
  return <ToneDotBadge color={STAGE_COLOR[stage]}>{label}</ToneDotBadge>;
}
