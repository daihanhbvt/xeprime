'use client';

import { CalendarOutlined } from '@ant-design/icons';
import { Alert, App, Button, DatePicker, Empty, Pagination, Popconfirm, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ACCOUNT_TRANSACTION_STATUS,
  ACCOUNT_TRANSACTION_STATUS_VALUES,
  isAccountTransactionStatus,
  type AccountTransactionStatus,
} from '@xeprime/types';
import { ROUTES, tripPath } from '@/constants/routes';
import { useCancelWithdrawal } from '@/features/wallet/hooks';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAppFormat, useDatePickerPattern } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { DAY_PARAM_FORMAT, dayjs, toAppTz } from '@/lib/datetime';
import { absoluteMoney, isNegativeMoney, isZeroMoney } from '@/lib/money';
import { useAccountTransactions } from '../hooks/use-account-transactions';
import type { AccountTransaction } from '../types';

import styles from './AccountPaymentsView.module.css';

/** Mốc thời gian của một dòng — "19:00:39 16/07/2026" như bản vẽ, giờ Việt Nam. */
const ROW_TIME_FORMAT = 'HH:mm:ss DD/MM/YYYY';
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_CLASS: Record<AccountTransactionStatus, string | undefined> = {
  [ACCOUNT_TRANSACTION_STATUS.SUCCEEDED]: styles.badgeSuccess,
  [ACCOUNT_TRANSACTION_STATUS.PENDING]: styles.badgePending,
  [ACCOUNT_TRANSACTION_STATUS.FAILED]: styles.badgeFailed,
};

function dayParam(value: string | null | undefined): string | null {
  return value && DAY_PATTERN.test(value) ? value : null;
}

/**
 * Tab "Lịch sử giao dịch" (`/account/payments`) — Figma Account / History (`21695:27193`).
 *
 * MỘT danh sách hợp nhất mọi lần tiền của khách dịch chuyển (`GET /account/transactions`): tiền giữ
 * chỗ đã chuyển, lệnh rút ví điểm, tiền hoàn, khoản tiền thuê/cọc gian hàng ghi nhận. Lọc theo
 * trạng thái (chip) và khoảng ngày — cả hai chạy ở SERVER, nên số dòng và phân trang đúng trên toàn
 * bộ lịch sử.
 *
 * Bộ lọc và trang sống trên URL (ADR 0004): `?status=&from=&to=&page=`.
 *
 * Lệnh rút còn chờ duyệt có nút nhỏ "Huỷ yêu cầu" — trước đây nằm ở khối "Yêu cầu rút" của tab
 * số dư; tab đó nay chỉ còn thẻ số dư + tài khoản nhận tiền.
 */
