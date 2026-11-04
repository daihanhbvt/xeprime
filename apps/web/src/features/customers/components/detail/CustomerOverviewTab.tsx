'use client';

import {
  CalendarOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BOOKING_STATUS, PERMISSION, PLAN_FEATURE } from '@xeprime/types';
import { SectionCard } from '@/components/layout/SectionCard';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { isZeroMoney } from '@/lib/money';
import type { CustomerBooking, TenantCustomerDetail } from '../../types';
import { BookingPreview } from '../CustomerBookingHistory';
import { CustomerNotesPanel } from '../CustomerNotesPanel';
import styles from './CustomerDetail.module.css';

/**
 * Tab "Tổng quan" của hồ sơ khách — Figma Partner-XePrime `23777:54975` (02/11/2026):
 * banner còn nợ + "Thu tiền" · "Đơn thuê hiện tại" · "Tiến trình đơn thuê" · "Ghi chú vận hành"
 * (tab Ghi chú nội bộ cũ chuyển vào đây — cùng component, cùng quyền).
 */
export function CustomerOverviewTab({
  customer,
  canViewBookings,
  canViewFinance,
  canManage,
  showNotes,
}: {
  customer: TenantCustomerDetail;
  canViewBookings: boolean;
  canViewFinance: boolean;
  canManage: boolean;
  /** Ghi chú là sổ RIÊNG của gian hàng — phiên hỗ trợ không mở (ADR 0050 §10). */
  showNotes: boolean;
}) {
  const t = useTranslations('Customers.profile');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const canCollect = has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;
  const [paying, setPaying] = useState<CustomerBooking | null>(null);

  const receivable = customer.receivable;
  const oldest = receivable?.oldest ?? null;
  const current = customer.currentBooking ?? null;

  return (
    <div className={styles.tabStack}>
      {canViewFinance && oldest && !isZeroMoney(customer.debtAmount) ? (
        <section className={styles.debtBanner} role="status">
          <span className={styles.debtIcon} aria-hidden="true">
            <WalletOutlined />
          </span>
          <div className={styles.debtText}>
            <b>{t('debtBanner.title', { amount: fmt.money(customer.debtAmount) })}</b>
            <span>
              {(receivable?.count ?? 0) > 1
                ? t('debtBanner.bodyMore', {
                    code: oldest.code,
                    count: (receivable?.count ?? 1) - 1,
                    paid: fmt.money(oldest.paidAmount),
                  })
                : t('debtBanner.body', { code: oldest.code, paid: fmt.money(oldest.paidAmount) })}
            </span>
          </div>
          {canCollect ? (
            <Button type="primary" onClick={() => setPaying(oldest)}>
              {t('debtBanner.collect')}
            </Button>
          ) : null}
        </section>
      ) : null}

      {canViewBookings ? (
        current ? (
          <BookingPreview
            className={styles.sectionCard}
            booking={current}
            canViewFinance={canViewFinance}
            canOpen={canViewBookings}
            title={t('current.title')}
            extra={
              <span className={styles.muted}>
                {t('current.count', { count: customer.activeBookingCount })}
              </span>
            }
          />
        ) : (
          <SectionCard className={styles.sectionCard} title={t('current.title')}>
            <p className={styles.muted}>{t('current.empty')}</p>
          </SectionCard>
        )
      ) : null}

      <div className={cx(styles.twoCols, !(current && canViewBookings) && styles.oneCol)}>
        {current && canViewBookings ? (
          <SectionCard
            className={styles.sectionCard}
            title={t('timeline.title')}
            extra={<span className={styles.muted}>#{current.code}</span>}
          >
            <BookingTimeline booking={current} canViewFinance={canViewFinance} />
          </SectionCard>
        ) : null}
        {showNotes ? (
          <SectionCard
            className={styles.sectionCard}
            title={t('notes.title')}
            extra={<span className={styles.muted}>{t('notes.internal')}</span>}
          >
            <CustomerNotesPanel
              customerId={customer.id}
              canManage={canManage}
              disabled={Boolean(customer.archivedAt)}
            />
          </SectionCard>
        ) : null}
      </div>

      {paying ? (
        <RecordPaymentModal
          bookingId={paying.id}
          debtAmount={paying.debtAmount ?? '0'}
          open
          onClose={() => setPaying(null)}
        />
      ) : null}
    </div>
  );
}

/** Ba mốc của đơn hiện tại: chặng · thanh toán · lịch trả — suy từ đúng dữ liệu của đơn. */
function BookingTimeline({
  booking,
  canViewFinance,
}: {
  booking: CustomerBooking;
  canViewFinance: boolean;
}) {
  const t = useTranslations('Customers.profile.timeline');
  const fmt = useAppFormat();
  const renting = booking.status === BOOKING_STATUS.ACTIVE;
  const debt = booking.debtAmount;

  const steps = [
    {
      key: 'stage',
      icon: <ClockCircleOutlined />,
      tone: 'warning',
      title: renting ? t('renting') : t('awaiting'),
      body: renting
        ? t('rentingBody', { time: fmt.shortDateTime(booking.pickupAt) })
        : t('awaitingBody', { time: fmt.shortDateTime(booking.pickupAt) }),
    },
    ...(canViewFinance && debt != null
      ? [
          {
            key: 'payment',
            icon: <FileTextOutlined />,
            tone: isZeroMoney(debt) ? 'success' : 'neutral',
            title: isZeroMoney(debt) ? t('paid') : t('unpaid'),
            body: isZeroMoney(debt)
              ? t('paidBody')
              : t.rich('unpaidBody', { amount: fmt.money(debt), b: (chunks) => <b>{chunks}</b> }),
          },
        ]
      : []),
    {
      key: 'return',
      icon: <CalendarOutlined />,
      tone: 'neutral',
      title: t('returnPlan'),
      body: t('returnPlanBody', { time: fmt.shortDateTime(booking.returnAt) }),
    },
  ];

  return (
    <ol className={styles.timeline}>
      {steps.map((step) => (
        <li key={step.key} className={styles.timelineItem}>
          <span className={cx(styles.timelineIcon, styles[`tone_${step.tone}`])} aria-hidden="true">
            {step.icon}
          </span>
          <div className={styles.timelineText}>
            <b>{step.title}</b>
            <span className={styles.muted}>{step.body}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
