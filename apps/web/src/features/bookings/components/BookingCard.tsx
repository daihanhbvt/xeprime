'use client';

import { SyncOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  shortAddress,
  DATE_TIME_SEPARATOR,
  isLateReturn,
  isPositiveMoney,
  PICKUP_URGENCY,
  pickupUrgency,
  rentalProgress,
} from '@xeprime/domain';
import {
  BOOKING_HANDOVER_PLACE,
  BOOKING_HANDOVER_PLACE_VALUES,
  BOOKING_LIST_PRESET,
  BOOKING_STATUS,
  canTransitionBooking,
  HANDOVER_STATUS,
  isCancellationParty,
  isNoShowGracePassed,
  PERMISSION,
  SERVICE_TYPE,
  type BookingHandoverPlace,
  type BookingStatus,
  type BookingListPreset,
} from '@xeprime/types';
import { ServiceTypeChip } from '@/components/data-display/ServiceTypeChip';
import { LineIcon } from '@/components/icons/LineIcon';
import { bookingPath, vehiclePath } from '@/constants/routes';
import { withBranchReturn } from '@/features/branches/branch-link';
import { CustomerContactButtons } from '@/features/booking-requests/components/CustomerContactButtons';
import { CustomerIdentity } from '@/features/booking-requests/components/CustomerIdentity';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { toAppTz } from '@/lib/datetime';
import type { BookingListItem } from '../types';
import {
  RentalCard,
  RentalCardDetailButton,
  RentalFact,
  RentalFacts,
  type RentalCardLayout,
} from './rental-card/RentalCard';
import {
  RentalBoardAddress,
  RentalBoardCard,
  RentalBoardPeriod,
  RentalBoardProgress,
  type RentalBoardFact,
  type RentalBoardHold,
  type RentalBoardMoney,
} from './rental-card/RentalBoardCard';
import styles from './BookingCard.module.css';

/** Còn ít hơn chừng này tới giờ trả thì câu tình trạng đổi sang sắc cảnh báo. */
const RETURN_SOON_MINUTES = 120;

type Tone = 'muted' | 'warning' | 'danger';

/**
 * Trang chi tiết của một đơn, mang chi nhánh đang lọc làm đường về (ADR 0052) — đích của "Xử lý giao
 * xe" / "Nhận xe" / "Chi tiết" trên thẻ, và của lượt THẢ thẻ "Chờ giao xe" sang "Đang thuê" ở Kanban.
 */
export function bookingCardDetailHref(bookingId: string, branchId: string | undefined): string {
  return withBranchReturn(bookingPath.detail(bookingId), branchId);
}

/**
 * MỘT đơn thuê trên màn "Đơn thuê xe" gộp — nhóm "Chờ giao xe" và "Đang thuê" (Figma Partner-XePrime
 * "Rental Request - List" `23973:51952`, 05/11/2026). CÙNG khung `RentalCard` với thẻ YÊU CẦU.
 *
 * Dải đầu: mã đơn · loại dịch vụ bên trái; bên phải là câu tình trạng của NHÓM (giao xe hôm nay ·
 * quá giờ giao · còn bao lâu tới giờ trả + thanh tiến độ) và hành động. Thân: xe · khách · ô lịch ·
 * ô tiền (tiền thuê · khách trả · đã giữ chỗ · trả chủ xe khi nhận xe).
 *
 * "Xử lý giao xe" mở TRANG CHI TIẾT — nơi soát việc còn thiếu (Chuẩn bị bàn giao) rồi mới bấm xác
 * nhận (03/11/2026, sổ cái §3.2). "Nhận xe" mở thẳng hộp "Xác nhận đã nhận lại xe" (06/11/2026).
 */
