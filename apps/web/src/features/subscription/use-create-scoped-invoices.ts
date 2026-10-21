'use client';

import { useState } from 'react';

import type { usePurchaseSubscription } from './hooks/use-subscription';
import type { PlanLaneScope } from './plan-lanes';
import type { ScopedPlanSelection } from './plan-purchase';
import type { SubscriptionInvoice } from './types';

export interface ScopedInvoiceFailure {
  scope: PlanLaneScope;
  error: unknown;
}

export interface ScopedInvoiceResult {
  created: SubscriptionInvoice[];
  failed: ScopedInvoiceFailure | null;
}

/**
 * Tạo MỘT hoá đơn cho MỖI làn đã chọn, lần lượt (ADR 0065 — server giữ tối đa một hoá đơn mở mỗi
 * phạm vi, không có endpoint mua nhiều phạm vi một lượt).
 *
 * Lần lượt chứ không song song: hai `POST /subscription/purchase` cùng lúc cùng tranh advisory lock
 * theo tenant, và một lượt hỏng giữa chừng phải dừng chuỗi để màn hình nói đúng "làn nào đã có hoá
 * đơn, làn nào chưa". Hoá đơn đã tạo KHÔNG được rút lại khi lượt sau hỏng — nó là một mã đối soát
 * thật, người dùng có thể đã quét; nơi gọi hiện nó cùng lỗi của làn còn lại.
 *
 * Nhận đúng mutation của `usePurchaseSubscription` (nơi gọi đã có nó để đọc `isPending`/cache), nên
 * cập nhật danh sách hoá đơn chờ vẫn đi qua một chỗ duy nhất.
 */
export function useCreateScopedInvoices(purchase: ReturnType<typeof usePurchaseSubscription>) {
  const [running, setRunning] = useState(false);
  const [failed, setFailed] = useState<ScopedInvoiceFailure | null>(null);

  async function run(selections: readonly ScopedPlanSelection[]): Promise<ScopedInvoiceResult> {
    setRunning(true);
    setFailed(null);
    const created: SubscriptionInvoice[] = [];
    let failure: ScopedInvoiceFailure | null = null;
    try {
      for (const selection of selections) {
        try {
          created.push(await purchase.mutateAsync(selection.body));
        } catch (error) {
          failure = { scope: selection.scope, error };
          break;
        }
      }
    } finally {
      setRunning(false);
    }
    setFailed(failure);
    return { created, failed: failure };
  }

  return { run, running: running || purchase.isPending, failed, clear: () => setFailed(null) };
}
