'use client';

import { DollarCircleOutlined, FileTextOutlined, ProfileOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { API_ERROR_CODE, PERMISSION } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { SectionCard } from '@/components/layout/SectionCard';
import { InfoHint } from '@/components/data-display/InfoHint';
import { SettlementCard } from '@/features/settlement/components/SettlementCard';
import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isZeroMoney } from '@/lib/money';
import { getErrorCode } from '@/services/api-client';
import { useBooking } from '../hooks/use-booking';
import type { BookingDetail } from '../types';
import { BookingExtensionsPanel } from './BookingExtensionsPanel';
import { BookingInsuranceCertificatesPanel } from './BookingInsuranceCertificatesPanel';
import { OwnerPayoutTable } from './OwnerPayoutTable';
import {
  BookingDetailActionsProvider,
  useBookingDetailActions,
} from './detail/BookingDetailActions';
import {
  BookingOutcomeBanner,
  BookingStepper,
  HandoverPhotosCard,
  HandoverPrepCard,
  TripScheduleCard,
} from './detail/BookingDetailSections';
import {
  CustomerSideCard,
  DriverSideCard,
  PaymentSideCard,
  SideActions,
  VehicleSideCard,
} from './detail/BookingDetailSide';
import { CollateralSideCard } from './detail/CollateralSideCard';
import styles from './detail/BookingDetail.module.css';

/**
 * Toàn bộ nội dung có thẩm quyền của MỘT đơn thuê — Figma Partner-XePrime "Chi tiết đơn"
 * (`23768:29928` chờ giao · `23777:48710` đang thuê · `23777:52626` hoàn thành, 02/11/2026).
 *
 * Dùng CHUNG cho trang `/bookings/[id]` và hộp chi tiết trên LỊCH (bài học Wave 10: hai bản chi
 * tiết là một bản bị bỏ quên). Nơi gọi truyền `renderHeader` để dựng đầu trang của riêng nó với
 * cụm nút hành động; mọi hộp thoại sống trong `BookingDetailActionsProvider` — một bản duy nhất.
 *
 * Bố cục (design 03/11/2026, `23845:49956`): cột chính (stepper có mốc giờ · chuẩn bị bàn giao ·
 * chuyến đi | phát sinh · ảnh bàn giao · lợi nhuận · bảo hiểm · gia hạn) · cột phải (xe · tài xế ·
 * khách · thanh toán · hành động). Màn hẹp xếp một cột, cột phải lên trước (xem CSS).
 *
 * PII: khách chỉ hiện khi có `bookings.view` — guard backend vẫn là lớp thật.
 */
