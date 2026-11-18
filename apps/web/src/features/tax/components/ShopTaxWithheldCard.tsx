'use client';

import { Alert, Button, DatePicker, Skeleton } from 'antd';
import { EmptyState } from '@/components/feedback/EmptyState';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, TAX_WITHHOLDING_STATUS_META } from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { useIsMobile } from '@/hooks/use-media-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useShopTaxSummary } from '../hooks/use-tax';
import type { TaxRow } from '../types';
import { TaxAmount, TaxSplitAmount } from './TaxSplitAmount';

import styles from './ShopTaxWithheldCard.module.css';

const PERIOD_FORMAT = 'YYYY-MM';
const MIN_TABLE_WIDTH = 960;

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
 *
 * `embedded`: thẻ nằm TRONG hộp thoại "Chi tiết" của trang Quản lý ví (04/11/2026) — bỏ khung
 * thẻ và tiêu đề (hộp thoại đã có), tránh thẻ lồng thẻ. `initialPeriod` mở đúng tháng người dùng
 * đang xem ở trang đó.
 */
export function ShopTaxWithheldCard({
  embedded = false,
  initialPeriod,
}: {
  embedded?: boolean;
  /** Kỳ `YYYY-MM` mở đầu — mặc định tháng hiện tại. */
  initialPeriod?: string;
} = {}) {
  const t = useTranslations('Finance.taxWithheld');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { has } = usePermissions();
  const isMobile = useIsMobile();

  const [period, setPeriod] = useState(() => initialPeriod ?? nowInAppTz().format(PERIOD_FORMAT));
  const canView = has(PERMISSION.FINANCE_VIEW);
  /*
   * Chỉ gác theo QUYỀN, không gác theo gian hàng đang chọn: `GET /shop/tax/*` lấy `tenant_id` từ
   * membership ở server (CLAUDE §6.1), nên thêm một điều kiện `tenant` ở client vừa không tăng
   * bảo mật vừa buộc thẻ này phụ thuộc một hook mà không thẻ nào khác trên màn sổ tài chính dùng.
   */
  const { data, isLoading, isError, refetch } = useShopTaxSummary(period, canView);

  const columns: DataTableColumn<TaxRow>[] = [
    {
      key: 'index',
      title: t('columns.index'),
      width: 72,
      align: 'center',
      // Thẻ mobile lấy cột đầu làm tiêu đề — một con số "1" không phải tiêu đề, mã chuyến mới là.
      hidden: isMobile,
      // Bảng của một tháng không phân trang — STT đếm thẳng trên toàn danh sách.
      render: (_v, _row, index) => index + 1,
    },
    { key: 'booking', title: t('columns.booking'), render: (_v, row) => row.bookingCode },
    {
      key: 'base',
      title: t('columns.base'),
      render: (_v, row) => (
        <div>
          <p className={styles.value}>{fmt.money(row.taxableBase)}</p>
          <p className={styles.muted}>
            {row.vatPercent != null && row.pitPercent != null
              ? t('ratePair', { vat: row.vatPercent, pit: row.pitPercent })
              : t('percentOf', { percent: row.percent })}
          </p>
        </div>
      ),
    },
    {
      key: 'vat',
      title: t('columns.vat'),
      render: (_v, row) => (
        <TaxSplitAmount value={row.vatAmount ?? null} fallback={t('notSplit')} />
      ),
    },
    {
      key: 'pit',
      title: t('columns.pit'),
      render: (_v, row) => (
        <TaxSplitAmount value={row.pitAmount ?? null} fallback={t('notSplit')} />
      ),
    },
    { key: 'label', title: t('columns.label'), render: (_v, row) => row.label },
    {
      key: 'amount',
      title: t('columns.amount'),
      render: (_v, row) => <TaxAmount value={row.amount} />,
    },
    {
      key: 'status',
      title: t('columns.status'),
      render: (_v, row) => (
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
    <section
      className={embedded ? styles.embedded : styles.card}
      aria-labelledby={embedded ? undefined : 'xp-tax-withheld'}
      aria-label={embedded ? t('title') : undefined}
    >
      <div className={styles.header}>
        {embedded ? null : (
          <h2 id="xp-tax-withheld" className={styles.title}>
            {t('title')}
          </h2>
        )}
        <DatePicker
          className={styles.period}
          picker="month"
          size="large"
          // Ô chỉ để chọn trên bảng tháng: nhãn "Tháng 10/2026" không gõ ngược lại được thành ngày.
          inputReadOnly
          format={(value) => t('monthValue', { month: value.format('MM/YYYY') })}
          value={dayjs(period, PERIOD_FORMAT)}
          allowClear={false}
          aria-label={t('period')}
          onChange={(value) => {
            if (value) setPeriod(value.format(PERIOD_FORMAT));
          }}
        />
      </div>

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
          <EmptyState variant="empty" title={t('empty')} />
        ) : (
          <>
            <dl className={styles.stats}>
              <Stat label={t('stats.total')} value={fmt.money(data.totalAmount)} />
              <Stat label={t('stats.vat')} value={fmt.money(data.totalVatAmount)} />
              <Stat label={t('stats.pit')} value={fmt.money(data.totalPitAmount)} />
              {/* Kỳ trộn dòng cũ không tách: phần còn lại của tổng, để GTGT + TNCN + phần này = tổng. */}
              {isZeroMoney(data.totalUnsplitAmount) ? null : (
                <Stat label={t('stats.unsplit')} value={fmt.money(data.totalUnsplitAmount)} />
              )}
              <Stat label={t('stats.base')} value={fmt.money(data.totalTaxableBase)} />
              <Stat label={t('stats.trips')} value={fmt.count(data.rows)} />
            </dl>

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

      {/*
        Câu giải thích căn cứ pháp lý đứng CUỐI thẻ (design `23813:39548`): nó là phần đọc thêm
        cho người muốn biết vì sao, còn con số đã đứng trên. Luôn hiện — kể cả kỳ chưa có chuyến
        nào bị khấu trừ, vì đó là lúc người ta hỏi "rồi sẽ bị trừ bao nhiêu".
      */}
      <p className={styles.note}>{t('explainer')}</p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <dt className={styles.statLabel}>{label}</dt>
      <dd className={styles.statValue}>{value}</dd>
    </div>
  );
}