export function BookingCard({
  booking,
  group,
  branchId,
  canHandle,
  onMessage,
  onExtend,
  onNoShow,
  onReceive,
  messagePending,
  busy,
  backHref,
  layout = 'list',
  dragHandle,
}: {
  booking: BookingListItem;
  group: BookingListPreset;
  /** Chi nhánh đang lọc — mang sang trang chi tiết làm đường về (ADR 0052). */
  branchId: string | undefined;
  /** Được xác nhận bàn giao (và không trong phiên hỗ trợ) — có nút "Xử lý giao xe"/"Nhận xe". */
  canHandle: boolean;
  /** Mở hội thoại với khách. Vắng ⇒ không có nút Nhắn tin. */
  onMessage?: () => void;
  /**
   * Mở hộp "Gia hạn thuê xe" (ADR 0077). Vắng ⇒ không có quyền sửa đơn / đang trong phiên hỗ trợ.
   * Nút chỉ hiện ở đơn DÀI HẠN đang thuê — server vẫn chặn mọi trường hợp khác.
   */
  onExtend?: () => void;
  /**
   * Mở hộp ghi nhận "Khách không đến". Vắng ⇒ không có quyền sửa đơn / đang trong phiên hỗ trợ. Nút
   * chỉ hiện ở thẻ "Chờ giao xe" đã qua ân hạn mà chưa giao xe — cùng ba điều kiện server kiểm.
   */
  onNoShow?: () => void;
  /**
   * Mở hộp "Xác nhận đã nhận lại xe" (06/11/2026). Chỉ dùng khi `canHandle` ở thẻ "Đang thuê"; vắng ⇒
   * nút "Nhận xe" về trang chi tiết như trước.
   */
  onReceive?: () => void;
  messagePending: boolean;
  busy: boolean;
  /** Đường quay lại đúng chỗ đang đứng, gắn vào link "Xem lịch xe". */
  backHref: string;
  /** `board` = thẻ trong cột Kanban (câu tình trạng + nút ở chân thẻ). */
  layout?: RentalCardLayout;
  /** Tay nắm kéo thả — chỉ khi thẻ kéo được sang bước kế (bảng Kanban quyết). */
  dragHandle?: React.ReactNode;
}) {
  const t = useTranslations('Bookings.board');
  const tBookings = useTranslations('Bookings');
  const tExtension = useTranslations('Bookings.extension');
  const tRequests = useTranslations('BookingRequests');
  const tKanban = useTranslations('Bookings.board.kanban');
  const fmt = useAppFormat();
  const router = useRouter();
  const { has } = usePermissions();
  const specs = useListingSpecSummary(booking);
  const titleId = `booking-${booking.id}-title`;
  const detailHref = bookingCardDetailHref(booking.id, branchId);
  const status = statusLine(booking, group, t, fmt);
  const progress = group === BOOKING_LIST_PRESET.RENTING ? rentingProgress(booking) : null;
  const canViewVehicle = has(PERMISSION.VEHICLE_VIEW);
  const extendable =
    onExtend !== undefined &&
    group === BOOKING_LIST_PRESET.RENTING &&
    booking.serviceType === SERVICE_TYPE.LONG_TERM &&
    // Chỉ đơn đặt qua chợ: đơn tự lập không có tài khoản khách nhận QR / tiền hoàn (ADR 0077).
    booking.bookingRequestId != null;
  /*
   * "Khách không đến" ngay trên thẻ (05/11/2026) — trước chỉ ở trang chi tiết, nên đơn quá giờ giao
   * nằm mãi ở "Chờ giao xe". Đúng bộ điều kiện của `BookingStatusActions`: máy trạng thái còn cạnh
   * `→ no_show`, đã qua ân hạn, chưa có biên bản giao xe đã xác nhận.
   */
  const noShowable =
    onNoShow !== undefined &&
    group === BOOKING_LIST_PRESET.AWAITING_PICKUP &&
    canTransitionBooking(booking.status as BookingStatus, BOOKING_STATUS.NO_SHOW) &&
    isNoShowGracePassed(booking.pickupAt) &&
    booking.pickupHandoverStatus !== HANDOVER_STATUS.CONFIRMED;

  const pickup = toAppTz(booking.pickupAt);
  const dropoff = toAppTz(booking.returnAt);
  const place = (BOOKING_HANDOVER_PLACE_VALUES as readonly string[]).includes(
    booking.handoverPlaceKind ?? '',
  )
    ? (booking.handoverPlaceKind as BookingHandoverPlace)
    : null;
  const plateLine = booking.vehiclePlate ?? null;

  const meta = (
    <>
      <RentalCardDetailButton
        onClick={() => router.push(detailHref)}
        ariaLabel={t('openDetail', { code: booking.code })}
      >
        #{booking.code}
      </RentalCardDetailButton>
      <ServiceTypeChip value={booking.serviceType} />
    </>
  );

  /*
   * Hành động đổi trang là LINK có hình nút (một `<button>` nằm trong `<a>` là HTML sai); hành động
   * mở hộp là `<button>`.
   */
  const statusNode = (
    <p className={cx(styles.status, styles[status.tone])}>
      <LineIcon name="time-circle" className={styles.statusIcon} />
      {status.text}
    </p>
  );

  const actions = (
    <>
      {noShowable ? (
        <button
          type="button"
          className={cx(styles.action, styles.detail)}
          onClick={onNoShow}
          disabled={busy}
        >
          {t('noShowAction')}
        </button>
      ) : null}
      {group === BOOKING_LIST_PRESET.AWAITING_PICKUP ? (
        canHandle ? (
          <Link href={detailHref} className={cx(styles.action, styles.handle)}>
            {t('handlePickup')}
          </Link>
        ) : (
          <Link href={detailHref} className={cx(styles.action, styles.detail)}>
            {t('viewDetailShort')}
          </Link>
        )
      ) : (
        <>
          <Link href={detailHref} className={cx(styles.action, styles.detail)}>
            {t('viewDetailShort')}
          </Link>
          {/*
            Design đặt "Gia hạn" vào chỗ "Nhận xe" trên thẻ dài hạn; ta giữ CẢ HAI — nhận xe về vẫn
            là việc thường ngày của đơn dài hạn (sổ cái §3.2 dòng 12).
          */}
          {extendable ? (
            <button
              type="button"
              className={cx(styles.action, styles.extend)}
              onClick={onExtend}
              disabled={busy}
            >
              <SyncOutlined aria-hidden="true" className={styles.buttonIcon} />
              {tExtension('action')}
            </button>
          ) : null}
          {/*
            "Nhận xe" mở THẲNG hộp "Xác nhận đã nhận lại xe" (Figma `23941:65305`, 06/11/2026) — hộp tự
            chụp ảnh, ghi phụ phí và thu tiền. Không có hộp (nơi gọi không cấp) thì về trang chi tiết.
          */}
          {canHandle && group === BOOKING_LIST_PRESET.RENTING ? (
            onReceive ? (
              <button
                type="button"
                className={cx(styles.action, styles.receive)}
                onClick={onReceive}
                disabled={busy}
              >
                {t('receiveBack')}
              </button>
            ) : (
              <Link href={detailHref} className={cx(styles.action, styles.receive)}>
                {t('receiveBack')}
              </Link>
            )
          ) : null}
        </>
      )}
    </>
  );

  const vehicle = {
    name: booking.vehicleName,
    imageUrl: booking.vehicleImageUrl,
    specs,
    plateLine,
    href: canViewVehicle ? vehiclePath.detail(booking.vehicleId) : null,
    noImageLabel: tRequests('vehicle.noImage'),
    schedule: canViewVehicle
      ? {
          href: vehicleSchedulePath(
            { name: booking.vehicleName, plateNumber: booking.vehiclePlate },
            { back: backHref, branchId },
          ),
          label: tRequests('vehicle.viewSchedule'),
          ariaLabel: tRequests('vehicle.viewScheduleFor', { vehicle: booking.vehicleName }),
        }
      : null,
  };
  const contacts = (
    <CustomerContactButtons
      variant="icon"
      compact={layout === 'board'}
      name={booking.customerName}
      phone={booking.customerPhone}
      onMessage={onMessage}
      messageUnavailable={!booking.canMessageOnPlatform}
      messageLoading={messagePending}
      disabled={busy}
    />
  );
  const durationLabel =
    booking.serviceType === SERVICE_TYPE.LONG_TERM && booking.longTermPackageMonths
      ? fmt.packageLabel(booking.longTermPackageMonths)
      : fmt.rentalDuration(pickup, dropoff);

  if (layout === 'board') {
    return (
      <RentalBoardCard
        titleId={titleId}
        busy={busy}
        handle={dragHandle}
        code={
          <RentalCardDetailButton
            onClick={() => router.push(detailHref)}
            ariaLabel={t('openDetail', { code: booking.code })}
          >
            #{booking.code}
          </RentalCardDetailButton>
        }
        chip={<ServiceTypeChip value={booking.serviceType} />}
        vehicle={vehicle}
        customer={{
          identity: (
            <CustomerIdentity
              size="sm"
              name={booking.customerName}
              nameSource={booking.customerName}
              phone={booking.customerPhone}
              avatarUrl={booking.customerAvatarUrl}
            />
          ),
          contacts,
        }}
        schedule={[
          {
            key: 'period',
            label: tKanban('schedule.period'),
            value: <RentalBoardPeriod from={pickup} to={dropoff} />,
          },
          ...(booking.serviceType === SERVICE_TYPE.LONG_TERM && booking.longTermPackageMonths
            ? [{ key: 'package', label: tRequests('card.package'), value: durationLabel }]
            : []),
          ...(place ? [bookingBoardPlace(booking, place, tKanban)] : []),
        ]}
        {...bookingBoardMoney(booking, tKanban)}
        progress={
          progress ? (
            <RentalBoardProgress
              percent={progress.percent}
              tone={progress.tone}
              label={status.text}
            />
          ) : undefined
        }
        status={statusNode}
        actions={actions}
        onOpenDetail={() => router.push(detailHref)}
      />
    );
  }

  const aside = (
    <>
      {progress ? (
        <span
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-label={status.text}
        >
          <span
            className={cx(styles.bar, styles[progress.tone])}
            // Giá trị chỉ biết lúc chạy — ngoại lệ duy nhất được phép của luật cấm inline style.
            style={{ '--progress': `${progress.percent}%` } as React.CSSProperties}
          />
        </span>
      ) : null}
      {statusNode}
      {actions}
    </>
  );

  return (
    <RentalCard
      titleId={titleId}
      busy={busy}
      meta={meta}
      aside={aside}
      onOpenDetail={() => router.push(detailHref)}
      vehicle={vehicle}
      customer={
        <>
          <div className={styles.customerTop}>
            <span className={styles.zoneLabel}>{t('customer')}</span>
            <CustomerIdentity
              name={booking.customerName}
              nameSource={booking.customerName}
              phone={booking.customerPhone}
              avatarUrl={booking.customerAvatarUrl}
            />
          </div>
          {contacts}
        </>
      }
      schedule={
        <RentalFacts>
          <RentalFact label={tRequests('card.pickupAt')}>{fmt.rentalPoint(pickup)}</RentalFact>
          <RentalFact label={tRequests('card.returnAt')}>{fmt.rentalPoint(dropoff)}</RentalFact>
          <RentalFact label={tRequests('card.duration')}>{durationLabel}</RentalFact>
          {place ? (
            <RentalFact label={tRequests('card.handover')}>
              {tBookings(`detailPage.side.place.${place}`)}
            </RentalFact>
          ) : null}
        </RentalFacts>
      }
      payment={
        <RentalFacts>
          {bookingPaymentRows(booking, t).map((row) => (
            <RentalFact key={row.key} label={row.label} money emphasis={row.emphasis}>
              {fmt.money(row.amount)}
            </RentalFact>
          ))}
        </RentalFacts>
      }
    />
  );
}

