'use client';

import { ReloadOutlined } from '@ant-design/icons';
import { App, Alert, Button, Image, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useId, useState } from 'react';
import {
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_REJECT_REASON,
  DRIVER_LICENCE_REJECT_REASON_VALUES,
  DRIVER_LICENCE_STATUS,
  DRIVER_LICENCE_STATUS_META,
  type DriverLicencePendingReason,
  type DriverLicenceStatus,
} from '@xeprime/types';
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
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useApproveDriverLicence,
  usePlatformDriverLicence,
  usePlatformDriverLicenceImage,
  useRejectDriverLicence,
} from '../hooks/use-admin-driver-licences';
import type {
  ApproveDriverLicenceInput,
  PlatformDriverLicence,
  RejectDriverLicenceInput,
} from '../types';
import { DriverLicenceApproveForm } from './DriverLicenceApproveForm';
import styles from './DriverLicenceReviewDrawer.module.css';

/** Lý do chỉ người duyệt được ghi kèm lời nhắn bắt buộc. */
const TEXT_REQUIRED_REASONS = [DRIVER_LICENCE_REJECT_REASON.OTHER] as const;

/**
 * Panel duyệt MỘT lượt nộp bằng lái — hình làm việc chung (`WorkDrawer`): ảnh + tài khoản + kết
 * quả bộ đọc bên trái, thông tin ĐỐI CHIẾU (sửa được) bên phải, quyết định ở chân panel.
 *
 * Duyệt thành công thì panel đi sang lượt kế tiếp — mốc kế tiếp chụp TRƯỚC lượt quyết định,
 * vì lượt vừa duyệt rời khỏi danh sách đang lọc và trước/sau mất chỗ neo.
 */
