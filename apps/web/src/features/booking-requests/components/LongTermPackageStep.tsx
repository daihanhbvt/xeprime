'use client';

import {
  CalendarOutlined,
  CheckCircleFilled,
  CustomerServiceOutlined,
  CreditCardOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, DatePicker, Skeleton } from 'antd';
import { nowInAppTz, type Dayjs } from '@/lib/datetime';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_VALUES,
  type LongTermPackageMonths,
  type PickupPreference,
} from '@xeprime/types';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import type { PublicListingDetail } from '@/features/marketplace/types';

import styles from './LongTermPackageStep.module.css';

type LongTermPackage = NonNullable<PublicListingDetail['longTermPackages']>[number];

interface Props {
  /** Giá sáu gói do SERVER tính — client không nhân giá tháng với số tháng (ADR 0011). */
  packages: readonly LongTermPackage[];
  packagesLoading: boolean;
  selectedMonths: LongTermPackageMonths | null;
  onSelectPackage: (months: LongTermPackageMonths) => void;
  packageError?: string;

  preference: PickupPreference;
  onPreferenceChange: (next: PickupPreference) => void;
  requestedDate: Dayjs | null;
  onRequestedDateChange: (next: Dayjs | null) => void;
  dateError?: string;
}

/**
 * Bước "Chọn gói thuê" của luồng THUÊ DÀI HẠN (ADR 0011).
 *
 * Khách chọn MỘT trong sáu gói cố định rồi nêu NGUYỆN VỌNG ngày nhận — không có khoảng ngày tự
 * do, không có ô nhập ngày trả (ngày trả = ngày nhận + N tháng lịch, do gian hàng chốt giờ nhận
 * khi duyệt và server tính).
 *
 * Component này KHÔNG hiển thị tiền của gói đang chọn nữa: nó từng tự vẽ một khối "Tóm tắt lựa
 * chọn" trong khi luồng đã có `BookingPriceSummary` dựng cùng một `quote` ngay bên dưới — hai
 * bảng tiền cạnh nhau cho cùng một con số. Giờ tiền chỉ có đúng một chỗ, và chỗ đó luôn nhìn
 * thấy được kể cả khi cuộn. Badge `-X%` trên thẻ gói giữ nguyên vì nó là thuộc tính của LỰA CHỌN
 * (ưu đãi cam kết thời hạn của chính gói đó), không phải một con số tiền.
 */