/**
 * Ô "Thanh toán" của thẻ đơn. Đơn đặt qua chợ (có snapshot phí): tiền thuê · khách trả · đã giữ chỗ
 * (số khách THỰC CHUYỂN cho XePrime) · trả chủ xe khi nhận xe. Đơn tự lập ngoài chợ không có khoản
 * giữ chỗ: tiền thuê · đã thu · còn phải thu (công nợ) — đúng ba con số người trực cần trước khi
 * giao xe.
 */
function bookingPaymentRows(
  booking: BookingListItem,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
): { key: string; label: string; amount: string; emphasis?: boolean }[] {
  const rows: { key: string; label: string; amount: string; emphasis?: boolean }[] = [
    { key: 'rental', label: t('money.rental'), amount: booking.totalAmount },
  ];
  if (booking.customerTotalAmount && booking.customerTotalAmount !== booking.totalAmount) {
    rows.push({
      key: 'customer',
      label: t('money.customerTotal'),
      amount: booking.customerTotalAmount,
    });
  }
  if (booking.holdPaidAmount != null) {
    rows.push({ key: 'hold', label: t('money.holdPaid'), amount: booking.holdPaidAmount });
  }
  if (booking.payAtPickupAmount != null) {
    rows.push({ key: 'pickup', label: t('money.payAtPickup'), amount: booking.payAtPickupAmount });
    return rows;
  }
  rows.push({ key: 'collected', label: t('money.collected'), amount: booking.collectedAmount });
  if (isPositiveMoney(booking.debtAmount)) {
    rows.push({ key: 'debt', label: t('money.debt'), amount: booking.debtAmount, emphasis: true });
  }
  return rows;
}

