'use client';

import { Checkbox, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useId, useState } from 'react';
import { telHref } from '@xeprime/domain';
import { INSURANCE_PRODUCT_KIND, type InsuranceProductKind } from '@xeprime/types';
import { InsuranceFeeHint } from '@/components/data-display/InsuranceFeeHint';
import { LineIcon } from '@/components/icons/LineIcon';
import { ROUTES } from '@/constants/routes';
import { useIsMobile } from '@/hooks/use-media-query';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { cx } from '@/lib/cx';
import { insuranceOfferPrice, insuranceProductCopy } from '../present';
import type { InsuranceOfferItem } from '../types';
import { InsuranceCoverageChecklist, InsuranceFacts } from './InsuranceBenefits';
import { InsuranceBenefitsDialog } from './InsuranceBenefitsDialog';
import styles from './InsuranceOfferCard.module.css';

/**
 * Thẻ "Bảo hiểm chuyến đi" ở trang chi tiết xe (ADR 0064 · ADR 0091) - Figma `22548:36923`: đầu thẻ
 * (khiên · tiêu đề · nhãn hãng), mỗi sản phẩm một ô chọn (tên, mô tả ngắn, giá, viên khấu trừ /
 * hotline, "Xem quyền lợi"), ghi chú tự nguyện ở chân.
 *
 * "Xem quyền lợi": điện thoại mở NGAY TRONG THẺ (biến thể Expand), tablet/desktop mở popup
 * (`InsuranceBenefitsDialog`, biến thể Popup).
 *
 * Phí đọc từ CHÍNH báo giá, tên/quyền lợi/khấu trừ/hotline từ danh mục sản phẩm - không có số nào
 * viết cứng. Danh sách rỗng ⇒ không render gì (người gọi không phải ẩn tiêu đề riêng).
 */
export function InsuranceOfferCard({
  items,
  selected,
  onChange,
  className,
}: {
  items: readonly InsuranceOfferItem[];
  selected: Readonly<Record<InsuranceProductKind, boolean>>;
  onChange: (kind: InsuranceProductKind, checked: boolean) => void;
  className?: string;
}) {
  const t = useTranslations('Insurance');
  const titleId = useId();
  if (items.length === 0) return null;

  // Nhãn hãng ở đầu thẻ chỉ khi mọi sản phẩm cùng một hãng (hôm nay: MIC).
  const providers = new Set(items.map((item) => item.product?.provider).filter(Boolean));
  const provider = providers.size === 1 ? [...providers][0] : null;

  return (
    <section className={cx(styles.card, className)} aria-labelledby={titleId}>
      <div className={styles.header}>
        <span className={styles.shield} aria-hidden="true">
          <LineIcon name="shield-tick" />
        </span>
        <h4 id={titleId} className={styles.title}>
          {t('offer.title')}
        </h4>
        {provider ? (
          <span className={styles.providerBadge}>{t(`provider.${provider}.short`)}</span>
        ) : null}
      </div>

      {items.map((item) => (
        <InsuranceOption
          key={item.kind}
          item={item}
          checked={item.mandatory || selected[item.kind]}
          onChange={(checked) => onChange(item.kind, checked)}
        />
      ))}

      {/* "Tự nguyện" chỉ đúng với ô khách tự tích; dòng Bắt buộc (ADR 0091) có câu riêng. */}
      {items.some((item) => !item.mandatory) ? (
        <p className={styles.note}>{t('offer.note')}</p>
      ) : null}
    </section>
  );
}

