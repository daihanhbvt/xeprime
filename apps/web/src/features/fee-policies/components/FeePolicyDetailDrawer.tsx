'use client';

import { useTranslations } from 'next-intl';
import { FEE_POLICY_STATUS_META, type FeePolicyStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import type { FeePolicy } from '../types';
import { FeePolicySummary } from './FeePolicySummary';

/**
 * Panel CHỈ ĐỌC của một phiên bản chính sách phí — đủ mọi con số của luồng tiền v2, kể cả với
 * bản đã lưu trữ (đối chiếu đơn cũ). Không có nút sửa: bản đã hiệu lực là bất biến; sửa đi qua nút
 * "Sửa chính sách" của trang (tạo bản nháp từ bản đang chạy).
 */
export function FeePolicyDetailDrawer({
  policy,
  onClose,
}: {
  policy: FeePolicy | null;
  onClose: () => void;
}) {
  const t = useTranslations('FeePolicies.detail');

  return (
    <DetailDrawer
      open={Boolean(policy)}
      onClose={onClose}
      size="lg"
      title={policy ? t('title', { name: policy.name, version: policy.version }) : ''}
      extra={
        policy ? (
          <StatusTag
            value={policy.status as FeePolicyStatus}
            meta={FEE_POLICY_STATUS_META}
            group="feePolicyStatus"
          />
        ) : null
      }
    >
      {policy ? <FeePolicySummary key={policy.id} policy={policy} layout="stack" /> : null}
    </DetailDrawer>
  );
}
