'use client';

import {
  CalendarOutlined,
  CheckCircleFilled,
  CustomerServiceOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
  SafetyCertificateOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { Alert, DatePicker, Skeleton, Tooltip } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  longTermPackageLabel,
  PICKUP_PREFERENCE,
  PICKUP_PREFERENCE_HINT,
  PICKUP_PREFERENCE_LABEL,
  PICKUP_PREFERENCE_VALUES,
  type LongTermPackageMonths,
  type PickupPreference,
} from '@xeprime/types';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { cx } from '@/lib/cx';
import type { PublicListingDetail } from '@/features/marketplace/types';
import type { PublicQuote } from '@/features/rental-policies/types';

import styles from './LongTermPackageStep.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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

  /** Báo giá của gói đang chọn — nguồn DUY NHẤT của mọi con số tiền hiển thị ở đây. */
  quote: PublicQuote | null;
  quoteLoading: boolean;
}

/** Ba cam kết dịch vụ hiển thị dưới bảng giá — nội dung tĩnh, không suy từ dữ liệu xe. */
const TRUST_POINTS = [
  {
    icon: <SafetyCertificateOutlined aria-hidden />,
    title: 'Thủ tục nhanh gọn',
    desc: 'Duyệt hồ sơ nhanh chóng',
  },
  {
    icon: <CreditCardOutlined aria-hidden />,
    title: 'Thanh toán linh hoạt',
    desc: 'Nhiều hình thức thanh toán',
  },
  {
    icon: <CustomerServiceOutlined aria-hidden />,
    title: 'Hỗ trợ 24/7',
    desc: 'Tư vấn mọi lúc, mọi nơi',
  },
];

