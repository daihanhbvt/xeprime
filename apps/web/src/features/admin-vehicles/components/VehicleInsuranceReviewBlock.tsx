'use client';

import { FileImageOutlined, WarningOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { Alert, App, Button, Image, Tag } from 'antd';
import { useFormatter, useTranslations } from 'next-intl';
import { useId } from 'react';
import { INSURED_VALUE_DEVIATION_WARN_PERCENT } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import type { VehicleInsuranceReview, VehicleRegistrationImage } from '../types';
import styles from './VehicleInsuranceReviewBlock.module.css';

/**
 * Khối "Bảo hiểm và giấy tờ" (đợt rà Admin 16/11/2026) — CHỈ ĐỌC, dữ liệu SỐNG của xe, dùng chung cho
 * màn Duyệt xe và màn Xe trên sàn. Giá trị xe quyết định phí bảo hiểm vật chất xe khách trả và mức bồi
 * thường (ADR 0088), nên người duyệt phải thấy nó cạnh giá tham khảo (ADR 0090).
 *
 * Chỉ CẢNH BÁO, không chặn: lệch giá trị và lệch biển số là việc cần hỏi lại chủ xe. Ảnh cà vẹt là tài
 * liệu riêng tư: chỉ xin URL khi người xem bấm, mỗi lần xin là một dòng audit ở server.
 */
export function VehicleInsuranceReviewBlock({
  review,
  fetchImage,
}: {
  review: VehicleInsuranceReview;
  /** Xin URL ảnh cà vẹt — endpoint khác nhau giữa màn duyệt xe (theo phiếu) và Xe trên sàn (theo xe). */
  fetchImage: () => Promise<VehicleRegistrationImage>;
}) {
  const t = useTranslations('AdminVehicles.insuranceReview');
  const fmt = useAppFormat();
  const numbers = useFormatter();
  const domainLabel = useDomainLabel();
  const titleId = useId();
  const reg = review.registration;

  const deviation =
    review.deviationPercent == null
      ? null
      : numbers.number(review.deviationPercent / 100, {
          style: 'percent',
          signDisplay: 'exceptZero',
          maximumFractionDigits: 1,
        });

  const facts: WorkDrawerFact[] = [
    {
      key: 'insuredValue',
      label: t('insuredValue'),
      value: review.insuredValue ? (
        fmt.money(review.insuredValue)
      ) : (
        <span className={styles.muted}>{t('insuredValueNone')}</span>
      ),
    },
    {
      key: 'referenceValue',
      label: t('referenceValue'),
      value: review.referenceValue ? (
        t('referenceValueDetail', {
          amount: fmt.money(review.referenceValue.amount),
          age: review.referenceValue.age,
          percent: review.referenceValue.residualPercent,
        })
      ) : (
        <span className={styles.muted}>{t('referenceNone')}</span>
      ),
    },
    ...(deviation
      ? [
          {
            key: 'deviation',
            label: t('deviation'),
            value: (
              <span className={review.deviationWarning ? styles.warn : undefined}>
                {review.deviationWarning ? <WarningOutlined aria-hidden /> : null} {deviation}
              </span>
            ),
          },
        ]
      : []),
  ];

  const regFacts: WorkDrawerFact[] = reg
    ? [
        { key: 'holderName', label: t('holderName'), value: reg.holderName ?? '-' },
        {
          key: 'chassisNumber',
          label: t('chassisNumber'),
          value: <span className={styles.mono}>{reg.chassisNumber ?? '-'}</span>,
        },
        {
          key: 'engineNumber',
          label: t('engineNumber'),
          value: <span className={styles.mono}>{reg.engineNumber ?? '-'}</span>,
        },
        { key: 'plateNumber', label: t('plateNumber'), value: reg.plateNumber ?? '-' },
      ]
    : [];

  return (
    <section className={styles.block} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h3 id={titleId} className={styles.title}>
          {t('title')}
        </h3>
        <InfoHint label={t('hintLabel')} content={t('hint')} />
      </div>

      {review.deviationWarning ? (
        <Alert
          type="warning"
          showIcon
          title={t('deviationWarning', { threshold: INSURED_VALUE_DEVIATION_WARN_PERCENT })}
        />
      ) : null}
      <WorkDrawerFacts items={facts} />

      <div className={styles.group}>
        <h4 className={styles.groupTitle}>{t('eligibility')}</h4>
        {review.eligibilityGaps.length === 0 ? (
          <Tag color="success">{t('eligible')}</Tag>
        ) : (
          <ul className={styles.gaps}>
            {review.eligibilityGaps.map((gap) => (
              <li key={gap}>
                <Tag color="warning">{domainLabel('insuranceEligibilityGap', gap)}</Tag>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.group}>
        <h4 className={styles.groupTitle}>{t('registration')}</h4>
        {reg ? (
          <>
            {reg.plateMatches === false ? (
              <Alert type="warning" showIcon title={t('plateMismatch')} />
            ) : null}
            <WorkDrawerFacts items={regFacts} />
            {reg.hasImage ? (
              <RegistrationImage key={reg.documentId} fetchImage={fetchImage} />
            ) : null}
          </>
        ) : (
          <p className={styles.muted}>{t('registrationNone')}</p>
        )}
      </div>
    </section>
  );
}

/** Ảnh cà vẹt chỉ xin khi người xem bấm — mỗi lượt xin URL là một dòng audit ở server. */
function RegistrationImage({
  fetchImage,
}: {
  fetchImage: () => Promise<VehicleRegistrationImage>;
}) {
  const t = useTranslations('AdminVehicles.insuranceReview');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const image = useMutation({
    mutationFn: fetchImage,
    onError: (err) => message.error(errorMessage(err)),
  });

  if (image.data) {
    return <Image src={image.data.url} alt={t('registration')} className={styles.image} />;
  }
  return (
    <div className={styles.imageAction}>
      <Button
        icon={<FileImageOutlined aria-hidden />}
        loading={image.isPending}
        onClick={() => {
          if (!image.isPending) image.mutate();
        }}
      >
        {t('openImage')}
      </Button>
      <span className={styles.muted}>{t('openImageHint')}</span>
    </div>
  );
}
