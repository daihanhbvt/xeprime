'use client';

import {
  CheckCircleFilled,
  CloseCircleFilled,
  EditOutlined,
  InfoCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, Collapse, Skeleton, Tooltip } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/form/MoneyInput';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { FINANCE_QUEUE, type FinanceQueue } from '../finance-queues';
import { useDailyReconciliation, useSaveBankBalance } from '../hooks/use-platform-money';
import type { DailyReconciliation } from '../types';
import styles from './LedgerPanel.module.css';

interface LedgerRow {
  key: string;
  label: string;
  amount: string;
  /** Số giao dịch/khoản sau con số — hiện thành một chip nhỏ, không chen vào câu. */
  count?: number;
  /** Dòng phụ nhỏ dưới nhãn (vd. tách số dư ví thành rút được / đang chuyển). */
  note?: string;
  /** Hàng đợi sinh ra con số này — có thì cả dòng là lối tắt sang đó. */
  queue?: FinanceQueue;
}

/**
 * SỔ ĐỐI SOÁT BA VẾ của một ngày (giờ VN) — ADR 0025 điều 6.
 *
 * Màn này trả lời đúng một câu: **XePrime đang giữ tiền của ai.** Bố cục đi theo câu đó:
 *
 *  1. Phương trình ở trên cùng, bốn ô:
 *     `số dư ngân hàng = tiền của nền tảng + tiền giữ hộ + chênh lệch`. Ô số dư sửa TẠI CHỖ (SePay
 *     không gửi số dư nên phải nhập tay); ô chênh lệch mang màu kết luận.
 *  2. Bên dưới, bên trái: TIỀN GIỮ HỘ — khoản lớn nhất và là thứ người trực phải giải thích, mỗi
 *     dòng một con số, bấm là sang đúng hàng đợi. Dòng bằng 0 nhạt đi thay vì in "0 ₫".
 *  3. Bên phải: tiền của nền tảng và dòng tiền trong ngày — chi tiết dòng tiền gập sẵn.
 *
 * Hai điều cố ý giữ từ bản trước:
 *  - **Chưa nhập số dư ⇒ "chưa tính được", KHÔNG hiện 0.** Số 0 là một khẳng định (tài khoản rỗng).
 *  - **Lệch sổ ví là CẢNH BÁO ĐỎ** riêng — dấu hiệu có đường ghi số dư không đi qua sổ.
 */