export function DriverLicenceReviewDrawer({
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
  const t = useTranslations('AdminDriverLicences');
  const dl = useDomainLabel();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const formId = useId();

  const detailQ = usePlatformDriverLicence(id);
  const detail = detailQ.data;
  const approve = useApproveDriverLicence();
  const reject = useRejectDriverLicence();
  const [rejectFor, setRejectFor] = useState<string | null>(null);

  const pending = detail?.status === DRIVER_LICENCE_STATUS.PENDING_REVIEW;
  const deciding = approve.isPending || reject.isPending;

  function afterDecision(nextAfter: string | null) {
    if (nextAfter) onNavigate(nextAfter);
    else onClose();
  }

  function submitApprove(body: ApproveDriverLicenceInput) {
    if (!detail || deciding) return;
    const nextAfter = nextId;
    approve.mutate(
      { id: detail.id, body },
      {
        onSuccess: () => {
          void message.success(t('toasts.approved'));
          afterDecision(nextAfter);
        },
        onError: (error) => void message.error(errorMessage(error)),
      },
    );
  }

  function submitReject(note: string, reason?: string) {
    if (!rejectFor || deciding || !reason) return;
    const nextAfter = nextId;
    reject.mutate(
      {
        id: rejectFor,
        // `reason` đến từ đúng danh sách `DRIVER_LICENCE_REJECT_REASON_VALUES` của hộp lý do.
        body: { reason: reason as RejectDriverLicenceInput['reason'], note: note || null },
      },
      {
        onSuccess: () => {
          setRejectFor(null);
          void message.success(t('toasts.rejected'));
          afterDecision(nextAfter);
        },
        onError: (error) => void message.error(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(id)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={
          detail ? t('drawer.ariaLabel', { name: detail.owner.displayName }) : t('drawer.title')
        }
        title={
          <WorkDrawerTitle
            label={t('drawer.title')}
            code={detail?.fullName ?? detail?.owner.displayName}
            status={
              detail ? (
                <StatusTag
                  value={detail.status as DriverLicenceStatus}
                  meta={DRIVER_LICENCE_STATUS_META}
                  group="driverLicenceStatus"
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
            previousLabel={t('drawer.previous')}
            nextLabel={t('drawer.next')}
          />
        }
        loading={detailQ.isLoading}
        error={detailQ.isError && !detail}
        errorTitle={t('drawer.loadError')}
        onRetry={() => void detailQ.refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={
          detail ? (
            pending ? (
              <WorkDrawerFooter
                hint={t('footer.pending')}
                actions={
                  <>
                    <Button danger onClick={() => setRejectFor(detail.id)} disabled={deciding}>
                      {t('actions.reject')}
                    </Button>
                    <Button
                      type="primary"
                      htmlType="submit"
                      form={formId}
                      loading={approve.isPending}
                      disabled={deciding && !approve.isPending}
                    >
                      {t('actions.approve')}
                    </Button>
                  </>
                }
              />
            ) : (
              <WorkDrawerFooter hint={t('footer.decided')} />
            )
          ) : null
        }
      >
        {detail ? (
          // `key` theo LƯỢT NỘP: form đối chiếu của lượt A không bao giờ được gửi cho lượt B.
          <WorkDrawerLayout
            key={detail.id}
            sideLabel={t('form.title')}
            main={<LicenceRecord detail={detail} />}
            side={
              pending ? (
                <DriverLicenceApproveForm
                  formId={formId}
                  detail={detail}
                  disabled={deciding}
                  onSubmit={submitApprove}
                />
              ) : (
                <DecidedFacts detail={detail} />
              )
            }
          />
        ) : null}
      </DetailDrawer>

      <ReasonDialog
        open={rejectFor !== null}
        title={t('reject.title')}
        audienceHint={t('reject.audience')}
        choices={DRIVER_LICENCE_REJECT_REASON_VALUES.map((value) => ({
          value,
          label: dl('driverLicenceRejectReason', value),
        }))}
        choiceLabel={t('reject.choiceLabel')}
        choiceRequiredMessage={t('reject.choiceRequired')}
        textRequiredFor={TEXT_REQUIRED_REASONS}
        label={t('reject.label')}
        placeholder={t('reject.placeholder')}
        requiredMessage={t('reject.required')}
        minLength={1}
        submitText={t('actions.reject')}
        loading={reject.isPending}
        onSubmit={submitReject}
        onClose={() => setRejectFor(null)}
      />
    </>
  );
}

/** Bên trái: ảnh (to, phóng được), tài khoản, kết quả bộ đọc. */
function LicenceRecord({ detail }: { detail: PlatformDriverLicence }) {
  const t = useTranslations('AdminDriverLicences.drawer');
  const fmt = useAppFormat();
  const tPending = useTranslations('AdminDriverLicences.pendingReason');
  const image = usePlatformDriverLicenceImage(detail.id);

  const account: WorkDrawerFact[] = [
    { key: 'name', label: t('account.name'), value: detail.owner.displayName },
    { key: 'phone', label: t('account.phone'), value: detail.owner.phone },
    { key: 'email', label: t('account.email'), value: detail.owner.email },
    {
      key: 'submittedAt',
      label: t('account.submittedAt'),
      value: fmt.dateTime(detail.submittedAt),
    },
    {
      key: 'reviewRequestedAt',
      label: t('account.reviewRequestedAt'),
      value: detail.reviewRequestedAt ? fmt.dateTime(detail.reviewRequestedAt) : null,
    },
  ].filter((fact) => fact.value);

  const reading = detail.reading;
  const readingFacts: WorkDrawerFact[] = [
    {
      key: 'pendingReason',
      label: t('reading.pendingReason'),
      value: reading.pendingReason
        ? tPending(reading.pendingReason as DriverLicencePendingReason)
        : null,
    },
    {
      key: 'confidence',
      label: t('reading.confidence'),
      value: reading.confidence
        ? t(`reading.confidenceValues.${reading.confidence as 'high'}`)
        : null,
    },
    {
      key: 'provider',
      label: t('reading.provider'),
      value: [reading.provider, reading.model].filter(Boolean).join(LIST_SEPARATOR) || null,
    },
    { key: 'error', label: t('reading.error'), value: reading.errorCode },
    { key: 'notes', label: t('reading.notes'), value: reading.notes, wide: true, multiline: true },
  ].filter((fact) => fact.value);

  return (
    <div className={styles.record}>
      <section className={styles.section} aria-label={t('image.title')}>
        <h3 className={styles.sectionTitle}>{t('image.title')}</h3>
        <div className={styles.imageFrame}>
          {image.isPending ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : image.isError || !image.data ? (
            <Alert
              type="warning"
              showIcon
              title={t('image.loadFailed')}
              action={
                <Button
                  size="small"
                  icon={<ReloadOutlined aria-hidden="true" />}
                  onClick={() => void image.refetch()}
                >
                  {t('image.retry')}
                </Button>
              }
            />
          ) : (
            <Image src={image.data.url} alt={t('image.alt')} className={styles.image} />
          )}
        </div>
        <p className={styles.caption}>{t('image.zoomHint')}</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('account.title')}</h3>
        <WorkDrawerFacts items={account} />
      </section>

      {readingFacts.length > 0 ? (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('reading.title')}</h3>
          <WorkDrawerFacts items={readingFacts} />
        </section>
      ) : null}
    </div>
  );
}

/** Bên phải khi đã có kết quả: thông tin đã chốt + ai/lúc nào/vì sao. */
function DecidedFacts({ detail }: { detail: PlatformDriverLicence }) {
  const t = useTranslations('AdminDriverLicences');
  const tf = useTranslations('DriverLicence.fields');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const drives = [
    detail.coversCar ? tf('car') : null,
    detail.coversMotorbike ? tf('motorbike') : null,
  ].filter(Boolean);

  const facts: WorkDrawerFact[] = [
    {
      key: 'source',
      label: t('drawer.decided.source'),
      value:
        detail.decisionSource === DRIVER_LICENCE_DECISION_SOURCE.AUTO
          ? t('drawer.decided.sourceAuto')
          : detail.decidedByName,
    },
    {
      key: 'at',
      label: t('drawer.decided.at'),
      value: detail.decidedAt ? fmt.dateTime(detail.decidedAt) : null,
    },
    {
      key: 'reason',
      label: t('drawer.decided.reason'),
      value: detail.rejectionReason
        ? dl('driverLicenceRejectReason', detail.rejectionReason)
        : null,
    },
    {
      key: 'note',
      label: t('drawer.decided.note'),
      value: detail.reviewNote,
      wide: true,
      multiline: true,
    },
    {
      key: 'kind',
      label: t('form.kind'),
      value: detail.kind ? dl('driverLicenceKind', detail.kind) : null,
    },
    { key: 'fullName', label: t('form.fullName'), value: detail.fullName },
    { key: 'number', label: t('form.licenceNumber'), value: detail.licenceNumber },
    {
      key: 'dob',
      label: t('form.dateOfBirth'),
      value: detail.dateOfBirth ? fmt.dateKey(detail.dateOfBirth) : null,
    },
    { key: 'classes', label: t('form.classes'), value: detail.classes.join(', ') || null },
    {
      key: 'expires',
      label: t('form.expiresOn'),
      value: detail.noExpiry
        ? tf('noExpiry')
        : detail.expiresOn
          ? fmt.dateKey(detail.expiresOn)
          : null,
    },
    { key: 'country', label: tf('country'), value: detail.issuingCountry },
    {
      key: 'drives',
      label: t('form.drives'),
      value: drives.length > 0 ? drives.join(LIST_SEPARATOR) : null,
    },
  ].filter((fact) => fact.value);

  return (
    <div className={styles.decided}>
      <h3 className={styles.sectionTitle}>{t('drawer.decided.title')}</h3>
      <WorkDrawerFacts items={facts} />
    </div>
  );
}