type KanbanT = ReturnType<typeof useTranslations<'Bookings.board.kanban'>>;

/**
 * Dòng NƠI ĐỔI TAY của ô lịch thẻ gọn — nhãn theo hình thức (chốt 10/11/2026, design bỏ dòng "Hình
 * thức nhận xe"): giao tận nơi "Giao xe tới" + địa chỉ khách · có tài xế "Điểm đón" · khách tự tới
 * "Nhận tại" + địa chỉ chi nhánh / hồ sơ gian hàng (`pickupPointAddress`), chưa có thì tên chi
 * nhánh. Địa chỉ gọn: bỏ tỉnh/TP và chữ "Phường/Xã" (`shortAddress`).
 */
function bookingBoardPlace(
  booking: BookingListItem,
  place: BookingHandoverPlace,
  t: KanbanT,
): RentalBoardFact {
  const label =
    place === BOOKING_HANDOVER_PLACE.DELIVERY
      ? t('schedule.placeDelivery')
      : place === BOOKING_HANDOVER_PLACE.DRIVER_PICKUP
        ? t('schedule.placeDriverPickup')
        : t('schedule.placeBranch');
  const address = shortAddress(
    place === BOOKING_HANDOVER_PLACE.BRANCH
      ? (booking.pickupPointAddress ?? booking.handoverPlace)
      : booking.handoverPlace,
  );
  return {
    key: 'place',
    label,
    value: address ? <RentalBoardAddress text={address} /> : t('schedule.placeUnknown'),
  };
}