export function LongTermPackageStep({
  packages,
  packagesLoading,
  selectedMonths,
  onSelectPackage,
  packageError,
  preference,
  onPreferenceChange,
  requestedDate,
  onRequestedDateChange,
  dateError,
}: Props) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();

  /*
   * Lịch mở NGAY khi khách bấm "Chọn ngày cụ thể" — không đẻ thêm một ô nhập để bấm lần nữa.
   * Ô `DatePicker` chỉ còn là điểm neo popup (ẩn về 0×0 bằng CSS); nhãn ngày đã chọn hiện
   * ngay trên chính viên lựa chọn.
   */
  const [dateOpen, setDateOpen] = useState(false);

  const trustPoints = [
    {
      key: 'process',
      icon: <SafetyCertificateOutlined aria-hidden />,
      title: t('longTerm.trust.processTitle'),
      desc: t('longTerm.trust.processDesc'),
    },
    {
      key: 'payment',
      icon: <CreditCardOutlined aria-hidden />,
      title: t('longTerm.trust.paymentTitle'),
      desc: t('longTerm.trust.paymentDesc'),
    },
    {
      key: 'support',
      icon: <CustomerServiceOutlined aria-hidden />,
      title: t('longTerm.trust.supportTitle'),
      desc: t('longTerm.trust.supportDesc'),
    },
  ];

  return (
    <div className={styles.wrap}>
      <section className={styles.block} aria-label={t('longTerm.chooseTitle')}>
        <h3 className={styles.blockTitle}>{t('longTerm.chooseTitle')}</h3>
        <span className={styles.fieldLabel}>{t('longTerm.chooseLabel')}</span>

        {packagesLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : packages.length === 0 ? (
          <Alert type="info" showIcon message={t('longTerm.noPrice')} />
        ) : (
          <div className={styles.packages} role="radiogroup" aria-label={t('longTerm.groupLabel')}>
            {packages.map((pkg) => {
              const active = selectedMonths === pkg.packageMonths;
              return (
                <button
                  key={pkg.packageMonths}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={cx(styles.package, active && styles.packageActive)}
                  onClick={() => onSelectPackage(pkg.packageMonths as LongTermPackageMonths)}
                >
                  {pkg.durationDiscountPercent ? (
                    <DiscountTag
                      percent={pkg.durationDiscountPercent}
                      size="sm"
                      className={styles.packageBadge}
                    />
                  ) : null}
                  <span className={styles.packageName}>
                    {t('packageMonths', { months: pkg.packageMonths })}
                  </span>
                  {/* Dấu tích neo ở mép dưới thẻ — trạng thái chọn phải đọc được không chỉ bằng màu. */}
                  {active ? (
                    <CheckCircleFilled className={styles.packageCheck} aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        {packageError ? (
          <p className={styles.error} role="alert">
            {packageError}
          </p>
        ) : null}
      </section>

      <section className={styles.block} aria-label={t('longTerm.wishGroupLabel')}>
        <span className={styles.fieldLabel}>{t('longTerm.wishTitle')}</span>
        <div className={styles.wishes} role="radiogroup" aria-label={t('longTerm.wishGroupLabel')}>
          {PICKUP_PREFERENCE_VALUES.map((value) => {
            const active = preference === value;
            const isSpecific = value === PICKUP_PREFERENCE.SPECIFIC_DATE;
            const preferenceLabel = dl('pickupPreference', value);
            const label =
              isSpecific && requestedDate ? requestedDate.format('DD/MM/YYYY') : preferenceLabel;
            return (
              <div key={value} className={styles.wishAnchor}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={
                    isSpecific && requestedDate
                      ? t('longTerm.wishValueLabel', { preference: preferenceLabel, date: label })
                      : preferenceLabel
                  }
                  className={cx(styles.wish, active && styles.wishActive)}
                  onClick={() => {
                    onPreferenceChange(value);
                    if (isSpecific) setDateOpen(true);
                  }}
                >
                  <span
                    className={cx(styles.wishDot, active && styles.wishDotActive)}
                    aria-hidden
                  />
                  <span className={styles.wishLabel}>{label}</span>
                  <CalendarOutlined className={styles.wishIcon} aria-hidden />
                </button>

                {/* Điểm neo popup lịch — ô nhập ẩn 0×0, khách chỉ thấy viên lựa chọn ở trên. */}
                {isSpecific ? (
                  <DatePicker
                    open={dateOpen}
                    onOpenChange={setDateOpen}
                    value={requestedDate}
                    onChange={(next) => {
                      onRequestedDateChange(next);
                      setDateOpen(false);
                    }}
                    format="DD/MM/YYYY"
                    aria-label={t('longTerm.dateLabel')}
                    className={styles.datePickerAnchor}
                    popupAlign={{ points: ['tl', 'bl'], offset: [0, 4] }}
                    // Nhận xe trong quá khứ là vô nghĩa; server kiểm lại từ ngày mai trở đi.
                    disabledDate={(current) => current.isBefore(nowInAppTz().endOf('day'))}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className={styles.hint}>
          {preference === PICKUP_PREFERENCE.SPECIFIC_DATE
            ? t('longTerm.hint.specific_date')
            : t('longTerm.hint.within_7_days')}
        </p>
        {preference === PICKUP_PREFERENCE.SPECIFIC_DATE && dateError ? (
          <p className={styles.error} role="alert">
            {dateError}
          </p>
        ) : null}
      </section>

      <ul className={styles.trust}>
        {trustPoints.map((point) => (
          <li key={point.key} className={styles.trustItem}>
            <span className={styles.trustIcon}>{point.icon}</span>
            <span className={styles.trustText}>
              <b>{point.title}</b>
              <span>{point.desc}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
