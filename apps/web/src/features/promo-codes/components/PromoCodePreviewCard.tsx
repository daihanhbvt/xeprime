'use client';

import { CarOutlined, TagOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { PROMO_DISCOUNT_TYPE, PROMO_VEHICLE_SCOPE } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './PromoCodePreviewCard.module.css';

/**
 * XEM TRƯỚC mã khuyến mãi trong form quản trị — ADR 0046 (ảnh thiết kế 6).
 *
 * Nó vẽ đúng thứ KHÁCH sẽ thấy trong hộp thoại chọn mã, từ các giá trị đang gõ trong form. Vì
 * sao đáng có: ba trường (hình thức giảm · mức giảm · trần) kết hợp thành một câu duy nhất
 * ("Giảm 8%, tối đa 80.000đ"), và người soạn chiến dịch không đọc ra câu đó từ ba ô rời.
 *
 * Nhận GIÁ TRỊ RỜI chứ không nhận cả `AdminPromoCode`: lúc đang gõ thì chưa có bản ghi nào, và
 * nửa số trường còn trống. Prop rời cũng khiến nó dùng lại được ở bất kỳ chỗ nào cần "thẻ mã".
 */
export function PromoCodePreviewCard({
  code,
  name,
  description,
  discountType,
  discountAmount,
  discountPercent,
  maxDiscountAmount,
  vehicleScope,
  startsAt,
  endsAt,
}: {
  code: string;
  name?: string | undefined;
  description?: string | undefined;
  discountType: string;
  discountAmount: number | null;
  discountPercent: number | null;
  maxDiscountAmount: number | null;
  vehicleScope: string;
  /** `YYYY-MM-DD` — ngày lịch, đúng thứ ô ngày của form giữ. */
  startsAt: string;
  endsAt: string;
}) {
  const t = useTranslations('PromoCodes');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const isPercent = discountType === PROMO_DISCOUNT_TYPE.PERCENT;

  const headline = isPercent
    ? t('picker.discountPercent', { percent: discountPercent ?? 0 })
    : t('picker.discountFixed', { amount: fmt.money(String(discountAmount ?? 0)) });

  const scopeText =
    vehicleScope === PROMO_VEHICLE_SCOPE.CAR
      ? t('admin.form.preview.scopeCar')
      : vehicleScope === PROMO_VEHICLE_SCOPE.MOTORBIKE
        ? t('admin.form.preview.scopeMotorbike')
        : t('admin.form.preview.scopeAll');

  return (
    <section className={styles.card} aria-label={t('admin.form.preview.title')}>
      <header className={styles.head}>
        <h4 className={styles.title}>{t('admin.form.preview.title')}</h4>
        <p className={styles.subtitle}>{t('admin.form.preview.subtitle')}</p>
      </header>

      <div className={styles.ticket}>
        <div className={styles.ticketHead}>
          {/* Mã trống lúc mới mở form — giữ một chỗ để thẻ không nhảy kích cỡ khi bắt đầu gõ. */}
          <span className={styles.ticketCode}>{code || '—'}</span>
          <span className={styles.ticketType}>
            {domainLabel('promoDiscountType', discountType)}
          </span>
        </div>
        <p className={styles.ticketHeadline}>
          {headline}
          {isPercent && maxDiscountAmount != null ? (
            <span className={styles.ticketCap}>
              {' · '}
              {t('picker.maxDiscount', { amount: fmt.money(String(maxDiscountAmount)) })}
            </span>
          ) : null}
        </p>
        {description?.trim() || name?.trim() ? (
          <p className={styles.ticketNote}>{description?.trim() || name?.trim()}</p>
        ) : null}
        <div className={styles.ticketFoot}>
          <span className={styles.ticketMeta}>
            <CarOutlined aria-hidden /> {scopeText}
          </span>
          <span className={styles.ticketMeta}>
            <TagOutlined aria-hidden />{' '}
            {t('admin.form.preview.window', {
              from: startsAt ? fmt.date(`${startsAt}T00:00:00+07:00`) : '—',
              to: endsAt ? fmt.date(`${endsAt}T00:00:00+07:00`) : '—',
            })}
          </span>
        </div>
      </div>

      <div className={styles.notes}>
        <h5 className={styles.notesTitle}>{t('admin.form.preview.notesTitle')}</h5>
        <ul className={styles.notesList}>
          <li>{t('admin.form.preview.noteSponsored')}</li>
          <li>{t('admin.form.preview.noteType')}</li>
          <li>{t('admin.form.preview.noteLimit')}</li>
          <li>{t('admin.form.preview.noteVisibility')}</li>
          <li>{t('admin.form.preview.noteToggle')}</li>
        </ul>
      </div>
    </section>
  );
}