/**
 * Hàng tiền của thẻ gọn, góc nhìn CHỦ XE (chốt 10/11/2026) — KHÔNG có ô "Tiền thuê" (tiền thuê ở
 * trang chi tiết và thẻ List) và không lặp "Khách trả" (đã là số vàng ở dải đầu). Đơn qua chợ: giữ
 * chỗ (viên "Đã thanh toán" ở dải đầu — đơn chỉ ra đời khi tiền về ĐỦ, ADR 0044) · thu khi giao xe
 * · cộng ví (`D − T` đóng băng). Đơn tự lập: đã thu · còn phải thu (tô đậm khi còn nợ).
 */
function bookingBoardMoney(
  booking: BookingListItem,
  t: KanbanT,
): { total: RentalBoardMoney; money: RentalBoardMoney[]; hold: RentalBoardHold | null } {
  const customer: RentalBoardMoney = {
    key: 'customer',
    label: t('money.customerTotal'),
    amount: booking.customerTotalAmount ?? booking.totalAmount,
  };
  if (booking.payAtPickupAmount != null) {
    const held = booking.holdPaidAmount != null;
    return {
      total: customer,
      money: [
        ...(held
          ? [{ key: 'hold', label: t('money.hold'), amount: booking.holdPaidAmount as string }]
          : []),
        { key: 'pickup', label: t('money.payAtPickup'), amount: booking.payAtPickupAmount },
        ...(held && booking.ownerPayableAmount != null
          ? [
              {
                key: 'walletCredit',
                label: t('money.walletCredit'),
                amount: booking.ownerPayableAmount,
              },
            ]
          : []),
      ],
      hold: held
        ? { label: t('money.hold'), state: 'paid', stateLabel: t('holdState.paid') }
        : null,
    };
  }
  return {
    total: customer,
    money: [
      { key: 'collected', label: t('money.collected'), amount: booking.collectedAmount },
      {
        key: 'debt',
        label: t('money.debt'),
        amount: booking.debtAmount,
        emphasis: isPositiveMoney(booking.debtAmount),
      },
    ],
    hold: null,
  };
}

