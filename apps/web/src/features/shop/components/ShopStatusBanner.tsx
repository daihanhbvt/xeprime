'use client';

import { Alert, Button, Popconfirm } from 'antd';
import { useTranslations } from 'next-intl';
import {
  TENANT_STATUS,
  TENANT_STATUS_SUBMITTABLE,
  type TenantStatus,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import type { MyShop } from '../types';
import styles from './ShopStatusBanner.module.css';

interface ShopStatusBannerProps {
  shop: MyShop;
  /** Quyền `tenant.submit_review`. Nút gửi duyệt là hành động ĐỔI TRẠNG THÁI, không phải "lưu". */
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

type BannerType = 'success' | 'info' | 'warning' | 'error';

/**
 * Một dải trạng thái duy nhất thay cho thẻ "trạng thái + nhãn + alert" cũ.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng chưa biết: hồ sơ đang ở đâu trong quy trình duyệt, lý
 * do bị trả về, và bước tiếp theo bấm vào đâu.
 */
export function ShopStatusBanner({ shop, canSubmit, submitting, onSubmit }: ShopStatusBannerProps) {
  const t = useTranslations('Shop');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const status = shop.status as TenantStatus;
  const approval = shop.latestApproval;
  const submittable = TENANT_STATUS_SUBMITTABLE.includes(status);

  const banner = ((): { type: BannerType; title: string; description?: string } => {
    switch (status) {
      case TENANT_STATUS.ACTIVE:
        return { type: 'success', title: t('status.active.title') };
      case TENANT_STATUS.PENDING_REVIEW:
        return {
          type: 'info',
          title: t('status.pending.title'),
          description: approval
            ? t('status.pending.description', { at: fmt.dateTime(approval.submittedAt) })
            : undefined,
        };
      case TENANT_STATUS.NEEDS_REVISION:
        return {
          type: 'warning',
          title: t('status.needsRevision.title'),
          description: approval?.reason ?? undefined,
        };
      case TENANT_STATUS.REJECTED:
        return {
          type: 'error',
          title: t('status.rejected.title'),
          description: approval?.reason ?? undefined,
        };
      case TENANT_STATUS.SUSPENDED:
        return {
          type: 'error',
          title: t('status.suspended.title'),
          description: t('status.suspended.description'),
        };
      case TENANT_STATUS.EXPIRED:
        return {
          type: 'warning',
          title: t('status.expired.title'),
          description: t('status.expired.description'),
        };
      default:
        return {
          type: 'warning',
          title: t('status.draft.title'),
          description: t('status.draft.description'),
        };
    }
  })();

  return (
    <Alert
      className={styles.banner}
      type={banner.type}
      showIcon
      title={banner.title}
      description={banner.description}
      action={
        submittable && canSubmit ? (
          <Popconfirm
            title={t('status.submitConfirm.title')}
            description={t('status.submitConfirm.description')}
            okText={t('status.submitConfirm.ok')}
            cancelText={tCommon('actions.cancel')}
            onConfirm={onSubmit}
          >
            <Button type="primary" loading={submitting}>
              {status === TENANT_STATUS.DRAFT ? t('status.submit') : t('status.resubmit')}
            </Button>
          </Popconfirm>
        ) : null
      }
    />
  );
}
