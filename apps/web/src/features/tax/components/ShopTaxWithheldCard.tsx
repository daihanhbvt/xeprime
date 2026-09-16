'use client';

import { Alert, Button, Card, DatePicker, Empty, Skeleton, Statistic } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, TAX_WITHHOLDING_STATUS_META } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useShopTaxSummary } from '../hooks/use-tax';
import type { TaxRow } from '../types';

import styles from './ShopTaxWithheldCard.module.css';

const PERIOD_FORMAT = 'YYYY-MM';
const MIN_TABLE_WIDTH = 720;

/**
 * "Thuế đã khấu trừ trong kỳ" — bề mặt của CHỦ XE (Phase 8, ADR 0032 điều 3).
 *
 * Vì sao nó tồn tại: thuế được trừ khỏi khoản XePrime phải trả (`D − T`), nên chủ xe nhận ít
 * hơn cọc đúng bằng con số này. Không có màn này thì họ chỉ thấy ví mình vào một số nhỏ hơn dự
 * kiến và không có chỗ nào giải thích vì sao — đó là loại thiếu minh bạch làm người ta gọi
 * support, rồi không tin nền tảng nữa.
 *
 * Thuộc bộ CƠ BẢN (ADR 0027 điều 1): không gác theo gói. Gói hết hạn cũng không được lấy đi
 * quyền biết mình bị trừ bao nhiêu (điều 3).
 */
export function ShopTaxWithheldCard() {
  const t = useTranslations('Finance.taxWithheld');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { has } = usePermissions();

  const [period, setPeriod] = useState(() => nowInAppTz().format(PERIOD_FORMAT));
  const canView = has(PERMISSION.FINANCE_VIEW);
  /*
   * Chỉ gác theo QUYỀN, không gác theo gian hàng đang chọn: `GET /shop/tax/*` lấy `tenant_id` từ
   * membership ở server (CLAUDE §6.1), nên thêm một điều kiện `tenant` ở client vừa không tăng
   * bảo mật vừa buộc thẻ này phụ thuộc một hook mà không thẻ nào khác trên màn sổ tài chính dùng.
   */
  const { data, isLoading, isError, refetch } = useShopTaxSummary(period, canView);

  const columns: DataTableColumn<TaxRow>[] = [
    { key: 'booking', title: t('columns.booking'), render: (row) => row.bookingCode },
    {
      key: 'base',
      title: t('columns.base'),
      render: (row) => (
        <div>
          <p className={styles.value}>{fmt.money(row.taxableBase)}</p>
          <p className={styles.muted}>{t('percentOf', { percent: row.percent })}</p>
        </div>
      ),
    },
    { key: 'label', title: t('columns.label'), render: (row) => row.label },
    {
      key: 'amount',
      title: t('columns.amount'),
      render: (row) => (
        <span className={Number(row.amount) < 0 ? styles.negative : styles.value}>
          {fmt.money(row.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      title: t('columns.status'),
      render: (row) => (
        <StatusTag
          value={row.status}
          meta={TAX_WITHHOLDING_STATUS_META}
          group="taxWithholdingStatus"
        />
      ),
    },
  ];

  if (!canView) return null;

  return (
    <Card
      className={styles.card}
      title={t('title')}
      extra={
        <DatePicker
          picker="month"
          size="small"
          value={dayjs(period, PERIOD_FORMAT)}
          allowClear={false}
          aria-label={t('period')}
          onChange={(value) => {
            if (value) setPeriod(value.format(PERIOD_FORMAT));
          }}
        />
      }
    >
      {/*
        Câu giải thích đứng TRƯỚC con số. Thuế là khoản duy nhất trên màn này làm chủ xe nhận ít
        hơn cọc, nên "vì sao" quan trọng hơn "bao nhiêu".
      */}
      <Alert className={styles.note} type="info" showIcon title={t('explainer')} />

      {isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}

      {isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {data ? (
        data.rows === 0 ? (
          <Empty description={t('empty')} />
        ) : (
          <>
            <div className={styles.stats}>
              <Statistic title={t('stats.total')} value={fmt.money(data.totalAmount)} />
              <Statistic title={t('stats.base')} value={fmt.money(data.totalTaxableBase)} />
              <Statistic title={t('stats.trips')} value={data.rows} />
            </div>

            <DataTable<TaxRow>
              label={t('title')}
              columns={columns}
              items={data.items}
              rowKey={(row) => row.id}
              minWidth={MIN_TABLE_WIDTH}
              empty={{ title: t('empty') }}
            />
          </>
        )
      ) : null}
    </Card>
  );
}
