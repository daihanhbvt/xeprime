'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';

import { planQuotaGateHref, type PlanQuotaGate } from '../plan-quota-gate';
import { usePlanQuotaGateCopy } from '../use-plan-quota-gate-message';

/**
 * "Gói chưa cho phép thêm / đưa xe này lên chợ" — dải lỗi có LỐI ĐI TIẾP (ADR 0065).
 *
 * Một dải, không phải một toast: câu trả lời cần một cái LINK tới đúng làn gói của loại xe bị chặn,
 * và `message.error` thì không chứa được link — nó biến mất sau vài giây, để lại người dùng với
 * một câu nói về gói mà không có đường nào tới chỗ mua. Dải đứng yên cho tới khi lượt sau đi qua.
 */
export function PlanQuotaGateAlert({
  gate,
  className,
}: {
  gate: PlanQuotaGate;
  className?: string;
}) {
  const copyOf = usePlanQuotaGateCopy();
  const copy = copyOf(gate);
  return (
    <Alert
      type="warning"
      showIcon
      className={className}
      title={copy.title}
      action={
        <Link href={planQuotaGateHref(gate)}>
          <Button type="primary" size="small">
            {copy.cta}
          </Button>
        </Link>
      }
    />
  );
}
