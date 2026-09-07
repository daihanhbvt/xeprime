'use client';

import { App, Alert, Button, Descriptions, Input, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { SELLER_PROFILE_STATUS, SELLER_PROFILE_STATUS_META, type SellerProfileStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  usePlatformSeller,
  useRejectSeller,
  useRequestSellerChanges,
  useVerifySeller,
} from '../hooks/use-platform-sellers';
import styles from './PlatformSellerDrawer.module.css';

/**
 * Chi tiết một hồ sơ người bán — PII ĐẦY ĐỦ để đối chiếu giấy tờ (ADR 0028 release gate 1).
 *
 * Ba hành động, một máy trạng thái: xác minh (đạt), yêu cầu bổ sung (người bán sửa rồi gửi lại),
 * từ chối (không nhận). Hai hành động sau BẮT BUỘC lý do — người bán đọc đúng câu đó.
 */
export function PlatformSellerDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('PlatformSellers');
  const tCommon = useTranslations('Common');
  const { message, modal } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const detail = usePlatformSeller(id);
  const verify = useVerifySeller();
  const requestChanges = useRequestSellerChanges();
  const reject = useRejectSeller();

  const row = detail.data;
  const pending = row?.status === SELLER_PROFILE_STATUS.SUBMITTED;

  function withNote(
    title: string,
    submit: (note: string) => void,
  ) {
    let note = '';
    modal.confirm({
      title,
      content: (
        <Input.TextArea
          rows={3}
          placeholder={t('drawer.notePlaceholder')}
          aria-label={t('drawer.noteLabel')}
          onChange={(e) => {
            note = e.target.value;
          }}
        />
      ),
      okText: tCommon('actions.confirm'),
      cancelText: tCommon('actions.cancel'),
      onOk: () =>
        new Promise<void>((resolve, rejectModal: (reason: Error) => void) => {
          if (!note.trim()) {
            message.error(t('drawer.noteRequired'));
            rejectModal(new Error('note-required'));
            return;
          }
          submit(note.trim());
          resolve();
        }),
    });
  }

  function doVerify() {
    if (!id) return;
    verify.mutate(id, {
      onSuccess: () => {
        message.success(t('drawer.verifySuccess'));
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  function doRequestChanges() {
    if (!id) return;
    withNote(t('drawer.requestChangesTitle'), (note) => {
      requestChanges.mutate(
        { id, note },
        {
          onSuccess: () => {
            message.success(t('drawer.requestChangesSuccess'));
            onClose();
          },
          onError: (err) => message.error(errorMessage(err)),
        },
      );
    });
  }

  function doReject() {
    if (!id) return;
    withNote(t('drawer.rejectTitle'), (note) => {
      reject.mutate(
        { id, note },
        {
          onSuccess: () => {
            message.success(t('drawer.rejectSuccess'));
            onClose();
          },
          onError: (err) => message.error(errorMessage(err)),
        },
      );
    });
  }

  return (
    <ResponsiveDialog title={t('drawer.title')} open={Boolean(id)} onClose={onClose} size="lg" footer={null}>
      {detail.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : detail.isError || !row ? (
        <Alert
          type="error"
          showIcon
          message={t('drawer.loadError')}
          action={
            <Button size="small" onClick={() => void detail.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : (
        <div className={styles.body}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label={t('columns.tenant')}>{row.tenantName}</Descriptions.Item>
            <Descriptions.Item label={t('columns.entityType')}>
              {domainLabel('sellerEntityType', row.entityType)}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.legalName')}>
              {row.legalName ?? tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.taxId')}>
              {row.taxId ?? tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.idNumber')}>
              {row.idNumber ?? tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.bankAccount')}>
              {row.bankCode && row.bankAccountNumber
                ? `${row.bankCode} · ${row.bankAccountNumber} · ${row.bankAccountName ?? ''}`
                : tCommon('labels.emptyValue')}
            </Descriptions.Item>
            <Descriptions.Item label={t('columns.status')}>
              <StatusTag
                value={row.status as SellerProfileStatus}
                meta={SELLER_PROFILE_STATUS_META}
                group="sellerProfileStatus"
              />
            </Descriptions.Item>
            {row.reviewNote ? (
              <Descriptions.Item label={t('drawer.reviewNote')}>{row.reviewNote}</Descriptions.Item>
            ) : null}
            {row.verifiedByName ? (
              <Descriptions.Item label={t('drawer.verifiedBy')}>{row.verifiedByName}</Descriptions.Item>
            ) : null}
          </Descriptions>

          {pending ? (
            <div className={styles.actions}>
              <Button type="primary" loading={verify.isPending} onClick={doVerify}>
                {t('drawer.verify')}
              </Button>
              <Button loading={requestChanges.isPending} onClick={doRequestChanges}>
                {t('drawer.requestChanges')}
              </Button>
              <Button danger loading={reject.isPending} onClick={doReject}>
                {t('drawer.reject')}
              </Button>
            </div>
          ) : (
            <Alert type="info" showIcon message={t('drawer.handled')} />
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}