export function LedgerPanel({
  date,
  visibleQueues,
  onOpenQueue,
}: {
  date: string;
  visibleQueues: readonly FinanceQueue[];
  onOpenQueue: (queue: FinanceQueue) => void;
}) {
  const t = useTranslations('PlatformMoney.reconciliation');
  const fmt = useAppFormat();
  const { data, isLoading, isError, refetch } = useDailyReconciliation(date);

  if (isLoading) return <Skeleton active paragraph={{ rows: 10 }} />;

  if (isError || !data) {
    return (
      <Alert
        type="error"
        showIcon
        title={t('loadError')}
        action={
          <Button size="small" onClick={() => void refetch()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }

  const custodiedRows: LedgerRow[] = [
    {
      key: 'holds',
      label: t('holdsUnsettled'),
      amount: data.custodied.holdsUnsettled,
      count: data.custodied.holdsUnsettledCount,
      queue: FINANCE_QUEUE.HOLDS,
    },
    {
      key: 'wallets',
      label: t('walletTotal'),
      amount: data.custodied.walletTotal,
      note:
        Number(data.custodied.walletPending) > 0
          ? t('walletBreakdown', {
              available: fmt.money(data.custodied.walletAvailable),
              pending: fmt.money(data.custodied.walletPending),
            })
          : undefined,
      queue: FINANCE_QUEUE.WITHDRAWALS,
    },
    {
      key: 'unmatched',
      label: t('unmatchedIn'),
      amount: data.custodied.unmatchedIn,
      count: data.custodied.unmatchedInCount,
      queue: FINANCE_QUEUE.BANK_IN,
    },
    {
      key: 'refunds',
      label: t('refundsPending'),
      amount: data.custodied.refundsPending,
      count: data.custodied.refundsPendingCount,
      queue: FINANCE_QUEUE.REFUNDS,
    },
    {
      key: 'insurance',
      label: t('insuranceReserved'),
      amount: data.custodied.insuranceReserved,
      queue: FINANCE_QUEUE.INSURANCE,
    },
    {
      key: 'tax',
      label: t('taxAccrued'),
      amount: data.custodied.taxAccrued,
      queue: FINANCE_QUEUE.TAX,
    },
  ];

  const platformRows: LedgerRow[] = [
    { key: 'fee', label: t('serviceFeeRecognized'), amount: data.platform.serviceFeeRecognized },
    {
      key: 'subs',
      label: t('subscriptionsCollected'),
      amount: data.platform.subscriptionsCollected,
    },
  ];

  const inflowRows: LedgerRow[] = [
    { key: 'subs', label: t('matchedSubscriptions'), amount: data.inflow.matchedSubscriptions },
    { key: 'holds', label: t('matchedHolds'), amount: data.inflow.matchedHolds },
    {
      key: 'unmatched',
      label: t('unmatched'),
      amount: data.inflow.unmatched,
      count: data.inflow.unmatchedCount,
      queue: FINANCE_QUEUE.BANK_IN,
    },
    { key: 'ignored', label: t('ignored'), amount: data.inflow.ignored },
    { key: 'variance', label: t('inflowVariance'), amount: data.inflow.variance },
  ];

  const outflowRows: LedgerRow[] = [
    {
      key: 'withdrawals',
      label: t('withdrawalsPaid'),
      amount: data.outflow.withdrawalsPaid,
      count: data.outflow.withdrawalsPaidCount,
      queue: FINANCE_QUEUE.WITHDRAWALS,
    },
    {
      key: 'refunds',
      label: t('refundsPaid'),
      amount: data.outflow.refundsPaid,
      count: data.outflow.refundsPaidCount,
      queue: FINANCE_QUEUE.REFUNDS,
    },
  ];

  const rowList = (rows: LedgerRow[]) => (
    <LedgerRows rows={rows} visibleQueues={visibleQueues} onOpenQueue={onOpenQueue} />
  );

  return (
    <div className={styles.panel}>
      {data.walletDrift.wallets > 0 ? (
        <Alert
          type="error"
          showIcon
          title={t('walletDriftWarning', {
            count: data.walletDrift.wallets,
            amount: fmt.money(data.walletDrift.amount),
          })}
          description={t('walletDriftHint')}
        />
      ) : null}

      <Equation date={date} data={data} />

      <div className={styles.grid}>
        <section className={styles.card} aria-labelledby="xp-ledger-custodied">
          <CardHeader
            id="xp-ledger-custodied"
            title={t('custodiedTitle')}
            total={fmt.money(data.custodied.total)}
          />
          {rowList(custodiedRows)}
        </section>

        <div className={styles.column}>
          <section className={styles.card} aria-labelledby="xp-ledger-platform">
            <CardHeader
              id="xp-ledger-platform"
              title={t('platformTitle')}
              total={fmt.money(data.platform.total)}
            />
            {rowList(platformRows)}
          </section>

          <section className={styles.card} aria-labelledby="xp-ledger-flow">
            <CardHeader id="xp-ledger-flow" title={t('flowTitle')} />
            <div className={styles.flow}>
              <div className={styles.flowItem}>
                <span className={styles.flowLabel}>{t('flowIn')}</span>
                <span className={cx(styles.flowValue, styles.flowIn)}>
                  {fmt.money(data.inflow.bankIn)}
                </span>
                <span className={styles.flowCount}>
                  {t('flowCount', { count: data.inflow.bankInCount })}
                </span>
              </div>
              <div className={styles.flowItem}>
                <span className={styles.flowLabel}>{t('flowOut')}</span>
                <span className={cx(styles.flowValue, styles.flowOut)}>
                  {fmt.money(data.outflow.total)}
                </span>
                <span className={styles.flowCount}>
                  {t('flowCount', {
                    count: data.outflow.withdrawalsPaidCount + data.outflow.refundsPaidCount,
                  })}
                </span>
              </div>
            </div>
            <Collapse
              size="small"
              ghost
              className={styles.flowDetails}
              items={[
                {
                  key: 'details',
                  label: t('flowDetails'),
                  children: (
                    <div className={styles.flowLists}>
                      <h4 className={styles.subTitle}>{t('flowIn')}</h4>
                      {rowList(inflowRows)}
                      <h4 className={styles.subTitle}>{t('flowOut')}</h4>
                      {rowList(outflowRows)}
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * Phương trình — bốn ô, toán tử đứng giữa. Ô số dư ngân hàng là ô DUY NHẤT nhập được: nhập tại
 * chỗ bằng `MoneyInput` (dấu chấm hàng nghìn), không có một hàng ô nhập + đoạn giải thích riêng.
 */
function Equation({ date, data }: { date: string; data: DailyReconciliation }) {
  const t = useTranslations('PlatformMoney.reconciliation');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const saveBalance = useSaveBankBalance();

  const missing = data.bankBalanceEod === null;
  /** Đang sửa số dư của ĐÚNG ngày này — đổi ngày là thôi sửa, không mang số sang ngày khác. */
  const [editing, setEditing] = useState<{ date: string; value: number | null } | null>(null);
  const draft = editing?.date === date ? editing : null;
  const showInput = missing || draft !== null;

  const varianceKnown = data.variance !== null;
  const varianceOff = varianceKnown && Number(data.variance) !== 0;

  function save() {
    const value = draft?.value;
    if (value == null || value < 0) return;
    saveBalance.mutate(
      { date, balance: String(Math.round(value)) },
      {
        onSuccess: () => {
          setEditing(null);
          message.success(t('balanceSaved'));
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  }

  return (
    <div className={styles.equation} role="group" aria-label={t('equationLabel')}>
      <div className={cx(styles.term, styles.termBank)}>
        <span className={styles.termLabel}>{t('bankBalanceEod')}</span>
        {showInput ? (
          <div className={styles.balanceEdit}>
            <MoneyInput
              value={draft?.value ?? null}
              min={0}
              placeholder={t('balancePlaceholder')}
              aria-label={t('bankBalanceEod')}
              disabled={saveBalance.isPending}
              className={styles.balanceInput}
              onChange={(value) =>
                setEditing({ date, value: typeof value === 'number' ? value : null })
              }
              onPressEnter={save}
            />
            <div className={styles.balanceActions}>
              <Button
                type="primary"
                size="small"
                loading={saveBalance.isPending}
                disabled={draft?.value == null}
                onClick={save}
              >
                {t('saveBalance')}
              </Button>
              {!missing ? (
                <Button size="small" type="text" onClick={() => setEditing(null)}>
                  {tCommon('actions.cancel')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <span className={styles.termValueRow}>
            <span className={styles.termValue}>{fmt.money(data.bankBalanceEod)}</span>
            <Tooltip title={t('updateBalance')}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                aria-label={t('updateBalance')}
                onClick={() => setEditing({ date, value: Number(data.bankBalanceEod) })}
              />
            </Tooltip>
          </span>
        )}
      </div>

      <Operator symbol="=" />
      <Term label={t('platformTitle')} value={fmt.money(data.platform.total)} />
      <Operator symbol="+" />
      <Term label={t('custodiedTitle')} value={fmt.money(data.custodied.total)} />
      <Operator symbol="+" />

      <div
        className={cx(
          styles.term,
          varianceOff && styles.termError,
          varianceKnown && !varianceOff && styles.termSuccess,
        )}
      >
        <span className={styles.termLabel}>
          {t('varianceTitle')}
          {varianceOff ? (
            <Tooltip title={t('varianceHint')}>
              <InfoCircleOutlined className={styles.termInfo} aria-label={t('varianceHint')} />
            </Tooltip>
          ) : null}
        </span>
        <span className={styles.termValue}>
          {varianceKnown ? (
            fmt.money(data.variance)
          ) : (
            <em className={styles.notEntered}>{t('notComputable')}</em>
          )}
        </span>
        <span className={styles.termCaption}>
          {!varianceKnown ? (
            t('varianceMissing')
          ) : varianceOff ? (
            <>
              <CloseCircleFilled aria-hidden /> {t('varianceOff')}
            </>
          ) : (
            <>
              <CheckCircleFilled aria-hidden /> {t('varianceBalanced')}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.term}>
      <span className={styles.termLabel}>{label}</span>
      <span className={styles.termValue}>{value}</span>
    </div>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <span className={styles.operator} aria-hidden>
      {symbol}
    </span>
  );
}

function CardHeader({ id, title, total }: { id: string; title: string; total?: string }) {
  return (
    <header className={styles.cardHeader}>
      <h3 id={id} className={styles.cardTitle}>
        {title}
      </h3>
      {total ? <span className={styles.cardTotal}>{total}</span> : null}
    </header>
  );
}

/** Một danh sách dòng tiền: nhãn (+ chip số khoản) bên trái, số tiền bên phải, cả dòng là lối tắt. */
function LedgerRows({
  rows,
  visibleQueues,
  onOpenQueue,
}: {
  rows: LedgerRow[];
  visibleQueues: readonly FinanceQueue[];
  onOpenQueue: (queue: FinanceQueue) => void;
}) {
  const t = useTranslations('PlatformMoney.reconciliation');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  return (
    <ul className={styles.rows}>
      {rows.map((row) => {
        const zero = Number(row.amount) === 0;
        const linked = row.queue && visibleQueues.includes(row.queue) ? row.queue : null;
        const content: ReactNode = (
          <>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>
                {row.label}
                {row.count ? (
                  <span className={styles.countChip}>{t('countChip', { count: row.count })}</span>
                ) : null}
              </span>
              {row.note ? <span className={styles.rowNote}>{row.note}</span> : null}
            </span>
            <span className={styles.rowAmount}>
              {zero ? tCommon('labels.emptyValue') : fmt.money(row.amount)}
            </span>
            {linked ? <RightOutlined className={styles.rowChevron} aria-hidden /> : null}
          </>
        );
        return (
          <li key={row.key} className={cx(styles.row, zero && styles.rowZero)}>
            {linked ? (
              <button
                type="button"
                className={styles.rowButton}
                onClick={() => onOpenQueue(linked)}
              >
                {content}
              </button>
            ) : (
              <div className={styles.rowStatic}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
