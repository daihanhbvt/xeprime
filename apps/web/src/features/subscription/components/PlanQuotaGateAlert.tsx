'use client';

import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { PERMISSION, canUpgradeToPackageTrack } from '@xeprime/types';

import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useMySubscription } from '../hooks/use-subscription';
import { PLAN_QUOTA_GATE_KIND, PLAN_QUOTA_GATE_SOURCE, planQuotaGateHref, type PlanQuotaGate } from '../plan-quota-gate';
import { usePlanQuotaGateCopy } from '../use-plan-quota-gate-message';
import { PackageUpgradeWizard } from './PackageUpgradeWizard';
import { PlanPurchaseDialog } from './PlanPurchaseDialog';

/**
 * "Gói chưa cho phép thêm / đưa xe này lên chợ" — dải lỗi có LỐI ĐI TIẾP (ADR 0065).
 *
 * Một dải, không phải một toast: câu trả lời cần một lối tới đúng làn gói của loại xe bị chặn, và
 * `message.error` thì không chứa được nút — nó biến mất sau vài giây. Dải đứng yên cho tới khi lượt
 * sau đi qua.
 *
 * `inDialog` (wizard thêm xe, 18/11/2026): nút mở MODAL ngay tại chỗ thay vì chuyển trang - rời
 * trang giữa wizard là bỏ dở việc đang làm. Chủ xe tuyến hoa hồng ⇒ luồng nâng cấp lên gian hàng
 * (`PackageUpgradeWizard`); gian hàng được mua gói ⇒ hộp mua gói chọn sẵn làn của loại xe bị chặn.
 * Không đủ quyền/dữ liệu cho modal ⇒ vẫn là link như cũ.
 */
export function PlanQuotaGateAlert({
  gate,
  className,
  inDialog = false,
}: {
  gate: PlanQuotaGate;
  className?: string;
  inDialog?: boolean;
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
        inDialog ? (
          <GateDialogAction gate={gate} label={copy.cta} />
        ) : (
          <Link href={planQuotaGateHref(gate)}>
            <Button type="primary" size="small">
              {copy.cta}
            </Button>
          </Link>
        )
      }
    />
  );
}

function GateDialogAction({ gate, label }: { gate: PlanQuotaGate; label: string }) {
  const [open, setOpen] = useState(false);
  const { has } = usePermissions();
  const { tenant } = useTenantScope();
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.PLAN_PURCHASE);
  const canPurchase = has(PERMISSION.SUBSCRIPTION_PURCHASE) && !inSupport;
  const upgrading = canPurchase && canUpgradeToPackageTrack(tenant);
  // Chỉ hỏi gói hiện hành khi đi đường MUA GÓI (gian hàng) - chủ xe hoa hồng không cần.
  const me = useMySubscription(canPurchase && !upgrading);
  const canBuy = canPurchase && !upgrading && Boolean(me.data);

  if (!upgrading && !canBuy) {
    return (
      <Link href={planQuotaGateHref(gate)}>
        <Button type="primary" size="small">
          {label}
        </Button>
      </Link>
    );
  }

  // Gói dùng chung (Doanh nghiệp) không có làn riêng ⇒ mở hộp không chọn sẵn làn.
  const scope =
    gate.kind === PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED ||
    gate.source === PLAN_QUOTA_GATE_SOURCE.LANE_PLAN
      ? gate.vehicleType
      : null;

  return (
    <>
      <Button type="primary" size="small" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {upgrading ? (
        <ResponsiveDialog open={open} onClose={() => setOpen(false)} title={label} size="xl" footer={null}>
          {/* Chỉ gắn khi mở - luồng tự gọi API hoá đơn chờ, không chạy ngầm trên màn thêm xe. */}
          {open ? <PackageUpgradeWizard /> : null}
        </ResponsiveDialog>
      ) : me.data ? (
        <PlanPurchaseDialog
          open={open}
          data={me.data}
          initialScope={scope}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
