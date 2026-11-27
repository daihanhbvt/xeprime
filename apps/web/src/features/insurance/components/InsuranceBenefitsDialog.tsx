'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LIST_SEPARATOR, telHref } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '../types';
import { InsuranceCoverageChecklist, InsuranceFacts } from './InsuranceBenefits';
import styles from './InsuranceBenefitsDialog.module.css';

/**
 * Popup quyền lợi bảo hiểm - Figma `22548:38581` (760px): dải đầu (hãng · tên · giá), hai ô số,
 * phạm vi bảo vệ, khối "Quyền lợi & người chịu khấu trừ" (ADR 0091 điều 8), khối hotline, rồi
 * nút chọn. Chỉ mở ở tablet/desktop; điện thoại mở quyền lợi ngay trong thẻ.
 *
 * Nút chọn chỉ đổi Ô TÍCH của thẻ (cùng `onChange`), không gọi API: báo giá tự tính lại theo lựa
 * chọn như khi khách tích tay. Dòng Bắt buộc (ADR 0091) chỉ có nút Đóng.
 */
export function InsuranceBenefitsDialog({
  open,
  onClose,
  item,
  product,
  name,
  coverage,
  price,
  checked,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  item: InsuranceOfferItem;
  product: PublicInsuranceProduct;
  name: string;
  coverage: readonly string[];
  /** Giá của lựa chọn - cùng số thẻ đang hiện (`insuranceOfferPrice`). */
  price: { amount: string; basis: 'trip' | 'daily' } | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations('Insurance');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const providerShort = t(`provider.${product.provider}.short`);
  const providerFull = t(`provider.${product.provider}.full`);
  const amountText = price ? fmt.money(price.amount) : null;

  const choose = (value: boolean) => {
    onChange(value);
    onClose();
  };

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      hideHeaderTitle
      ariaLabel={name}
      size="fit"
      closeIcon={<LineIcon name="close" className={styles.closeIcon} />}
      className={styles.dialog}
      bodyClassName={styles.body}
      footer={
        <div className={styles.actions}>
          {item.mandatory ? (
            <Button type="primary" size="large" onClick={onClose}>
              {tCommon('actions.close')}
            </Button>
          ) : checked ? (
            <>
              <Button size="large" onClick={() => choose(false)}>
                {t('dialog.deselect')}
              </Button>
              <Button type="primary" size="large" onClick={onClose}>
                {tCommon('actions.close')}
              </Button>
            </>
          ) : (
            <>
              <Button size="large" onClick={onClose}>
                {tCommon('actions.close')}
              </Button>
              <Button type="primary" size="large" onClick={() => choose(true)}>
                {t('dialog.select', { provider: providerShort, price: amountText ?? '' })}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className={styles.frame}>
        <header className={styles.hero}>
          <div className={styles.partner}>
            <span className={styles.shield} aria-hidden="true">
              <LineIcon name="shield-tick" />
            </span>
            <span className={styles.partnerPill}>
              {providerShort}
              {LIST_SEPARATOR}
              {providerFull}
            </span>
          </div>
          <div className={styles.titleRow}>
            <div className={styles.titleText}>
              <h2 className={styles.title}>{name}</h2>
              <p className={styles.subtitle}>
                {item.mandatory ? t('option.mandatoryNote') : t('offer.note')}
              </p>
            </div>
            {price && amountText ? (
              <div className={styles.priceBox}>
                <span className={styles.price}>
                  {t(price.basis === 'trip' ? 'option.tripRate' : 'option.dailyRate', {
                    price: amountText,
                  })}
                </span>
                <span className={styles.priceCaption}>
                  {t(price.basis === 'daily' ? 'dialog.priceCaptionDaily' : 'dialog.priceCaption')}
                </span>
              </div>
            ) : null}
          </div>
        </header>

        <div className={styles.content}>
          <InsuranceFacts product={product} size="lg" />
          <InsuranceCoverageChecklist items={coverage} title={t('dialog.scopeTitle')} size="lg" />

          <section className={styles.notice}>
            <h3 className={styles.noticeTitle}>{t('dialog.noticeTitle')}</h3>
            <p className={styles.noticeBody}>
              {product.deductibleAmount
                ? t('dialog.noticeBody', {
                    amount: fmt.money(product.deductibleAmount),
                    provider: providerShort,
                  })
                : t('dialog.noticeBodyNoDeductible', { provider: providerShort })}
            </p>
          </section>

          {product.claimHotline ? (
            <section className={styles.hotline}>
              <div className={styles.hotlineText}>
                <h3 className={styles.hotlineTitle}>
                  {t('dialog.hotlineTitle', { provider: providerShort })}
                </h3>
                <p className={styles.hotlineDesc}>{t('dialog.hotlineDesc')}</p>
              </div>
              <a
                className={styles.phone}
                href={telHref(product.claimHotline) ?? undefined}
                aria-label={t('dialog.callHotline', { number: product.claimHotline })}
              >
                {product.claimHotline}
              </a>
            </section>
          ) : null}

          {/* Trang quyền lợi đầy đủ (ADR 0091 điều 8) - tab mới để giữ nguyên lựa chọn đang làm. */}
          {item.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? (
            <Link
              className={styles.rulesLink}
              href={ROUTES.INSURANCE}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('dialog.rulesLink')}
            </Link>
          ) : null}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
