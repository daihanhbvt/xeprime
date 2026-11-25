'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Skeleton, Switch } from 'antd';
import { useTranslations } from 'next-intl';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { BOOKING_EXTRA_CHARGE_MAX_LINES } from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { NumberField } from '@/components/form/NumberField';
import { TextField } from '@/components/form/TextField';
import type { CalendarQuote } from '@/features/calendar/types/calendar.types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { StaffBookingValues } from '../staff-booking-schema';
import { negotiatedTotal } from './staff-booking-money';
import reviewStyles from './BookingReviewStep.module.css';
import styles from './StaffBookingCards.module.css';

interface StaffBookingPriceCardProps {
  control: Control<StaffBookingValues>;
  quote: CalendarQuote | null;
  quoteLoading: boolean;
  /** Xe chưa cấu hình giá — giá thoả thuận bật sẵn, không tắt được. */
  quoteUnavailable: boolean;
  /** Chỉ chuyến giao tận nơi mới có ô phí giao xe. */
  isDelivery: boolean;
  onToggleNegotiated: (on: boolean) => void;
}

/**
 * Thẻ "Tiền thuê" của màn Xem lại luồng ĐẶT HỘ (ADR 0109).
 *
 * - Tắt "Giá thoả thuận": bảng giá hệ thống (`PriceBreakdown`), công tắc nằm ở chip cạnh tiêu đề.
 * - Bật: một thẻ nhập tiền thuê, giảm giá, phí giao xe (chỉ khi giao tận nơi) và phụ phí theo dòng
 *   (ví dụ ghế trẻ em). Tổng tính lại ngay — chỉ để HIỂN THỊ; server tính lại bằng cùng công thức.
 */
export function StaffBookingPriceCard({
  control,
  quote,
  quoteLoading,
  quoteUnavailable,
  isDelivery,
  onToggleNegotiated,
}: StaffBookingPriceCardProps) {
  const t = useTranslations('BookingRequests.staffFlow');
  const tFlow = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const negotiated = useWatch({ control, name: 'negotiated' });
  const values = useWatch({
    control,
    name: ['manualBaseAmount', 'manualDiscount', 'manualDeliveryFee', 'extraCharges'],
  });
  const extras = useFieldArray({ control, name: 'extraCharges' });

  const toggle = (
    <span className={styles.toggle}>
      <Switch
        size="small"
        checked={negotiated || quoteUnavailable}
        disabled={quoteUnavailable}
        onChange={onToggleNegotiated}
        aria-label={t('review.negotiated.toggle')}
      />
      <span>{t('review.negotiated.toggle')}</span>
    </span>
  );

  if (quoteLoading) {
    return (
      <section className={reviewStyles.card} aria-busy="true">
        <Skeleton active paragraph={{ rows: 3 }} />
      </section>
    );
  }

  if (!negotiated && !quoteUnavailable && quote) {
    return (
      <PriceBreakdown
        rows={quote.rows}
        totalAmount={quote.totalAmount}
        totalLabel={quote.estimateNote ? t('trip.barEstimate') : t('trip.barTotal')}
        title={t('review.costs.title')}
        badge={toggle}
        footer={
          <>
            {quote.longTerm?.durationDiscountPercent ? (
              <strong>
                {tFlow('price.savings', {
                  amount: fmt.money(quote.longTerm.durationDiscountAmount),
                  months: quote.longTerm.packageMonths,
                })}
              </strong>
            ) : null}{' '}
            {quote.estimateNote ? `${quote.estimateNote}. ` : ''}
            {t('review.costs.systemNote')}
          </>
        }
      />
    );
  }

  const [base, discount, delivery, extraRows] = values;
  const total = negotiatedTotal({
    base,
    discount,
    delivery: isDelivery ? delivery : 0,
    extras: extraRows,
  });

  return (
    <section className={reviewStyles.card} aria-label={t('review.costs.title')}>
      <div className={styles.cardHead}>
        <h3 className={reviewStyles.cardTitle}>{t('review.costs.title')}</h3>
        {toggle}
      </div>
      {quoteUnavailable ? (
        <Alert type="warning" showIcon title={t('review.costs.noPrice')} />
      ) : (
        <p className={reviewStyles.cardLead}>{t('review.negotiated.lead')}</p>
      )}
      <Form component={false} layout="vertical" colon={false}>
        <NumberField
          control={control}
          name="manualBaseAmount"
          label={t('review.costs.baseAmount')}
          money
          min={0}
          required
        />
        <NumberField
          control={control}
          name="manualDiscount"
          label={t('review.negotiated.discount')}
          money
          min={0}
        />
        {isDelivery ? (
          <NumberField
            control={control}
            name="manualDeliveryFee"
            label={t('review.negotiated.deliveryFee')}
            help={t('review.negotiated.deliveryFeeHint')}
            money
            min={0}
          />
        ) : null}

        <div className={styles.listHead}>
          <span className={styles.listTitle}>{t('review.negotiated.extrasTitle')}</span>
          <span className={styles.listHint}>{t('review.negotiated.extrasHint')}</span>
        </div>
        {extras.fields.map((field, index) => (
          <div key={field.id} className={styles.lineRow}>
            <TextField
              control={control}
              name={`extraCharges.${index}.label`}
              label={t('review.negotiated.extraLabel')}
              placeholder={t('review.negotiated.extraLabelPlaceholder')}
              autoComplete="off"
            />
            <NumberField
              control={control}
              name={`extraCharges.${index}.amount`}
              label={t('review.negotiated.extraAmount')}
              money
              min={0}
            />
            <Button
              type="text"
              className={styles.removeBtn}
              icon={<DeleteOutlined />}
              aria-label={t('review.negotiated.removeExtra')}
              onClick={() => extras.remove(index)}
            />
          </div>
        ))}
        {extras.fields.length < BOOKING_EXTRA_CHARGE_MAX_LINES ? (
          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() => extras.append({ label: '', amount: null })}
          >
            {t('review.negotiated.addExtra')}
          </Button>
        ) : null}
      </Form>
      <div className={cx(styles.totalRow)}>
        <span>{t('trip.barTotal')}</span>
        <b>{fmt.money(String(total))}</b>
      </div>
    </section>
  );
}
