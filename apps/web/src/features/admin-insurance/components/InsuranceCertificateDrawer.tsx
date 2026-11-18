'use client';

import { ExportOutlined } from '@ant-design/icons';
import { Alert, App, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { absoluteMoney, isNegativeMoney, isZeroMoney, sumMoney } from '@xeprime/domain';
import {
  INSURANCE_POLICY_STATUS,
  INSURANCE_POLICY_STATUS_META,
  INSURANCE_VOID_BRANCH,
  INSURANCE_VOID_REFUND_TIMING,
} from '@xeprime/types';
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
import {
  useCertificateDetail,
  useCertificatePricing,
  useRetryCertificate,
  useVoidCertificate,
} from '../hooks';
import type { InsurancePolicyDetail, InsuranceVoidPlan, VoidInsurancePolicyResult } from '../types';
import styles from './InsuranceCertificateDrawer.module.css';

/** Cùng sàn với `VoidInsurancePolicyDto.reason` — thu hồi là quyết định tiền, phải có lý do thật. */
const VOID_REASON_MIN = 5;
const VOID_REASON_MAX = 500;
/** Cùng trần với `VoidInsurancePolicyDto.partnerReference` / cột `void_partner_reference`. */
const VOID_REFERENCE_MAX = 100;

/**
 * Chi tiết MỘT hợp đồng bảo hiểm — khuôn PANEL LÀM VIỆC (`components/overlay/WorkDrawer`).
 *
 * Bên trái là hồ sơ hợp đồng, bên phải là bằng chứng NGUYÊN TRẠNG với đối tác (yêu cầu, phản hồi,
 * bản chụp sản phẩm) — thứ người trực đưa cho đối tác khi đối chiếu. Hai quyết định ở chân panel:
 * thử phát hành lại (chỉ hợp đồng lỗi) và thu hồi (lỗi hoặc đã cấp, bắt buộc lý do, có audit).
 *
 * Thu hồi có HAI nhánh do server quyết theo hiệu lực (ADR 0093, `voidPlan`): chưa từng có hiệu lực ⇒
 * huỷ + hoàn phí vào Ví điểm khách; đã có hiệu lực ⇒ thu hồi, không hoàn, phí vẫn kê trả hãng. Hộp
 * thoại nói đúng nhánh và số tiền trước khi người trực bấm.
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
  const voidSummary = useVoidSummary();
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
  const plan = policy?.voidPlan ?? null;
  // Đã nằm trong bảng kê trả hãng ⇒ không huỷ-hoàn được: ẩn nút, chân panel nói lý do.
  const canVoid = plan != null && !plan.blockedByRemittance;

  function submitRetry() {
    if (!id || busy) return;
    retry.mutate(id, {
      onSuccess: () => message.success(t('retryQueued')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function submitVoid(reason: string, _choice?: string, reference?: string) {
    if (!id || busy) return;
    // Chốt hợp đồng KẾ ngay lúc gửi: thu hồi xong, dòng có thể rời hàng đợi đang lọc.
    const goTo = nextId ?? previousId;
    voidPolicy.mutate(
      { id, reason, ...(reference ? { partnerReference: reference } : {}) },
      {
        onSuccess: (result) => {
          message.success(voidDoneMessage(result));
          setVoidFor(null);
          if (goTo) onNavigate(goTo);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  /** Câu báo sau khi thu hồi — theo đúng nhánh và khoản server đã làm. */
  function voidDoneMessage(result: VoidInsurancePolicyResult): string {
    if (result.branch === INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE) return t('voidDialog.doneKept');
    if (result.refundedAmount) {
      return t('voidDialog.doneRefunded', { amount: fmt.money(result.refundedAmount) });
    }
    if (result.refundTiming === INSURANCE_VOID_REFUND_TIMING.AFTER_SETTLEMENT) {
      return t('voidDialog.doneRefundLater');
    }
    return t('voidDialog.doneCancelled');
  }

  const footer = !policy ? null : (
    <WorkDrawerFooter
      hint={
        plan?.blockedByRemittance
          ? t('footer.remitted')
          : failed
            ? t('footer.failed')
            : issued
              ? t('footer.issued')
              : t('footer.other')
      }
      actions={
        canVoid || failed ? (
          <>
            {canVoid ? (
              <Button danger disabled={busy} onClick={() => id && setVoidFor(id)}>
                {t('void')}
              </Button>
            ) : null}
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
        open={voidOpen && plan != null}
        title={
          plan?.branch === INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE
            ? t('voidDialog.titleKeep')
            : t('voidDialog.titleCancel')
        }
        summary={policy && plan ? voidSummary(plan, policy) : undefined}
        reference={
          plan?.partnerReferenceRequired
            ? {
                label: t('voidDialog.referenceLabel'),
                placeholder: t('voidDialog.referencePlaceholder'),
                required: true,
                requiredMessage: t('voidDialog.referenceRequired'),
                maxLength: VOID_REFERENCE_MAX,
              }
            : undefined
        }
        audienceHint={t('voidDialog.hint')}
        label={t('voidDialog.reasonLabel')}
        placeholder={t('voidDialog.reasonPlaceholder')}
        requiredMessage={t('voidDialog.reasonRequired')}
        minLength={VOID_REASON_MIN}
        maxLength={VOID_REASON_MAX}
        submitText={
          plan?.branch === INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE
            ? t('void')
            : t('voidDialog.submitCancel')
        }
        loading={voidPolicy.isPending}
        onSubmit={submitVoid}
        onClose={() => setVoidFor(null)}
      />
    </>
  );
}

/**
 * Câu tóm tắt của hộp thu hồi — nói trước tiền đi đâu, theo đúng kế hoạch server trả (ADR 0093).
 */
function useVoidSummary() {
  const t = useTranslations('AdminInsurance.drawer.voidDialog');
  const fmt = useAppFormat();
  return (plan: InsuranceVoidPlan, policy: InsurancePolicyDetail): string => {
    if (plan.branch === INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE) {
      return t('summaryKeepPayable', {
        amount: fmt.money(policy.premiumAmount),
        code: policy.bookingCode,
      });
    }
    const amount = plan.refundAmount ? fmt.money(plan.refundAmount) : '';
    switch (plan.refundTiming) {
      case INSURANCE_VOID_REFUND_TIMING.NOW:
        return t('summaryRefundNow', { amount, code: policy.bookingCode });
      case INSURANCE_VOID_REFUND_TIMING.AFTER_SETTLEMENT:
        return t('summaryRefundLater', { amount, code: policy.bookingCode });
      case INSURANCE_VOID_REFUND_TIMING.VIA_HOLD:
        return t('summaryViaHold', { code: policy.bookingCode });
      default:
        return t('summaryNoRefund', { code: policy.bookingCode });
    }
  };
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
    // Lý do + chứng từ đối chiếu của lượt thu hồi / huỷ (ADR 0093).
    ...(policy.voidReason
      ? [
          {
            key: 'voidReason',
            label: t('facts.voidReason'),
            wide: true,
            multiline: true,
            value: policy.voidReason,
          },
        ]
      : []),
    ...(policy.voidPartnerReference
      ? [
          {
            key: 'voidPartnerReference',
            label: t('facts.voidPartnerReference'),
            value: <span className={styles.mono}>{policy.voidPartnerReference}</span>,
          },
        ]
      : []),
  ];

  return (
    <div className={styles.file}>
      {policy.isTest ? <Alert type="warning" showIcon title={t('testNote')} /> : null}
      <WorkDrawerFacts items={facts} />
      <PolicyPricing policyId={policy.id} />
    </div>
  );
}

/**
 * Phí thực tế của hợp đồng (ADR 0091 điều 2): giá trị xe, bậc đã áp, phí đã thu, phí MIC tính lúc cấp
 * và chênh lệch — người trực thấy ngay chuyến nào XePrime đang bù hay thu dư.
 */
function PolicyPricing({ policyId }: { policyId: string }) {
  const t = useTranslations('AdminInsurance.drawer.pricing');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const pricing = useCertificatePricing(policyId);
  if (pricing.isLoading) return <Skeleton active paragraph={{ rows: 2 }} />;
  if (pricing.isError || !pricing.data) {
    return <Alert type="error" showIcon title={t('loadError')} />;
  }
  const p = pricing.data;
  const empty = <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>;
  // So tiền trên CHUỖI (ADR 0007) — dương = thu dư, âm = XePrime bù.
  const difference = p.differenceAmount;
  const items: WorkDrawerFact[] = [
    {
      key: 'insuredValue',
      label: t('insuredValue'),
      value: p.insuredValue ? fmt.money(p.insuredValue) : empty,
    },
    {
      key: 'tier',
      label: t('tier'),
      value:
        p.tierMaxDays != null && p.tierPercent != null
          ? t('tierValue', { days: p.tierMaxDays, percent: fmt.rate(p.tierPercent) })
          : empty,
    },
    { key: 'collected', label: t('collected'), value: fmt.money(p.premiumAmount) },
    // Nguồn phí chốt lúc duyệt (ADR 0097): MIC báo, hay công thức bậc khi MIC lỗi/chậm.
    {
      key: 'source',
      label: t('source'),
      value: p.premiumSource ? (
        <span className={styles.stack}>
          <span>{t(`sources.${p.premiumSource}`)}</span>
          {p.premiumQuoteFallbackReason ? (
            <span className={styles.muted}>
              {t(`fallbackReasons.${p.premiumQuoteFallbackReason}`)}
            </span>
          ) : null}
          {p.formulaPremiumAmount && p.formulaPremiumAmount !== p.premiumAmount ? (
            <span className={styles.muted}>
              {t('formulaWas', { amount: fmt.money(p.formulaPremiumAmount) })}
            </span>
          ) : null}
        </span>
      ) : (
        t('sourceUnrecorded')
      ),
    },
    {
      key: 'partner',
      label: t('partner'),
      value: p.partnerPremiumAmount ? fmt.money(p.partnerPremiumAmount) : t('notIssued'),
    },
    {
      key: 'difference',
      label: t('difference'),
      value:
        difference == null
          ? empty
          : isZeroMoney(difference)
            ? t('differenceNone')
            : isNegativeMoney(difference)
              ? t('differenceUnder', { amount: fmt.money(absoluteMoney(difference)) })
              : t('differenceOver', { amount: fmt.money(difference) }),
    },
    // Phí thu hộ của nền tảng (ADR 0091 điều 3) — doanh thu XePrime, KHÔNG chuyển MIC.
    ...(isZeroMoney(p.serviceFeeAmount)
      ? []
      : [{ key: 'serviceFee', label: t('serviceFee'), value: fmt.money(p.serviceFeeAmount) }]),
    // Quá giờ trả mà không cấp được ⇒ đã tự hoàn phí + phí thu hộ vào Ví điểm khách (ADR 0091 điều 7).
    ...(p.refundedAt
      ? [
          {
            key: 'refunded',
            label: t('refunded'),
            value: t('refundedValue', {
              amount: fmt.money(sumMoney([p.premiumAmount, p.serviceFeeAmount])),
              at: fmt.dateTime(p.refundedAt),
            }),
          },
        ]
      : []),
  ];
  return (
    <section aria-label={t('title')}>
      <h3 className={styles.sectionTitle}>{t('title')}</h3>
      <WorkDrawerFacts items={items} />
    </section>
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
