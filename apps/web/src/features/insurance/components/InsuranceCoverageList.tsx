'use client';

import { SafetyCertificateOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import {
  INSURANCE_COVERAGE_STATUS,
  INSURANCE_COVERAGE_STATUS_COLOR,
  type InsuranceCoverageStatus,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { cx } from '@/lib/cx';
import type { InsuranceCoverage } from '../types';
import { InsuranceCertificateItem } from './InsuranceCertificateList';
import styles from './InsuranceCertificateList.module.css';

/**
 * Bảo hiểm của một chuyến theo TỪNG sản phẩm khách đã trả (ADR 0064) — chi tiết chuyến của khách
 * và chi tiết đơn của gian hàng. Chỉ đọc.
 *
 * Khác `InsuranceCertificateList` (chỉ GCN đã cấp): khách đã trả `IV`/`IP` phải thấy tiền đó đang
 * ở đâu kể cả khi GCN CHƯA có — chờ bàn giao, đang phát hành, phát hành lỗi — hoặc không bao giờ
 * có (đã hoàn phí, đã thu hồi). Dòng `issued` dùng lại đúng thẻ GCN (số, hiệu lực, nút xem, nhãn
 * THỬ NGHIỆM).
 *
 * Danh sách rỗng ⇒ không render gì: chuyến không mua bảo hiểm.
 */
export function InsuranceCoverageList({
  coverage,
  headingLevel = 2,
  className,
}: {
  coverage: readonly InsuranceCoverage[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const t = useTranslations('Insurance');
  if (coverage.length === 0) return null;
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <section className={cx(styles.block, className)}>
      <Heading className={styles.title}>
        <SafetyCertificateOutlined aria-hidden /> {t('coverage.title')}
      </Heading>
      <ul className={styles.list}>
        {coverage.map((item) =>
          item.status === INSURANCE_COVERAGE_STATUS.ISSUED && item.certificate ? (
            <InsuranceCertificateItem key={item.kind} cert={item.certificate} />
          ) : (
            <CoverageItem key={item.kind} item={item} />
          ),
        )}
      </ul>
    </section>
  );
}

function CoverageItem({ item }: { item: InsuranceCoverage }) {
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const productName =
    localized(item.productNameVi, item.productNameEn) ??
    domainLabel('insuranceProductKind', item.kind);
  const status = item.status as InsuranceCoverageStatus;

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.product}>{productName}</span>
        <Tag color={INSURANCE_COVERAGE_STATUS_COLOR[status]} className={styles.testTag}>
          {t(`coverage.status.${status}`)}
        </Tag>
      </div>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('coverage.premium')}</dt>
          <dd>{fmt.money(item.premiumAmount)}</dd>
        </div>
      </dl>
      <p className={styles.statusNote}>{t(`coverage.note.${status}`)}</p>
    </li>
  );
}