function InsuranceOption({
  item,
  checked,
  onChange,
}: {
  item: InsuranceOfferItem;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const benefitsId = useId();

  const product = item.product;
  const name = product
    ? localized(product.nameVi, product.nameEn)
    : domainLabel('insuranceProductKind', item.kind);
  const copy = product ? insuranceProductCopy(product, localized) : null;
  const price = insuranceOfferPrice(item);
  const priceText = price
    ? t(price.basis === 'trip' ? 'option.tripRate' : 'option.dailyRate', {
        price: fmt.money(price.amount),
      })
    : null;
  const providerShort = product ? t(`provider.${product.provider}.short`) : null;
  const hotlineHref = telHref(product?.claimHotline);

  return (
    <div className={styles.option} data-checked={checked || undefined}>
      <div className={styles.top}>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            {/* Chủ xe đặt Bắt buộc (ADR 0091): luôn tích, không bỏ được - server đã cộng phí. */}
            <Checkbox
              className={styles.checkbox}
              checked={checked}
              disabled={item.mandatory}
              onChange={(e) => onChange(e.target.checked)}
            >
              <span className={styles.name}>{name}</span>
            </Checkbox>
            {item.mandatory ? (
              <Tag className={styles.mandatory}>{t('option.mandatory')}</Tag>
            ) : null}
          </div>
          {copy?.summary ? <p className={styles.summary}>{copy.summary}</p> : null}
        </div>
        {priceText ? (
          <div className={styles.price}>
            <span className={styles.amount}>
              {priceText}
              {item.tripAmount && item.serviceFeeAmount ? (
                <InsuranceFeeHint
                  fee={{
                    premiumAmount: item.tripAmount,
                    serviceFeeAmount: item.serviceFeeAmount,
                    serviceFeePercent: null,
                  }}
                />
              ) : null}
            </span>
            <span className={styles.unit}>
              {t(price?.basis === 'daily' ? 'option.perDay' : 'option.perTrip')}
            </span>
          </div>
        ) : null}
      </div>

      {item.mandatory ? <p className={styles.mandatoryNote}>{t('option.mandatoryNote')}</p> : null}

      {product && copy ? (
        <>
          <div className={styles.divider} />
          <div className={styles.bar}>
            <div className={styles.pills}>
              <span className={styles.pill}>
                {product.deductibleAmount
                  ? t('option.deductiblePill', {
                      amount: fmt.moneyCompact(product.deductibleAmount),
                    })
                  : t('option.noDeductiblePill')}
              </span>
              {product.claimHotline && hotlineHref ? (
                <a
                  className={cx(styles.pill, styles.pillInfo)}
                  href={hotlineHref}
                  aria-label={t('dialog.callHotline', { number: product.claimHotline })}
                >
                  {t('option.hotlinePill')}
                </a>
              ) : null}
            </div>
            {isMobile ? (
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={expanded}
                aria-controls={benefitsId}
                onClick={() => setExpanded((v) => !v)}
              >
                {t(expanded ? 'option.hideBenefits' : 'option.showBenefits')}
                <LineIcon name={expanded ? 'arrow-up' : 'arrow-down'} />
              </button>
            ) : (
              <button
                type="button"
                className={styles.toggle}
                aria-haspopup="dialog"
                onClick={() => setDialogOpen(true)}
              >
                {t('option.showBenefits')}
                <LineIcon name="arrow-right" />
              </button>
            )}
          </div>

          {isMobile && expanded ? (
            <div id={benefitsId} className={styles.expanded}>
              <InsuranceFacts product={product} />
              <InsuranceCoverageChecklist items={copy.coverage} title={t('dialog.scopeTitle')} />
              {product.claimHotline && hotlineHref ? (
                <a className={styles.hotlineLine} href={hotlineHref}>
                  {t.rich('option.hotlineLine', {
                    provider: providerShort ?? '',
                    number: product.claimHotline,
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
                </a>
              ) : null}
              {/* Trang quyền lợi đầy đủ + người chịu khấu trừ (ADR 0091 điều 8) - tab mới, giữ form. */}
              {item.kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP ? (
                <Link
                  className={styles.rulesLink}
                  href={ROUTES.INSURANCE}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('option.benefitsPage')}
                </Link>
              ) : null}
            </div>
          ) : null}

          {!isMobile ? (
            <InsuranceBenefitsDialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              item={item}
              product={product}
              name={name}
              coverage={copy.coverage}
              price={price}
              checked={checked}
              onChange={onChange}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
