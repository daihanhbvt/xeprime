'use client';

import { ExportOutlined } from '@ant-design/icons';
import { Alert, App, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { INSURANCE_POLICY_STATUS, INSURANCE_POLICY_STATUS_META } from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
  type WorkDrawerFact,
} from '@/components/overlay/WorkDrawer';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useLocalizedText } from '@/i18n/localized';
import { useCertificateDetail, useRetryCertificate, useVoidCertificate } from '../hooks';
import type { InsurancePolicyDetail } from '../types';
import styles from './InsuranceCertificateDrawer.module.css';

/** Cùng sàn với `VoidInsurancePolicyDto.reason` — thu hồi là quyết định tiền, phải có lý do thật. */
const VOID_REASON_MIN = 5;
const VOID_REASON_MAX = 500;

/**
 * Chi tiết MỘT hợp đồng bảo hiểm — khuôn PANEL LÀM VIỆC (`components/overlay/WorkDrawer`).
 *
 * Bên trái là hồ sơ hợp đồng, bên phải là bằng chứng NGUYÊN TRẠNG với đối tác (yêu cầu, phản hồi,
 * bản chụp sản phẩm) — thứ người trực đưa cho đối tác khi đối chiếu. Hai quyết định ở chân panel:
 * thử phát hành lại (chỉ hợp đồng lỗi) và thu hồi (lỗi hoặc đã cấp, bắt buộc lý do, có audit).
 */
