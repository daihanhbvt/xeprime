'use client';

import { DatePicker, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { BankInQueue } from '@/features/bank-transactions/components/BankInQueue';
import { TaxPeriodPanel } from '@/features/tax/components/TaxPeriodPanel';
import { useAppFormat } from '@/i18n/use-app-format';
import { DAY_PARAM_FORMAT, dayjs, nowInAppTz, type Dayjs } from '@/lib/datetime';
import { FINANCE_QUEUE, type FinanceQueue } from '../finance-queues';
import { useFinanceQueue } from '../hooks/use-finance-queue';
import { useDailyReconciliation, useMoneySummary } from '../hooks/use-platform-money';
import { FinanceQueueRail, useFinanceQueueLabel } from './FinanceQueueRail';
import { FinanceSummaryStrip } from './FinanceSummaryStrip';
import { HoldsPanel } from './HoldsPanel';
import { InsuranceQueue } from './InsuranceQueue';
import { LedgerPanel } from './LedgerPanel';
import { RefundsPanel } from './RefundsPanel';
import { WithdrawalQueue } from './WithdrawalQueue';
import styles from './FinanceView.module.css';

const CONTENT_TITLE_ID = 'xp-finance-queue-title';

/**
 * Màn TÀI CHÍNH của nền tảng (`/manage/admin/money`) — ADR 0022 · ADR 0025 · ADR 0028 gate 6–7.
 *
 * 01/10/2026 gộp hai màn cũ ("Đối soát tiền vào" + "Vận hành tiền" sáu tab) thành một bàn làm
 * việc: dải trên trả lời "hôm nay sổ có khớp không, việc đang chờ ở đâu"; cột trái là các hàng
 * đợi nhóm theo CHIỀU TIỀN (vào → đang giữ → ra → bên thứ ba → sổ); bên phải là hàng đợi đang
 * chọn. Hàng đợi và ngày đối soát nằm trên URL — F5 và gửi link đều giữ đúng chỗ.
 *
 * Mỗi hàng đợi tự gác bằng quyền của chính nó (`FINANCE_QUEUE_PERMISSION`), khớp guard backend
 * của endpoint tương ứng.
 */
export function FinanceView() {
  const t = useTranslations('PlatformMoney');
  const fmt = useAppFormat();
  const queueLabel = useFinanceQueueLabel();
  const { queue, visibleQueues, permissionsLoading, date, isToday, selectQueue, selectDate } =
    useFinanceQueue();

  /*
   * Dải tóm tắt (thẻ đếm + kết luận đối soát) và ngày đối soát đọc hai endpoint gác bằng quyền
   * TIỀN — cùng quyền với sổ đối soát. Người chỉ có quyền GÓI (chỉ thấy hàng đợi tiền vào) không
   * gọi chúng và không thấy dải đó, thay vì nhìn hai thẻ lỗi 403.
   */
  const canReadMoney = visibleQueues.includes(FINANCE_QUEUE.LEDGER);
  const summary = useMoneySummary({ enabled: canReadMoney });
  const reconciliation = useDailyReconciliation(date, { enabled: canReadMoney });

  const dateLabel = fmt.dateKey(date);
  const today = nowInAppTz();

  const datePicker = (
    <DatePicker
      value={dayjs(date, DAY_PARAM_FORMAT)}
      allowClear={false}
      aria-label={t('page.dateLabel')}
      // Đối soát chỉ có nghĩa với ngày đã qua hoặc hôm nay — ngày mai chưa có sổ nào để khớp.
      disabledDate={(day: Dayjs) => day.isAfter(today, 'day')}
      format={(value: Dayjs) => {
        const label = fmt.dateKey(value.format(DAY_PARAM_FORMAT));
        return value.isSame(today, 'day') ? t('page.today', { date: label }) : label;
      }}
      onChange={(value) => {
        if (value) selectDate(value.format(DAY_PARAM_FORMAT));
      }}
    />
  );

  if (permissionsLoading) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (!queue) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <PermissionState />
      </div>
    );
  }

  return (
    <div>
      <ManagePageHeader title={t('page.title')} extra={canReadMoney ? datePicker : undefined} />

      {canReadMoney ? (
        <FinanceSummaryStrip
          isToday={isToday}
          dateLabel={dateLabel}
          summary={summary.data}
          summaryLoading={summary.isLoading}
          summaryError={summary.isError}
          reconciliation={reconciliation.data}
          reconciliationLoading={reconciliation.isLoading}
          reconciliationError={reconciliation.isError}
          visibleQueues={visibleQueues}
          activeQueue={queue}
          onSelect={selectQueue}
        />
      ) : null}

      <div className={styles.body}>
        <FinanceQueueRail
          visibleQueues={visibleQueues}
          activeQueue={queue}
          summary={summary.data}
          onSelect={selectQueue}
        />

        <section className={styles.content} aria-labelledby={CONTENT_TITLE_ID}>
          <h2 id={CONTENT_TITLE_ID} className={styles.contentTitle}>
            {queueLabel(queue)}
          </h2>
          {/* `key` = hàng đợi: đổi hàng đợi là dựng lại panel, không mang state cục bộ sang. */}
          <QueuePanel
            key={queue}
            queue={queue}
            date={date}
            visibleQueues={visibleQueues}
            onOpenQueue={selectQueue}
          />
        </section>
      </div>
    </div>
  );
}

function QueuePanel({
  queue,
  date,
  visibleQueues,
  onOpenQueue,
}: {
  queue: FinanceQueue;
  date: string;
  visibleQueues: readonly FinanceQueue[];
  onOpenQueue: (queue: FinanceQueue) => void;
}) {
  switch (queue) {
    case FINANCE_QUEUE.BANK_IN:
      return <BankInQueue />;
    case FINANCE_QUEUE.HOLDS:
      return <HoldsPanel />;
    case FINANCE_QUEUE.REFUNDS:
      return <RefundsPanel />;
    case FINANCE_QUEUE.WITHDRAWALS:
      return <WithdrawalQueue />;
    case FINANCE_QUEUE.INSURANCE:
      return <InsuranceQueue />;
    case FINANCE_QUEUE.TAX:
      return <TaxPeriodPanel />;
    case FINANCE_QUEUE.LEDGER:
      return <LedgerPanel date={date} visibleQueues={visibleQueues} onOpenQueue={onOpenQueue} />;
  }
}