export function BookingDetailContent({
  bookingId,
  onNotFoundAction,
  renderHeader,
}: {
  bookingId: string;
  /** Nút thoát khi đơn không còn (trang: về danh sách · modal: đóng). */
  onNotFoundAction?: { label: string; onClick: () => void };
  /** Đầu trang của nơi gọi, nhận cụm nút hành động đã dựng sẵn. */
  renderHeader?: (booking: BookingDetail, actions: React.ReactNode) => React.ReactNode;
}) {
  const t = useTranslations('Bookings');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const canView = has(PERMISSION.BOOKING_VIEW);
  const { data, isLoading, isError, error, refetch } = useBooking(canView ? bookingId : null);

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={t('detail.forbiddenTitle')}
        description={t('detail.forbiddenBody')}
        missingPermissions={[PERMISSION.BOOKING_VIEW]}
      />
    );
  }

  if (isLoading) {
    return (
      <div className={styles.loading}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !data) {
    // Đơn bị xoá và lỗi mạng là hai chuyện khác nhau — không mời "thử lại" cho cái đã biến mất.
    const notFound = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <EmptyState
        variant={notFound ? 'empty' : 'error'}
        title={notFound ? t('detail.notFoundTitle') : t('detail.errorTitle')}
        description={notFound ? t('detail.notFoundBody') : errorMessage(error)}
        action={
          notFound && onNotFoundAction ? (
            <Button onClick={onNotFoundAction.onClick}>{onNotFoundAction.label}</Button>
          ) : !notFound ? (
            <Button type="primary" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <BookingDetailActionsProvider booking={data}>
      <BookingDetailBody renderHeader={renderHeader} />
    </BookingDetailActionsProvider>
  );
}

function BookingDetailBody({
  renderHeader,
}: {
  renderHeader?: (booking: BookingDetail, actions: React.ReactNode) => React.ReactNode;
}) {
  const t = useTranslations('Bookings');
  const { booking, moneyClosed } = useBookingDetailActions();
  const actions = <HeaderActions />;

  return (
    <div className={styles.page}>
      {renderHeader ? (
        renderHeader(booking, actions)
      ) : (
        <div className={styles.headerActions}>{actions}</div>
      )}
      <div className={styles.layout}>
        <div className={styles.main}>
          <BookingStepper />
          <BookingOutcomeBanner />
          <HandoverPrepCard />
          {/* Chuyến đi · Phát sinh đứng cạnh nhau (Figma 23845:49956); màn hẹp xếp chồng. */}
          <div className={styles.pairRow}>
            <TripScheduleCard />
            <SettlementCard
              bookingId={booking.id}
              canView
              serviceType={booking.serviceType}
              moneyClosed={moneyClosed}
              className={styles.fillCard}
            />
          </div>
          <HandoverPhotosCard />
          {booking.ownerPayout ? (
            <SectionCard
              title={t('detailPage.profit.title')}
              className={styles.profitCard}
              // "Số đã chốt lúc đặt…" thành dấu "i" cạnh tiêu đề - rê chuột mới hiện (người dùng 20/11/2026).
              extra={
                <InfoHint
                  content={t('money.ownerEconomics.note')}
                  label={t('detailPage.profit.title')}
                />
              }
            >
              <OwnerPayoutTable
                payout={booking.ownerPayout}
                label={t('detailPage.profit.title')}
                phoneCard
              />
            </SectionCard>
          ) : null}
          {/* Bảo hiểm chuyến (ADR 0064) và phụ lục gia hạn (ADR 0077) — tự ẩn khi không có. */}
          <BookingInsuranceCertificatesPanel bookingId={booking.id} enabled />
          <BookingExtensionsPanel booking={booking} />
        </div>
        <aside className={styles.side}>
          <VehicleSideCard />
          <DriverSideCard />
          <CustomerSideCard />
          {/* Cọc tiền + tài sản thế chấp theo đơn (ADR 0109) — tự ẩn khi không có gì để giữ. */}
          <CollateralSideCard />
          <PaymentSideCard />
          <SideActions />
        </aside>
      </div>
    </div>
  );
}

/** Cụm nút đầu trang: hợp đồng · lịch sử thu tiền · thu tiền (đều theo quyền + gói). */
function HeaderActions() {
  const t = useTranslations('Bookings.detailPage.actions');
  const { booking, can, contractPending, openContract, openHistory, openPay } =
    useBookingDetailActions();
  // Cùng số với hộp Thu tiền và ô "Còn phải thu của khách": phần `D` khách đã trả trước qua
  // XePrime không còn là việc phải thu ở quầy.
  const hasDebt = !isZeroMoney(booking.counterDueAmount);
  const contractKnown = booking.handoverPrep ? booking.handoverPrep.contractId !== null : true;

  return (
    <div className={styles.headerButtons}>
      {can.contract ? (
        <Button
          className={styles.headerBtn}
          icon={<FileTextOutlined aria-hidden />}
          loading={contractPending}
          onClick={openContract}
        >
          {contractKnown ? t('viewContract') : t('createContract')}
        </Button>
      ) : null}
      {can.history ? (
        <Button
          className={styles.headerBtn}
          icon={<ProfileOutlined aria-hidden />}
          onClick={openHistory}
        >
          {t('moneyHistory')}
        </Button>
      ) : null}
      {can.collect ? (
        <Button
          type="primary"
          className={styles.headerBtn}
          icon={<DollarCircleOutlined aria-hidden />}
          disabled={!hasDebt}
          onClick={openPay}
        >
          {hasDebt ? t('collect') : t('collected')}
        </Button>
      ) : null}
    </div>
  );
}
