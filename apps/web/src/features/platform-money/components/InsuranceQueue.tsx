'use client';

import { App, Alert, Button, Input, Modal, Space } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_POLICY_STATUS_META,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useInsuranceQueue, useRetryInsurance, useVoidInsurance } from '../hooks/use-platform-money';
import type { PlatformInsurancePolicy } from '../types';

import styles from './InsuranceQueue.module.css';

const MIN_TABLE_WIDTH = 1040;

/**
 * HÀNG ĐỢI BẢO HIỂM của nền tảng — Phase 7 (ADR 0032 điều 4).
 *
 * Mỗi dòng ở đây là **một khoản tiền khách đã trả mà chưa có chứng nhận nào được cấp**. Đó là lý
 * do màn mặc định chỉ hiện hợp đồng ĐANG LỖI: hợp đồng đã cấp không cần ai nhìn, còn hợp đồng lỗi
 * là tiền đang treo và là một lời hứa với khách chưa được thực hiện.
 *
 * Dải cảnh báo đầu bảng nói thẳng tình trạng hệ thống (chưa cắm đối tác). Không nói ra thì người
 * trực sẽ bấm "thử lại" hàng chục lần và tưởng hệ thống hỏng, trong khi việc cần làm nằm ở chỗ
 * khác hẳn — và nút thử lại ở mỗi dòng sẽ không bao giờ đổi được gì.
 */
export function InsuranceQueue() {
  const t = useTranslations('PlatformMoney.insurance');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const [page, setPage] = useState(1);
  const [voiding, setVoiding] = useState<PlatformInsurancePolicy | null>(null);
  const [reason, setReason] = useState('');

  const { data, isError, isFetching, refetch } = useInsuranceQueue({ page });
  const retry = useRetryInsurance();
  const voidPolicy = useVoidInsurance();

  const items = useMemo(() => data?.data ?? [], [data]);

  /*
   * "Chưa cắm đối tác" là tình trạng CỦA CẢ HỆ THỐNG, không của từng dòng — nói một lần ở đầu
   * bảng, và chỉ nói khi nó thật sự đang xảy ra.
   */
  const partnerMissing = items.some(
    (p) => p.lastErrorCode === INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
  );

  const columns = useMemo<DataTableColumn<PlatformInsurancePolicy>[]>(
    () => [
      {
        key: 'booking',
        title: t('columns.booking'),
        render: (row) => (
          <div>
            <p className={styles.strong}>{row.bookingCode}</p>
            <p className={styles.muted}>{row.customerName}</p>
          </div>
        ),
      },
      {
        key: 'tenant',
        title: t('columns.tenant'),
        render: (row) => (
          <div>
            <p className={styles.strong}>{row.tenantName}</p>
            <p className={styles.muted}>{row.vehicleName}</p>
          </div>
        ),
      },
      {
        key: 'product',
        title: t('columns.product'),
        render: (row) => domainLabel('insuranceProductKind', row.productKind),
      },
      {
        key: 'premium',
        title: t('columns.premium'),
        render: (row) => <span className={styles.amount}>{fmt.money(row.premiumAmount)}</span>,
      },
      {
        key: 'status',
        title: t('columns.status'),
        render: (row) => (
          <div>
            <StatusTag
              value={row.status}
              meta={INSURANCE_POLICY_STATUS_META}
              group="insurancePolicyStatus"
            />
            {row.lastErrorMessage ? (
              <p className={styles.muted}>{row.lastErrorMessage}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'certificate',
        title: t('columns.certificate'),
        render: (row) =>
          row.certificateNumber ? (
            <span className={styles.strong}>{row.certificateNumber}</span>
          ) : (
            <span className={styles.muted}>{t('noCertificate')}</span>
          ),
      },
      {
        key: 'attempts',
        title: t('columns.attempts'),
        render: (row) => (
          <div>
            <p>{t('attemptCount', { count: row.issueAttempts })}</p>
            {/*
              `nextAttemptAt` rỗng ở trạng thái lỗi nghĩa là hệ thống ĐÃ THÔI tự thử lại — người
              trực phải biết điều đó, nếu không họ sẽ ngồi đợi một lần thử không bao giờ tới.
            */}
            <p className={styles.muted}>
              {row.status === INSURANCE_POLICY_STATUS.FAILED && !row.nextAttemptAt
                ? t('noAutoRetry')
                : row.nextAttemptAt
                  ? fmt.dateTime(row.nextAttemptAt)
                  : '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'actions',
        title: tCommon('labels.actions'),
        render: (row) => (
          <Space size="small">
            <Button
              size="small"
              disabled={row.status !== INSURANCE_POLICY_STATUS.FAILED || retry.isPending}
              onClick={() =>
                retry.mutate(row.id, {
                  onSuccess: () => message.success(t('actions.retryQueued')),
                  onError: (error) => message.error(errorMessage(error)),
                })
              }
            >
              {t('actions.retry')}
            </Button>
            <Button
              size="small"
              danger
              disabled={
                row.status !== INSURANCE_POLICY_STATUS.FAILED &&
                row.status !== INSURANCE_POLICY_STATUS.ISSUED
              }
              onClick={() => {
                setReason('');
                setVoiding(row);
              }}
            >
              {t('actions.void')}
            </Button>
          </Space>
        ),
      },
    ],
    [t, tCommon, fmt, domainLabel, retry, message, errorMessage],
  );

  return (
    <>
      {partnerMissing ? (
        <Alert
          className={styles.banner}
          type="warning"
          showIcon
          title={t('partnerMissing.title')}
          description={t('partnerMissing.body')}
        />
      ) : null}

      <DataTable<PlatformInsurancePolicy>
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('empty.title'), description: t('empty.description') }}
        pagination={{
          meta: data?.meta ?? { page: 1, limit: 20, total: 0, hasNext: false },
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <Modal
        open={voiding !== null}
        title={t('voidModal.title')}
        okText={t('actions.void')}
        okButtonProps={{ danger: true, disabled: reason.trim().length < 5 }}
        cancelText={tCommon('actions.cancel')}
        confirmLoading={voidPolicy.isPending}
        onCancel={() => setVoiding(null)}
        onOk={() => {
          if (!voiding) return;
          voidPolicy.mutate(
            { id: voiding.id, reason: reason.trim() },
            {
              onSuccess: () => {
                setVoiding(null);
                message.success(t('voidModal.done'));
              },
              onError: (error) => message.error(errorMessage(error)),
            },
          );
        }}
      >
        <p>{t('voidModal.hint')}</p>
        <Input.TextArea
          value={reason}
          rows={3}
          maxLength={500}
          aria-label={t('voidModal.reasonLabel')}
          placeholder={t('voidModal.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </>
  );
}