export function AccountPaymentsView() {
  const t = useTranslations('AccountPayments.history');
  const tCommon = useTranslations('Common');
  const router = useRouter();
  const params = useSearchParams();
  const datePattern = useDatePickerPattern();

  const rawStatus = params?.get('status');
  const status = isAccountTransactionStatus(rawStatus) ? rawStatus : null;
  const from = dayParam(params?.get('from'));
  const to = dayParam(params?.get('to'));
  const page = Math.max(1, Number(params?.get('page') ?? 1) || 1);

  const { data, isLoading, isFetching, isError, refetch } = useAccountTransactions({
    status,
    from,
    to,
    page,
  });

  function go(next: {
    status?: AccountTransactionStatus | null;
    from?: string | null;
    to?: string | null;
    page?: number;
  }) {
    const query = new URLSearchParams(params?.toString() ?? '');
    const setOrDelete = (key: string, value: string | null | undefined) => {
      if (value) query.set(key, value);
      else query.delete(key);
    };
    const filterChanged =
      next.status !== undefined || next.from !== undefined || next.to !== undefined;
    setOrDelete('status', next.status === undefined ? status : next.status);
    setOrDelete('from', next.from === undefined ? from : next.from);
    setOrDelete('to', next.to === undefined ? to : next.to);
    // Đổi bộ lọc thì về trang 1 — giữ `page=4` trên một danh sách vừa hẹp lại là một trang trống.
    const nextPage = next.page ?? (filterChanged ? 1 : page);
    setOrDelete('page', nextPage > 1 ? String(nextPage) : null);
    const qs = query.toString();
    router.replace(qs ? `${ROUTES.ACCOUNT.PAYMENTS}?${qs}` : ROUTES.ACCOUNT.PAYMENTS, {
      scroll: false,
    });
  }

  const chips: { value: AccountTransactionStatus | null; label: string }[] = [
    { value: null, label: t('filters.all') },
    ...ACCOUNT_TRANSACTION_STATUS_VALUES.map((value) => ({
      value,
      label: t(`status.${value}`),
    })),
  ];
  const filtered = status !== null || from !== null || to !== null;

  return (
    <div className={styles.page}>
      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label={t('filters.label')}>
          {chips.map((chip) => {
            const active = chip.value === status;
            return (
              <button
                key={chip.value ?? 'all'}
                type="button"
                className={cx(styles.chip, active && styles.chipActive)}
                aria-pressed={active}
                onClick={() => {
                  if (!active) go({ status: chip.value });
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        <DatePicker.RangePicker
          className={styles.range}
          aria-label={t('filters.range')}
          placeholder={[t('filters.rangePlaceholder'), t('filters.rangeTo')]}
          format={datePattern.date}
          suffixIcon={<CalendarOutlined />}
          allowEmpty={[true, true]}
          value={[from ? dayjs(from, DAY_PARAM_FORMAT) : null, to ? dayjs(to, DAY_PARAM_FORMAT) : null]}
          onChange={(dates) =>
            go({
              from: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : null,
              to: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : null,
            })
          }
        />
      </div>

      {isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

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
        data.meta.total === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={filtered ? t('empty.filtered') : t('empty.all')}
          />
        ) : (
          <>
            <ul
              className={cx(styles.list, isFetching && styles.listBusy)}
              aria-label={t('title')}
              aria-busy={isFetching}
            >
              {data.data.map((row) => (
                <TransactionRow key={row.id} row={row} />
              ))}
            </ul>
            {data.meta.total > data.meta.limit ? (
              <Pagination
                className={styles.pagination}
                current={data.meta.page}
                pageSize={data.meta.limit}
                total={data.meta.total}
                showSizeChanger={false}
                showTotal={(total) => t('total', { count: total })}
                onChange={(next) => go({ page: next })}
              />
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}

/**
 * Một dòng (Figma `21695:41670`): tên khoản · "#mã  giờ ngày" bên dưới · số tiền có dấu · nhãn
 * trạng thái (xanh / cam / đỏ). Mã dẫn về chuyến khi dòng thuộc một chuyến.
 */
function TransactionRow({ row }: { row: AccountTransaction }) {
  const t = useTranslations('AccountPayments.history');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const cancel = useCancelWithdrawal('account');

  const negative = isNegativeMoney(row.amount) && !isZeroMoney(row.amount);
  const sign = isZeroMoney(row.amount) ? '' : negative ? '-' : '+';
  const codeText = row.code ? `#${row.code}` : null;

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{t(`titles.${row.title}`)}</p>
        <p className={styles.rowMeta}>
          {codeText ? (
            row.tripId ? (
              <Link className={styles.code} href={tripPath.detail(row.tripId)}>
                {codeText}
              </Link>
            ) : (
              <span className={styles.code}>{codeText}</span>
            )
          ) : null}
          <time className={styles.time} dateTime={row.occurredAt}>
            {toAppTz(row.occurredAt).format(ROW_TIME_FORMAT)}
          </time>
        </p>
      </div>
      <p className={styles.amount}>
        {sign}
        {fmt.money(absoluteMoney(row.amount))}
      </p>
      <div className={styles.rowSide}>
        <span className={cx(styles.badge, STATUS_CLASS[row.status])}>
          {t(`status.${row.status}`)}
        </span>
        {row.cancellable ? (
          <Popconfirm
            title={t('cancel.confirm')}
            description={t('cancel.hint')}
            onConfirm={() =>
              cancel.mutate(row.id, {
                onSuccess: () => message.success(t('cancel.done')),
                onError: (err: unknown) => message.error(errorMessage(err)),
              })
            }
          >
            <button type="button" className={styles.cancel} disabled={cancel.isPending}>
              {t('cancel.action')}
            </button>
          </Popconfirm>
        ) : null}
      </div>
    </li>
  );
}
