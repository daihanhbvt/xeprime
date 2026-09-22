'use client';

import { Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  PROMO_REDEMPTION_STATUS,
  PROMO_REDEMPTION_STATUS_META,
  STATUS_COLOR,
  type PromoRedemptionStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePromoRedemptions } from '../hooks/use-promo-codes';
import type { AdminPromoCode, PromoRedemptionRow } from '../types';

const MIN_TABLE_WIDTH = 760;

/**
 * LƯỢT SỬ DỤNG của một chiến dịch — ADR 0046 điều 6.
 *
 * Đọc thuần. Không có nút nào ở đây, và đó là chủ đích: một lượt dùng là hệ quả của một yêu cầu
 * thuê có thật, nên nó không sửa được từ màn quản trị mã — sửa nó là viết lại lịch sử giá của
 * một đơn.
 *
 * Tên khách đã CHE ở server (`maskName`): đối soát một lượt dùng không cần PII, và bỏ mask là
 * một hành động riêng có permission riêng ở màn giám sát khách.
 */
export function PromoRedemptionsDialog({
  promo,
  onClose,
}: {
  /** `null` = đóng. */
  promo: AdminPromoCode | null;
  onClose: () => void;
}) {
  const t = useTranslations('PromoCodes');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const [page, setPage] = useState(1);

  const { data, isError, isFetching, refetch } = usePromoRedemptions(promo?.id ?? null, page);

  const columns: DataTableColumn<PromoRedemptionRow>[] = [
    {
      title: t('admin.redemptions.column.customer'),
      key: 'customer',
      render: (_, r) => r.customerNameMasked,
    },
    {
      title: t('admin.redemptions.column.status'),
      key: 'status',
      width: 150,
      render: (_, r) => (
        <>
          <StatusTag
            value={r.status as PromoRedemptionStatus}
            meta={PROMO_REDEMPTION_STATUS_META}
            group="promoRedemptionStatus"
          />
          {/*
            Lý do NHẢ lượt — chỉ có nghĩa với `released`, và nó là thứ trả lời "vì sao bộ đếm tụt
            xuống" mà không phải đoán từ trạng thái của một bảng khác.
          */}
          {r.status === PROMO_REDEMPTION_STATUS.RELEASED && r.releaseReason ? (
            <Tag color={STATUS_COLOR.NEUTRAL}>
              {t(
                `admin.redemptions.releaseReason.${r.releaseReason}` as 'admin.redemptions.releaseReason.request_rejected',
              )}
            </Tag>
          ) : null}
        </>
      ),
    },
    {
      title: t('admin.redemptions.column.discount'),
      key: 'discount',
      width: 130,
      align: 'right',
      render: (_, r) => fmt.money(r.discountAmount),
    },
    {
      title: t('admin.redemptions.column.booking'),
      key: 'booking',
      width: 140,
      render: (_, r) => r.bookingCode ?? t('admin.redemptions.noBooking'),
    },
    {
      title: t('admin.redemptions.column.reservedAt'),
      key: 'reservedAt',
      width: 160,
      render: (_, r) => fmt.dateTime(r.reservedAt),
    },
    {
      title: t('admin.redemptions.column.redeemedAt'),
      key: 'redeemedAt',
      width: 160,
      render: (_, r) => (r.redeemedAt ? fmt.dateTime(r.redeemedAt) : tCommon('labels.emptyValue')),
    },
  ];

  return (
    <ResponsiveDialog
      open={promo != null}
      onClose={onClose}
      size="xl"
      footer={null}
      title={t('admin.redemptions.title', { code: promo?.code ?? '' })}
    >
      <DataTable<PromoRedemptionRow>
        label={t('admin.redemptions.title', { code: promo?.code ?? '' })}
        columns={columns}
        items={data?.data ?? []}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('admin.error'), onRetry: () => void refetch() } : null}
        empty={{ title: t('admin.redemptions.empty') }}
        pagination={
          data
            ? {
                meta: data.meta,
                onChange: (next) => setPage(next),
                totalLabel: (total) => t('admin.pagination.redemptions', { count: total }),
              }
            : undefined
        }
      />
    </ResponsiveDialog>
  );
}