export function InsuranceCertificateDrawer({
  id,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: {
  id: string | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('AdminInsurance.drawer');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();
  const detail = useCertificateDetail(id);
  const retry = useRetryCertificate();
  const voidPolicy = useVoidCertificate();
  const policy = detail.data;

  // Hộp thoại GẮN với hợp đồng đã mở nó — sang hợp đồng khác thì hộp thoại cũ tự không còn.
  const [voidFor, setVoidFor] = useState<string | null>(null);
  const voidOpen = voidFor !== null && voidFor === id;
  const busy = retry.isPending || voidPolicy.isPending;

  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [policy?.id]);

  const failed = policy?.status === INSURANCE_POLICY_STATUS.FAILED;
  const issued = policy?.status === INSURANCE_POLICY_STATUS.ISSUED;

  function submitRetry() {
    if (!id || busy) return;
    retry.mutate(id, {
      onSuccess: () => message.success(t('retryQueued')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function submitVoid(reason: string) {
    if (!id || busy) return;
    // Chốt hợp đồng KẾ ngay lúc gửi: thu hồi xong, dòng có thể rời hàng đợi đang lọc.
    const goTo = nextId ?? previousId;
    voidPolicy.mutate(
      { id, reason },
      {
        onSuccess: () => {
          message.success(t('voidDialog.done'));
          setVoidFor(null);
          if (goTo) onNavigate(goTo);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const footer = !policy ? null : (
    <WorkDrawerFooter
      hint={failed ? t('footer.failed') : issued ? t('footer.issued') : t('footer.other')}
      actions={
        failed || issued ? (
          <>
            <Button danger disabled={busy} onClick={() => id && setVoidFor(id)}>
              {t('void')}
            </Button>
            {failed ? (
              <Button
                type="primary"
                disabled={busy}
                loading={retry.isPending}
                onClick={submitRetry}
              >
                {t('retry')}
              </Button>
            ) : null}
          </>
        ) : null
      }
    />
  );

  return (
    <>
      <DetailDrawer
        open={Boolean(id)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={t('title')}
        title={
          <WorkDrawerTitle
            label={t('title')}
            code={policy?.bookingCode ?? null}
            status={
              policy ? (
                <StatusTag
                  value={policy.status}
                  meta={INSURANCE_POLICY_STATUS_META}
                  group="insurancePolicyStatus"
                />
              ) : null
            }
          />
        }
        extra={
          <WorkDrawerPager
            previousId={previousId}
            nextId={nextId}
            onNavigate={onNavigate}
            previousLabel={t('previous')}
            nextLabel={t('next')}
          />
        }
        loading={detail.isLoading}
        error={detail.isError && !policy}
        errorTitle={t('loadError')}
        onRetry={() => void detail.refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={footer}
      >
        {policy ? (
          <WorkDrawerLayout
            key={policy.id}
            ref={topRef}
            sideLabel={t('sideLabel')}
            main={<PolicyFile policy={policy} />}
            side={<PolicyEvidence policy={policy} />}
          />
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        open={voidOpen}
        title={t('voidDialog.title')}
        summary={
          policy
            ? t('voidDialog.summary', {
                amount: fmt.money(policy.premiumAmount),
                code: policy.bookingCode,
              })
            : undefined
        }
        audienceHint={t('voidDialog.hint')}
        label={t('voidDialog.reasonLabel')}
        placeholder={t('voidDialog.reasonPlaceholder')}
        requiredMessage={t('voidDialog.reasonRequired')}
        minLength={VOID_REASON_MIN}
        maxLength={VOID_REASON_MAX}
        submitText={t('void')}
        loading={voidPolicy.isPending}
        onSubmit={submitVoid}
        onClose={() => setVoidFor(null)}
      />
    </>
  );
}

function PolicyFile({ policy }: { policy: InsurancePolicyDetail }) {
  const t = useTranslations('AdminInsurance.drawer');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const localized = useLocalizedText();
  const empty = <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>;
  const stamp = (value: string | null | undefined) => (value ? fmt.dateTime(value) : empty);
  const productName =
    localized(policy.productNameVi, policy.productNameEn) ??
    domainLabel('insuranceProductKind', policy.productKind);

  const facts: WorkDrawerFact[] = [
    {
      key: 'booking',
      label: t('facts.booking'),
      value: (
        <Link href={`${ROUTES.ADMIN.BOOKINGS}?q=${encodeURIComponent(policy.bookingCode)}`}>
          {policy.bookingCode}
        </Link>
      ),
    },
    { key: 'tenant', label: t('facts.tenant'), value: policy.tenantName },
    { key: 'customer', label: t('facts.customer'), value: policy.customerName },
    { key: 'vehicle', label: t('facts.vehicle'), value: policy.vehicleName },
    { key: 'product', label: t('facts.product'), value: productName },
    { key: 'premium', label: t('facts.premium'), value: fmt.money(policy.premiumAmount) },
    { key: 'partner', label: t('facts.partner'), value: policy.partnerName },
    {
      key: 'partnerProductCode',
      label: t('facts.partnerProductCode'),
      value: policy.partnerProductCode ?? empty,
    },
    {
      key: 'certificate',
      label: t('facts.certificate'),
      wide: true,
      value: policy.certificateNumber ? (
        <span className={styles.copyable}>
          <span className={styles.mono}>{policy.certificateNumber}</span>
          <CopyButton value={policy.certificateNumber} label={t('copy')} />
          {policy.certificateUrl ? (
            <Button
              size="small"
              href={policy.certificateUrl}
              target="_blank"
              rel="noopener noreferrer"
              icon={<ExportOutlined aria-hidden />}
            >
              {t('viewCertificate')}
            </Button>
          ) : null}
        </span>
      ) : (
        empty
      ),
    },
    {
      key: 'coverage',
      label: t('facts.coverage'),
      value:
        policy.coverageFrom && policy.coverageTo
          ? fmt.dateTimeRange(policy.coverageFrom, policy.coverageTo)
          : empty,
    },
    { key: 'issuedAt', label: t('facts.issuedAt'), value: stamp(policy.issuedAt) },
    { key: 'consentAt', label: t('facts.consentAt'), value: stamp(policy.consentAt) },
    { key: 'attempts', label: t('facts.attempts'), value: String(policy.issueAttempts) },
    { key: 'lastAttemptAt', label: t('facts.lastAttemptAt'), value: stamp(policy.lastAttemptAt) },
    { key: 'nextAttemptAt', label: t('facts.nextAttemptAt'), value: stamp(policy.nextAttemptAt) },
    {
      key: 'lastError',
      label: t('facts.lastError'),
      wide: true,
      multiline: true,
      value: policy.lastErrorMessage ?? policy.lastErrorCode ?? empty,
    },
    {
      key: 'idempotencyKey',
      label: t('facts.idempotencyKey'),
      wide: true,
      value: <span className={styles.mono}>{policy.idempotencyKey}</span>,
    },
    { key: 'createdAt', label: t('facts.createdAt'), value: stamp(policy.createdAt) },
    ...(policy.cancelledAt
      ? [{ key: 'cancelledAt', label: t('facts.cancelledAt'), value: stamp(policy.cancelledAt) }]
      : []),
    ...(policy.voidedAt
      ? [{ key: 'voidedAt', label: t('facts.voidedAt'), value: stamp(policy.voidedAt) }]
      : []),
  ];

  return (
    <div className={styles.file}>
      {policy.isTest ? <Alert type="warning" showIcon title={t('testNote')} /> : null}
      <WorkDrawerFacts items={facts} />
    </div>
  );
}

function PolicyEvidence({ policy }: { policy: InsurancePolicyDetail }) {
  const t = useTranslations('AdminInsurance.drawer');
  const blocks = [
    { key: 'request', label: t('payload.request'), value: policy.requestPayload },
    { key: 'response', label: t('payload.response'), value: policy.responsePayload },
    { key: 'product', label: t('payload.product'), value: policy.productSnapshot },
  ];
  return (
    <div className={styles.evidence}>
      {blocks.map((block) => (
        <section key={block.key} className={styles.payload}>
          <h3 className={styles.payloadTitle}>{block.label}</h3>
          {block.value ? (
            <pre className={styles.pre}>{JSON.stringify(block.value, null, 2)}</pre>
          ) : (
            <p className={styles.muted}>{t('payload.empty')}</p>
          )}
        </section>
      ))}
    </div>
  );
}