/** Đang thuê: đo từ lúc xe THẬT SỰ rời tay; quá giờ trả thì đỏ. */
function rentingProgress(booking: BookingListItem): { percent: number; tone: 'info' | 'danger' } {
  const { percent, overdueMinutes } = rentalProgress(
    booking.actualPickupAt ?? booking.pickupAt,
    booking.returnAt,
  );
  return { percent, tone: overdueMinutes > 0 ? 'danger' : 'info' };
}

/** Câu tình trạng ở dải đầu — mỗi nhóm trả lời đúng câu hỏi của nhóm đó. */
function statusLine(
  booking: BookingListItem,
  group: BookingListPreset,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
  fmt: ReturnType<typeof useAppFormat>,
): { text: string; tone: Tone } {
  switch (group) {
    case BOOKING_LIST_PRESET.AWAITING_PICKUP: {
      // Đã qua cả giờ TRẢ mà chưa ai xác nhận giao xe: chuyến hoặc đã diễn ra (quên lập biên bản),
      // hoặc khách không đến — cả hai đều phải được khép, không được nằm im ở cột này.
      if (Date.now() >= new Date(booking.returnAt).getTime()) {
        return {
          text: t('pickupNeverConfirmed', { date: fmt.rentalPoint(toAppTz(booking.returnAt)) }),
          tone: 'danger',
        };
      }
      const urgency = pickupUrgency(booking.pickupAt);
      const time = fmt.time(booking.pickupAt);
      if (urgency === PICKUP_URGENCY.OVERDUE)
        return { text: t('pickupOverdue', { time }), tone: 'danger' };
      if (urgency === PICKUP_URGENCY.TODAY)
        return { text: t('pickupToday', { time }), tone: 'warning' };
      return {
        text: t('pickupUpcoming', {
          date: fmt.dayMonth(booking.pickupAt),
          time,
          sep: DATE_TIME_SEPARATOR,
        }),
        tone: 'muted',
      };
    }
    case BOOKING_LIST_PRESET.RENTING: {
      // Khách đã báo trả xe ở trang chuyến (ADR 0081) — việc của gian hàng là xác nhận trước hạn.
      if (booking.customerReturnedAt && booking.returnAutoCompleteAt) {
        return {
          text: t('customerReturned', {
            time: fmt.time(booking.customerReturnedAt),
            deadline: fmt.rentalPoint(toAppTz(booking.returnAutoCompleteAt)),
          }),
          tone: 'warning',
        };
      }
      const { remainingMinutes, overdueMinutes } = rentalProgress(
        booking.actualPickupAt ?? booking.pickupAt,
        booking.returnAt,
      );
      if (overdueMinutes > 0) {
        return {
          text: t('overdueReturn', { duration: fmt.roughDuration(overdueMinutes) }),
          tone: 'danger',
        };
      }
      return {
        text: t('remaining', { remaining: fmt.roughDuration(remainingMinutes) }),
        tone: remainingMinutes <= RETURN_SOON_MINUTES ? 'warning' : 'muted',
      };
    }
    case BOOKING_LIST_PRESET.COMPLETED:
      return isLateReturn(booking.returnAt, booking.actualReturnAt)
        ? { text: t('returnedLate'), tone: 'warning' }
        : { text: t('returnedOnTime'), tone: 'muted' };
    default: {
      if (booking.status === BOOKING_STATUS.NO_SHOW) return { text: t('noShow'), tone: 'danger' };
      const party = booking.cancellationParty;
      return {
        text: party && isCancellationParty(party) ? t(`cancelledBy.${party}`) : t('cancelled'),
        tone: 'danger',
      };
    }
  }
}
