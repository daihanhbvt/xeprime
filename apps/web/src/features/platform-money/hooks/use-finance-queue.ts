'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { DAY_PARAM_FORMAT, dayjs, nowInAppTz } from '@/lib/datetime';
import {
  FINANCE_PARAM,
  FINANCE_QUEUE_PERMISSION,
  FINANCE_QUEUE_VALUES,
  isFinanceQueue,
  type FinanceQueue,
} from '../finance-queues';

/**
 * Hàng đợi đang chọn + ngày đối soát của màn Tài chính — cả hai sống ở URL (ADR 0004): gửi link
 * "hàng đợi rút tiền" cho đồng nghiệp là họ mở ra đúng hàng đợi đó.
 *
 * Đổi hàng đợi thì XOÁ mọi tham số khác ngoài ngày: bộ lọc của hàng đợi này (`status=pending` của
 * khoản hoàn) không có nghĩa ở hàng đợi kia, và để nó nằm lại là để nó sống dậy sai chỗ.
 */
export function useFinanceQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has, isLoading } = usePermissions();

  const visibleQueues = useMemo(
    () => FINANCE_QUEUE_VALUES.filter((queue) => has(FINANCE_QUEUE_PERMISSION[queue])),
    [has],
  );

  const requested = searchParams.get(FINANCE_PARAM.QUEUE);
  // Mã lạ, hoặc hàng đợi mà người này không có quyền ⇒ về hàng đợi đầu tiên họ THẤY được.
  const queue: FinanceQueue | null =
    isFinanceQueue(requested) && visibleQueues.includes(requested)
      ? requested
      : (visibleQueues[0] ?? null);

  const today = nowInAppTz().format(DAY_PARAM_FORMAT);
  const rawDate = searchParams.get(FINANCE_PARAM.DATE);
  const date =
    rawDate && dayjs(rawDate, DAY_PARAM_FORMAT, true).isValid() && rawDate <= today
      ? rawDate
      : today;

  const navigate = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /** `extra`: tham số RIÊNG của hàng đợi đích mở kèm (thẻ thuế → `period` của kỳ cũ nhất). */
  const selectQueue = useCallback(
    (next: FinanceQueue, extra?: Record<string, string>) => {
      const params = new URLSearchParams();
      params.set(FINANCE_PARAM.QUEUE, next);
      const keptDate = searchParams.get(FINANCE_PARAM.DATE);
      if (keptDate) params.set(FINANCE_PARAM.DATE, keptDate);
      for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
      navigate(params);
    },
    [navigate, searchParams],
  );

  const selectDate = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      // Hôm nay là mặc định — không ghi `?date=` cho nó, để link "hôm nay" vẫn là hôm nay ngày mai.
      if (next === today) params.delete(FINANCE_PARAM.DATE);
      else params.set(FINANCE_PARAM.DATE, next);
      navigate(params);
    },
    [navigate, searchParams, today],
  );

  return {
    queue,
    visibleQueues,
    permissionsLoading: isLoading,
    date,
    isToday: date === today,
    selectQueue,
    selectDate,
  };
}
