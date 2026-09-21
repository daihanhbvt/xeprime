'use client';

import { DownOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SUBSCRIPTION_INVOICE_STATUS_META, type SubscriptionInvoiceStatus } from '@xeprime/types';

import { CopyButton } from '@/components/data-display/CopyButton';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useUrlFilters, positiveIntParam } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';

import { usePendingInvoice, useSubscriptionInvoices } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import styles from './SubscriptionInvoicesPanel.module.css';

const INVOICE_TABLE_MIN_WIDTH = 760;

/**
 * HOÁ ĐƠN THANH TOÁN — khoản cần trả trước, lịch sử sau (và lịch sử thì gập lại).
 *
 * ## Vì sao hai phần có trọng lượng khác hẳn nhau
 *
 * Hoá đơn đang chờ tiền là một VIỆC PHẢI LÀM: có số tiền còn thiếu, có hạn, có mã QR để quét.
 * Lịch sử là sổ tra cứu — người ta mở nó vài tháng một lần, thường để tìm một mã cụ thể. Bản
 * trước vẽ cả hai như nhau và đặt bảng lịch sử chiếm hết phần dưới màn hình, nên gian hàng có
 * một hoá đơn quá hạn vẫn thấy chủ yếu là một bảng trống.
 *
 * ## Không có hoá đơn thì nói đúng một câu
 *
 * Không `Empty` với hình minh hoạ, không bảng rỗng có tiêu đề cột. Một dòng ~100px nói "chưa
 * phát sinh hoá đơn" và hoá đơn sẽ xuất hiện ở đây khi nào — vì đó là toàn bộ thông tin có thật.
 *
 * ## Hoá đơn chờ đến từ ENDPOINT RIÊNG, không từ trang lịch sử
 *
 * Bản trước lọc nó ra khỏi `items` của trang hiện tại, nên rời sang trang 2 là khối QR biến mất
 * — đúng lúc người dùng đang đi tìm mã để chuyển khoản. `usePendingInvoice` hỏi thẳng
 * `GET /subscription/invoices/pending` (ADR 0040): bất biến "mỗi gian hàng tối đa MỘT hoá đơn
 * trả được" do server giữ, nên câu trả lời phải đến từ đó, và nó tự HỎI LẠI theo nhịp trong lúc
 * chờ đối soát — tiền về là trạng thái tự đổi, không cần F5.
 */
export function SubscriptionInvoicesPanel({
  headingId,
  showPending = true,
}: {
  headingId?: string;
  /**
   * Dựng khối chuyển khoản của hoá đơn ĐANG CHỜ ở đây.
   *
   * Tắt khi màn hình đã có một khối như vậy ở chỗ khác — luồng nâng cấp dựng nó ngay tại bước 3
   * của mình. Hai mã QR cho CÙNG một hoá đơn trên cùng một trang là hai lời mời quét khác nhau
   * cho một khoản tiền, và người dùng không có cách nào biết chúng là một.
   */
  showPending?: boolean;
}) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const [historyOpen, setHistoryOpen] = useState(false);

  const { filters, setFilters } = useUrlFilters((params) => ({
    page: positiveIntParam(params, 'page') ?? 1,
  }));
  const invoices = useSubscriptionInvoices(filters.page);

  const items = invoices.data?.items ?? [];
  const pendingInvoice = usePendingInvoice().data ?? null;
  const hasHistory = items.length > 0;

  const invoiceColumns: DataTableColumn<SubscriptionInvoice>[] = [
    {
      title: t('invoices.columns.code'),
      key: 'code',
      width: 160,
      render: (_, inv) => (
        <span className={styles.codeCell}>
          <span className={styles.code}>{inv.code}</span>
          <CopyButton value={inv.code} label={t('invoices.copyCode')} />
        </span>
      ),
    },
    {
      title: t('invoices.columns.period'),
      key: 'period',
      width: 200,
      render: (_, inv) => `${fmt.date(inv.periodFrom)} → ${fmt.date(inv.periodTo)}`,
    },
    {
      title: t('invoices.columns.total'),
      key: 'total',
      align: 'right',
      width: 130,
      render: (_, inv) => fmt.money(inv.totalAmount),
    },
    {
      title: t('invoices.columns.status'),
      key: 'status',
      width: 140,
      render: (_, inv) => (
        <StatusTag
          value={inv.status as SubscriptionInvoiceStatus}
          meta={SUBSCRIPTION_INVOICE_STATUS_META}
          group="subscriptionInvoiceStatus"
        />
      ),
    },
    {
      title: t('invoices.columns.createdAt'),
      key: 'createdAt',
      width: 130,
      render: (_, inv) => fmt.date(inv.createdAt),
    },
  ];

  return (
    <div className={styles.panel}>
      <h3 className={styles.title} id={headingId}>
        {t('invoices.title')}
      </h3>

      {invoices.isError && !invoices.data ? (
        <Alert
          type="error"
          showIcon
          title={t('invoices.loadError')}
          action={
            <Button size="small" onClick={() => void invoices.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {showPending && pendingInvoice ? <InvoicePaymentPanel invoice={pendingInvoice} /> : null}

      {!invoices.isPending && !invoices.isError && !hasHistory ? (
        <p className={styles.empty}>
          <span className={styles.emptyTitle}>{t('invoices.empty')}</span>
          <span className={styles.emptyHint}>{t('invoices.emptyHint')}</span>
        </p>
      ) : null}

      {/*
        Lịch sử là một khối GẬP — bấm để mở, bấm lần nữa để đóng lại.

        Bản trước là một nút đổi thành bảng: mở ra rồi thì không còn đường đóng, và người dùng
        phải tải lại trang để lấy lại chỗ. Bảng vẫn chỉ được DỰNG khi mở, nên trang không gánh
        một bảng 5 cột cho việc mà phần lớn lượt truy cập không làm.
      */}
      {hasHistory ? (
        <div className={styles.history}>
          <button
            type="button"
            className={styles.historyToggle}
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <DownOutlined
              className={cx(styles.historyChevron, historyOpen && styles.historyChevronOpen)}
              aria-hidden="true"
            />
            {historyOpen ? t('invoices.hideHistory') : t('invoices.showHistory')}
          </button>

          {historyOpen ? (
            <DataTable<SubscriptionInvoice>
              label={t('invoices.title')}
              columns={invoiceColumns}
              items={items}
              minWidth={INVOICE_TABLE_MIN_WIDTH}
              loading={invoices.isFetching}
              empty={{ title: t('invoices.empty') }}
              pagination={
                invoices.data
                  ? {
                      meta: invoices.data.meta,
                      onChange: (page) => setFilters({ page }),
                      totalLabel: (total) => tCommon('pagination.total', { count: total }),
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
