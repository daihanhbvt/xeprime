'use client';

import { useMemo } from 'react';
import {
  PAYMENT_METHOD_VALUES,
  RECEIPT_SOURCE_VALUES,
  RECEIPT_STATUS_VALUES,
  RECEIPT_TYPE_VALUES,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';

export interface FinanceOption {
  value: string;
  label: string;
}

export interface FinanceOptions {
  receiptType: FinanceOption[];
  receiptStatus: FinanceOption[];
  receiptSource: FinanceOption[];
  paymentMethod: FinanceOption[];
}

/**
 * Bốn bộ option enum của sổ Thu-Chi, nhãn lấy từ namespace `Domain`.
 *
 * Thay cho bốn hằng `*_OPTIONS` dựng sẵn từ `*_META` của `@xeprime/types`: những map đó vẫn là
 * nguồn MÀU và vẫn được apps/api dùng cho email/thông báo, nhưng nhãn của chúng chỉ có tiếng
 * Việt. Một hằng ở tầng module không gọi được hook nên không thể đổi theo ngôn ngữ — vì vậy nó
 * phải là hook, không phải hằng (ADR 0012).
 *
 * MÃ giữ nguyên tuyệt đối (`income`, `cash`, `pending_approval`): đây là dữ liệu đi trên dây và
 * nằm trong URL, chỉ nhãn mới dịch.
 */
export function useFinanceOptions(): FinanceOptions {
  const domainLabel = useDomainLabel();

  return useMemo(
    () => ({
      receiptType: RECEIPT_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('receiptType', value),
      })),
      receiptStatus: RECEIPT_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('receiptStatus', value),
      })),
      receiptSource: RECEIPT_SOURCE_VALUES.map((value) => ({
        value,
        label: domainLabel('receiptSource', value),
      })),
      paymentMethod: PAYMENT_METHOD_VALUES.map((value) => ({
        value,
        label: domainLabel('paymentMethod', value),
      })),
    }),
    [domainLabel],
  );
}
