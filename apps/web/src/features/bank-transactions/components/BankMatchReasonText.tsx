'use client';

import { useTranslations } from 'next-intl';
import { BANK_MATCH_REASON_VALUES, type BankMatchReason } from '@xeprime/types';
import type { BankTransaction } from '../types';

function isBankMatchReason(value: string | null | undefined): value is BankMatchReason {
  return Boolean(value) && (BANK_MATCH_REASON_VALUES as string[]).includes(value as string);
}

/**
 * Câu giải thích của MÃ lý do hệ thống ghi trên một giao dịch tiền vào (ADR 0092) — dịch theo ngôn
 * ngữ người xem (ADR 0012), không còn hiện câu tiếng Việt server ghi vào `match_note`. Mã lạ (bản
 * API mới hơn bản web) thì không hiện gì thay vì hiện một khoá thô.
 */
export function BankMatchReasonText({
  tx,
}: {
  tx: Pick<BankTransaction, 'matchReasonCode' | 'matchReasonParams'>;
}) {
  const t = useTranslations('BankTransactions.reasons');
  if (!isBankMatchReason(tx.matchReasonCode)) return null;
  return <>{t(tx.matchReasonCode, { code: tx.matchReasonParams?.code ?? '' })}</>;
}

/** Nhãn NGẮN của một mã lý do — cho thẻ ở danh sách và ô lọc. */
export function useBankMatchReasonLabel() {
  const t = useTranslations('BankTransactions.reasonLabels');
  return (code: string | null | undefined): string | null =>
    isBankMatchReason(code) ? t(code) : null;
}