/**
 * Bước "Chọn gói thuê" của luồng THUÊ DÀI HẠN (ADR 0011).
 *
 * Khách chọn MỘT trong sáu gói cố định rồi nêu NGUYỆN VỌNG ngày nhận — không có khoảng ngày tự
 * do, không có ô nhập ngày trả (ngày trả = ngày nhận + N tháng lịch, do gian hàng chốt giờ nhận
 * khi duyệt và server tính).
 *
 * Mọi con số tiền trong "Tóm tắt lựa chọn" lấy từ báo giá server của ĐÚNG gói đang chọn; badge
 * `-X%` trên thẻ gói là **ưu đãi cam kết thời hạn** của chính gói đó (không phải so với giá thuê
 * theo ngày), và dùng nguyên `DiscountTag` chung — màu và chữ thuộc về common.
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
  quote,
  quoteLoading,
}: Props) {
  const fmt = useAppFormat();

  const longTerm = quote?.breakdown.longTerm ?? null;
  /*
   * Lịch mở NGAY khi khách bấm "Chọn ngày cụ thể" — không đẻ thêm một ô nhập để bấm lần nữa.
   * Ô `DatePicker` chỉ còn là điểm neo popup (ẩn về 0×0 bằng CSS); nhãn ngày đã chọn hiện
   * ngay trên chính viên lựa chọn.
   */
  const [dateOpen, setDateOpen] = useState(false);

  return (
    <div className={styles.wrap}>
      <section className={styles.block} aria-label="Chọn gói thuê">
        <h3 className={styles.blockTitle}>Chọn gói thuê</h3>
        <span className={styles.fieldLabel}>Chọn thời gian thuê</span>

        {packagesLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} title={false} />
        ) : packages.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="Xe chưa niêm yết giá thuê dài hạn — gian hàng sẽ báo giá sau khi nhận yêu cầu."
          />
        ) : (
          <div className={styles.packages} role="radiogroup" aria-label="Gói thuê dài hạn">
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
                    {longTermPackageLabel(pkg.packageMonths)}
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

      <section className={styles.block} aria-label="Nguyện vọng nhận xe">
        <span className={styles.fieldLabel}>Bạn muốn nhận xe khi nào?</span>
        <div className={styles.wishes} role="radiogroup" aria-label="Nguyện vọng nhận xe">
          {PICKUP_PREFERENCE_VALUES.map((value) => {
            const active = preference === value;
            const isSpecific = value === PICKUP_PREFERENCE.SPECIFIC_DATE;
            const label =
              isSpecific && requestedDate
                ? requestedDate.format('DD/MM/YYYY')
                : PICKUP_PREFERENCE_LABEL[value];
            return (
              <div key={value} className={styles.wishAnchor}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={
                    isSpecific && requestedDate
                      ? `${PICKUP_PREFERENCE_LABEL[value]}: ${label}`
                      : PICKUP_PREFERENCE_LABEL[value]
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
                    aria-label="Ngày muốn nhận xe"
                    className={styles.datePickerAnchor}
                    popupAlign={{ points: ['tl', 'bl'], offset: [0, 4] }}
                    // Nhận xe trong quá khứ là vô nghĩa; server kiểm lại từ ngày mai trở đi.
                    disabledDate={(current) => current.isBefore(dayjs().endOf('day'))}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        <p className={styles.hint}>{PICKUP_PREFERENCE_HINT[preference]}</p>
        {preference === PICKUP_PREFERENCE.SPECIFIC_DATE && dateError ? (
          <p className={styles.error} role="alert">
            {dateError}
          </p>
        ) : null}
      </section>

      {/* Tóm tắt CHỈ xuất hiện khi đã chọn gói — chưa chọn thì không có con số nào để tóm tắt. */}
      {selectedMonths != null ? (
        quoteLoading ? (
          <Skeleton active paragraph={{ rows: 3 }} title={false} />
        ) : longTerm ? (
          <>
            <section className={styles.summary} aria-label="Tóm tắt lựa chọn">
              <h4 className={styles.summaryTitle}>Tóm tắt lựa chọn</h4>

              <dl className={styles.summaryRows}>
                <div className={styles.summaryRow}>
                  <dt>Gói thuê</dt>
                  <dd>
                    <span className={styles.packageChip}>
                      {longTermPackageLabel(longTerm.packageMonths)}
                    </span>
                  </dd>
                </div>
                <div className={styles.summaryRow}>
                  <dt>Giá thuê (chưa ưu đãi)</dt>
                  <dd>{fmt.money(longTerm.basePackageAmount)}</dd>
                </div>
                {longTerm.durationDiscountPercent ? (
                  <div className={cx(styles.summaryRow, styles.summaryDiscount)}>
                    <dt>Ưu đãi ({longTerm.durationDiscountPercent}%)</dt>
                    <dd>−{fmt.money(longTerm.durationDiscountAmount)}</dd>
                  </div>
                ) : null}
              </dl>

              <div className={styles.summaryTotal}>
                <span className={styles.summaryTotalLabel}>
                  Tổng giá trị gói thuê
                  <Tooltip title="Tiền thuê xe cho trọn gói, đã trừ ưu đãi cam kết thời hạn. Tiền cọc và phụ phí phát sinh (nếu có) tính riêng.">
                    <InfoCircleOutlined className={styles.infoIcon} aria-hidden />
                  </Tooltip>
                </span>
                <b className={styles.summaryTotalValue}>{fmt.money(longTerm.finalPackageAmount)}</b>
              </div>

              <p className={styles.summaryNote}>
                Giá gói là tiền thuê xe. Tiền cọc {fmt.money(quote?.breakdown.depositAmount ?? '0')}{' '}
                thu riêng và được hoàn khi trả xe; gian hàng xác nhận giá chốt khi duyệt yêu cầu.
              </p>
            </section>

            {/*
              Câu "tiết kiệm" DUY NHẤT được phép: so với GIÁ GỐC CỦA CHÍNH GÓI (trước ưu đãi cam
              kết), không bao giờ so với giá thuê theo ngày — đó là dịch vụ khác (ADR 0011).
            */}
            {longTerm.durationDiscountPercent ? (
              <p className={styles.savings}>
                <TagOutlined aria-hidden />
                <span>
                  Tiết kiệm <b>{fmt.money(longTerm.durationDiscountAmount)}</b> khi thuê{' '}
                  {longTermPackageLabel(longTerm.packageMonths)} so với giá gốc.
                </span>
              </p>
            ) : null}
          </>
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Chưa tải được giá gói. Bạn vẫn gửi được yêu cầu; gian hàng sẽ xác nhận giá."
          />
        )
      ) : null}

      <ul className={styles.trust}>
        {TRUST_POINTS.map((point) => (
          <li key={point.title} className={styles.trustItem}>
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
