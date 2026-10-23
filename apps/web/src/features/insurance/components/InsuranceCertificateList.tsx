'use client';

import { ExportOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { cx } from '@/lib/cx';
import type { InsuranceCertificate } from '../types';
import styles from './InsuranceCertificateList.module.css';

/**
 * Giấy chứng nhận bảo hiểm ĐÃ CẤP của một chuyến (ADR 0064) — dùng chung cho chi tiết chuyến của
 * khách và chi tiết đơn của gian hàng. Chỉ đọc.
 *
 * GCN thử nghiệm (`isTest` — adapter giả lập ở dev/staging) mang nhãn THỬ NGHIỆM ở ngay cạnh số
 * chứng nhận: không có hiệu lực bảo hiểm, và không ai được đọc nhầm nó thành một hợp đồng thật.
 *
 * Danh sách rỗng ⇒ không render gì: chưa bàn giao xe thì chưa có giấy nào để nói tới.
 */
export function InsuranceCertificateList({
  certificates,
  headingLevel = 2,
  className,
}: {
  certificates: readonly InsuranceCertificate[];
  headingLevel?: 2 | 3;
  className?: string;
}) {
  const t = useTranslations('Insurance');
  if (certificates.length === 0) return null;
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  return (
    <section className={cx(styles.block, className)}>
      <Heading className={styles.title}>
        <SafetyCertificateOutlined aria-hidden /> {t('certificate.title')}
      </Heading>
      <ul className={styles.list}>
        {certificates.map((cert) => (
          <InsuranceCertificateItem key={cert.id} cert={cert} />
        ))}
      </ul>
    </section>
  );
}

/** Một GCN đã cấp — dùng lại ở `InsuranceCoverageList` cho dòng `issued`. */
export function InsuranceCertificateItem({ cert }: { cert: InsuranceCertificate }) {
  const t = useTranslations('Insurance');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const productName =
    localized(cert.productNameVi, cert.productNameEn) ??
    domainLabel('insuranceProductKind', cert.productKind);

  return (
    <li className={styles.item}>
      <div className={styles.head}>
        <span className={styles.product}>{productName}</span>
        {cert.isTest ? (
          <Tag color={STATUS_COLOR.WARNING} className={styles.testTag}>
            {t('certificate.testTag')}
          </Tag>
        ) : null}
      </div>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t('certificate.number')}</dt>
          <dd className={styles.number}>
            <span className={styles.mono}>{cert.certificateNumber}</span>
            <CopyButton value={cert.certificateNumber} label={t('certificate.copyNumber')} />
          </dd>
        </div>
        {cert.coverageFrom && cert.coverageTo ? (
          <div className={styles.fact}>
            <dt>{t('certificate.coverage')}</dt>
            <dd>{fmt.dateTimeRange(cert.coverageFrom, cert.coverageTo)}</dd>
          </div>
        ) : null}
        <div className={styles.fact}>
          <dt>{t('certificate.partner')}</dt>
          <dd>{cert.partnerName}</dd>
        </div>
      </dl>
      {cert.isTest ? <p className={styles.testNote}>{t('certificate.testNote')}</p> : null}
      {cert.certificateUrl ? (
        <Button
          href={cert.certificateUrl}
          target="_blank"
          rel="noopener noreferrer"
          icon={<ExportOutlined aria-hidden />}
          className={styles.view}
        >
          {t('certificate.view')}
        </Button>
      ) : null}
    </li>
  );
}
