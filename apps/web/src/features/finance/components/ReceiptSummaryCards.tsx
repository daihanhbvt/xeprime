'use client';

import { Alert } from 'antd';
import { isNegativeMoney } from '@/lib/money';
import { useAppFormat } from '@/i18n/use-app-format';
import type { ReceiptSummary } from '../types';
import styles from './ReceiptSummaryCards.module.css';

interface ReceiptSummaryCardsProps {
  data: ReceiptSummary | undefined;
  loading: boolean;
  error: boolean;
  /** Có filter nào đang bật không — đổi câu chú thích, không đổi con số. */
  filtered: boolean;
}

/**
 * Bốn con số của ĐÚNG danh sách đang xem.
 *
 * Điểm khác biệt so với dashboard `/manage/finance`: thẻ ở đây cộng cùng một vị từ với bảng bên
 * dưới (backend dùng chung `whereOf`). Một thẻ "Tổng thu" không khớp bảng ngay dưới nó là cách
 * nhanh nhất khiến người dùng thôi tin cả hai con số.
 *
 * Chỉ cộng phiếu ĐÃ DUYỆT — phiếu chờ duyệt chưa phải tiền thật, và chú thích nói rõ điều đó
 * thay vì để người dùng tự đoán vì sao tổng không khớp số dòng.
 */
export function ReceiptSummaryCards({
  data,
  loading,
  error,
  filtered,
}: ReceiptSummaryCardsProps) {
  const fmt = useAppFormat();

  if (error && !data) {
    return (
      <Alert
        className={styles.error}
        type="warning"
        showIcon
        message="Không tải được số tổng — danh sách bên dưới vẫn đúng"
      />
    );
  }

  const showSkeleton = loading && !data;
  const balanceNegative = isNegativeMoney(data?.balance);

  return (
    <div className={styles.grid}>
      <Card
        label="Tổng thu"
        value={data ? fmt.money(data.totalIncome) : null}
        tone={styles.income}
        loading={showSkeleton}
        breakdown={
          data
            ? [
                `Tiền mặt ${fmt.money(data.incomeCash)}`,
                `Chuyển khoản ${fmt.money(data.incomeTransfer)}`,
              ]
            : undefined
        }
      />
      <Card
        label="Tổng chi"
        value={data ? fmt.money(data.totalExpense) : null}
        tone={styles.expense}
        loading={showSkeleton}
      />
      <Card
        label="Cân đối (thu − chi)"
        value={data ? fmt.money(data.balance) : null}
        tone={balanceNegative ? styles.negative : styles.income}
        loading={showSkeleton}
      />
      <Card
        label="Phiếu đã duyệt"
        value={data ? fmt.count(data.approvedCount) : null}
        tone={styles.neutral}
        loading={showSkeleton}
        breakdown={
          data
            ? [filtered ? 'Trong bộ lọc đang xem' : 'Toàn bộ sổ · phiếu chờ duyệt chưa tính']
            : undefined
        }
      />
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  loading,
  breakdown,
}: {
  label: string;
  value: string | null;
  tone: string | undefined;
  loading: boolean;
  breakdown?: string[];
}) {
  return (
    <div className={styles.card}>
      <span className={styles.label}>{label}</span>
      {loading ? (
        <span className={styles.skeleton} aria-hidden />
      ) : (
        <span className={`${styles.value} ${tone}`}>{value ?? '—'}</span>
      )}
      {breakdown && !loading ? (
        <div className={styles.breakdown}>
          {breakdown.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
