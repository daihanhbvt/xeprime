'use client';

import { useTranslations } from 'next-intl';
import { CheckGlyph } from '@/components/icons/CheckGlyph';
import { useAppFormat } from '@/i18n/use-app-format';
import { useLocalizedText } from '@/i18n/localized';
import { cx } from '@/lib/cx';
import type { PublicInsuranceProduct } from '../types';
import styles from './InsuranceBenefits.module.css';

/**
 * Quyền lợi của một sản phẩm bảo hiểm - hai ô số (khấu trừ · bồi thường tối đa) và danh sách phạm
 * vi bảo vệ. Dùng chung cho phần mở rộng của ô chọn (điện thoại, Figma `22548:36924`) và popup
 * quyền lợi (desktop, `22548:38581`): `size="lg"` là cỡ popup, có thêm dòng chú thích dưới số.
 *
 * Mọi con số và chữ phạm vi đọc từ danh mục sản phẩm admin quản lý - không viết cứng.
 */
export function InsuranceFacts({
  product,
  size = 'sm',
}: {
  product: PublicInsuranceProduct;
  size?: 'sm' | 'lg';
}) {
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const localized = useLocalizedText();
  const large = size === 'lg';
  const note = localized(product.maxPayoutNoteVi ?? null, product.maxPayoutNoteEn ?? null) ?? null;
  // Có số tiền ⇒ số là giá trị, ghi chú là chú thích; không có ⇒ ghi chú ("theo giá trị thực tế…").
  const payoutValue = product.maxPayoutAmount ? fmt.money(product.maxPayoutAmount) : note;
  const payoutCaption = product.maxPayoutAmount ? note : null;

  return (
    <dl className={cx(styles.facts, large && styles.factsLg)}>
      <div className={styles.fact}>
        <dt>{t('benefits.deductible')}</dt>
        <dd className={styles.value}>
          {product.deductibleAmount
            ? t('benefits.deductiblePerIncident', { amount: fmt.money(product.deductibleAmount) })
            : t('benefits.noDeductible')}
        </dd>
        {large ? (
          <dd className={styles.caption}>
            {t(
              product.deductibleAmount ? 'dialog.deductibleCaption' : 'dialog.noDeductibleCaption',
            )}
          </dd>
        ) : null}
      </div>
      {payoutValue ? (
        <div className={cx(styles.fact, large && styles.factPositive)}>
          <dt>{t('benefits.maxPayout')}</dt>
          <dd className={styles.value}>{payoutValue}</dd>
          {large && payoutCaption ? <dd className={styles.caption}>{payoutCaption}</dd> : null}
        </div>
      ) : null}
    </dl>
  );
}

/** Danh sách phạm vi bảo vệ - mỗi mục một dấu tích xanh (Figma "Check-Cross"). */
export function InsuranceCoverageChecklist({
  items,
  title,
  size = 'sm',
}: {
  items: readonly string[];
  title: string;
  size?: 'sm' | 'lg';
}) {
  if (items.length === 0) return null;
  const large = size === 'lg';
  return (
    <div className={cx(styles.scope, large && styles.scopeLg)}>
      <p className={styles.scopeTitle}>{title}</p>
      <ul className={styles.scopeList}>
        {items.map((item, index) => (
          // Mục là chữ admin gõ, có thể trùng nhau - khoá theo vị trí + nội dung.
          <li key={`${index}-${item}`} className={styles.scopeItem}>
            <span className={styles.check} aria-hidden="true">
              <CheckGlyph />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
