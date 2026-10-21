'use client';

import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Checkbox } from 'antd';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { InsuranceProductKind } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import type { InsuranceOfferItem, PublicInsuranceProduct } from '../types';
import styles from './InsuranceOptionList.module.css';

/**
 * Hai ô chọn bảo hiểm chuyến (ADR 0064) — dùng chung cho trang chi tiết xe và hộp gửi yêu cầu.
 *
 * Phí ngày đọc từ CHÍNH báo giá (chính sách phí có phiên bản), tên/quyền lợi/khấu trừ đọc từ danh
 * mục sản phẩm. Không có con số nào viết cứng ở đây hay trong bản dịch: admin đổi biểu phí thì
 * màn hình đổi theo, không phải chờ ai sửa chuỗi.
 *
 * Danh sách rỗng ⇒ không render gì — người gọi ẩn luôn cả khối (tiêu đề + ghi chú).
 */
export function InsuranceOptionList({
  items,
  selected,
  onChange,
}: {
  items: readonly InsuranceOfferItem[];
  selected: Readonly<Record<InsuranceProductKind, boolean>>;
  onChange: (kind: InsuranceProductKind, checked: boolean) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <InsuranceOption
          key={item.kind}
          item={item}
          checked={selected[item.kind]}
          onChange={(checked) => onChange(item.kind, checked)}
        />
      ))}
    </div>
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
  const [open, setOpen] = useState(false);
  const benefitsId = useId();

  const name = item.product
    ? localized(item.product.nameVi, item.product.nameEn)
    : domainLabel('insuranceProductKind', item.kind);

  return (
    <div className={styles.item} data-checked={checked || undefined}>
      <label className={styles.row}>
        <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={styles.name}>{name}</span>
        <span className={styles.rate}>
          {t('option.dailyRate', { price: fmt.pricePerDay(item.dailyAmount) })}
        </span>
      </label>
      {item.product ? (
        <>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={benefitsId}
            onClick={() => setOpen((v) => !v)}
          >
            {t('option.benefits')}
            {open ? <UpOutlined aria-hidden /> : <DownOutlined aria-hidden />}
          </button>
          {open ? (
            <div id={benefitsId} className={styles.benefits}>
              <InsuranceBenefits product={item.product} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Quyền lợi + khấu trừ + bồi thường tối đa cho đúng loại xe đang xem. */
function InsuranceBenefits({ product }: { product: PublicInsuranceProduct }) {
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const localized = useLocalizedText();
  const coverage = localized(product.coverageVi, product.coverageEn);
  const note = localized(product.maxPayoutNoteVi, product.maxPayoutNoteEn) ?? null;

  const maxPayout = product.maxPayoutAmount
    ? note
      ? t('benefits.maxPayoutWithNote', { amount: fmt.money(product.maxPayoutAmount), note })
      : fmt.money(product.maxPayoutAmount)
    : (note ?? null);

  return (
    <dl className={styles.facts}>
      <div className={styles.fact}>
        <dt>{t('benefits.coverage')}</dt>
        <dd>{coverage}</dd>
      </div>
      {/*
        Khấu trừ chỉ là một dòng có nghĩa với bảo hiểm VẬT CHẤT XE. Với tai nạn người, "không áp
        dụng khấu trừ" là thông tin khách cần — nói ra thay vì để trống.
      */}
      <div className={styles.fact}>
        <dt>{t('benefits.deductible')}</dt>
        <dd>
          {product.deductibleAmount
            ? t('benefits.deductiblePerIncident', { amount: fmt.money(product.deductibleAmount) })
            : t('benefits.noDeductible')}
        </dd>
      </div>
      {maxPayout ? (
        <div className={styles.fact}>
          <dt>{t('benefits.maxPayout')}</dt>
          <dd>{maxPayout}</dd>
        </div>
      ) : null}
    </dl>
  );
}
