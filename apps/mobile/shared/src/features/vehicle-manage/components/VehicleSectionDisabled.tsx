import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import type { ServiceType } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useDomainLabel } from '@/i18n/domain';
import type { VehicleDetail } from '@/features/vehicles/api';
import { useServiceToggle } from '../hooks/use-service-toggle';

/**
 * Mục thuộc một DỊCH VỤ ĐANG TẮT — mời bật, thay vì bày một biểu mẫu không có tác dụng.
 *
 * Tách khỏi [`VehicleManageShell`](./VehicleManageShell.tsx) để nhánh "dịch vụ tắt" gọi
 * `useServiceToggle` chỉ khi cần, và để vỏ giữ nguyên thanh đầu màn của chính màn gọi.
 *
 * Hai khu nói khác nhau, đúng như web:
 * - `account` (`VehicleManageWorkspace`): luôn mời bật; bật không được thì nói lý do, không nút.
 * - `manage` (`VehicleEditWorkspace`): người không có công tắc (thiếu `vehicles.update`) đọc
 *   `operationsTab.serviceOff`; có công tắc nhưng bị chặn thì không có nút.
 *
 * `blockedReason` khác `null` nghĩa là bật cũng KHÔNG được (thiếu quyền, thiếu điều kiện của xe):
 * khi đó chỉ nói lý do, không bày nút — một nút chắc chắn hỏng tệ hơn là không có nút.
 */
export function VehicleSectionDisabled({
  vehicle,
  canEdit,
  service,
  header,
  workspace = 'account',
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  service: ServiceType;
  /** Thanh đầu màn của chính màn gọi — vỏ giữ nguyên, chỉ THÂN đổi. */
  header: ReactNode;
  workspace?: 'account' | 'manage';
}) {
  const t = useTranslations('VehicleManage');
  const domainLabel = useDomainLabel();
  const toggle = useServiceToggle(vehicle, canEdit);

  const label = domainLabel('serviceType', service);
  const blocked = toggle.blockedReason(service, true);

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']} scroll={false}>
        <ScreenMessage
          icon="power-outline"
          title={t('disabledSection.title', { service: label })}
          description={
            workspace === 'manage'
              ? canEdit
                ? t('disabledSection.body', { service: label })
                : t('operationsTab.serviceOff')
              : (blocked ?? t('disabledSection.body', { service: label }))
          }
          actionLabel={blocked ? undefined : t('disabledSection.enable', { service: label })}
          onAction={blocked ? undefined : () => toggle.toggle(service, true)}
        />
      </Screen>
      {toggle.dialog}
    </>
  );
}

/** Dịch vụ này đang TẮT trên xe? `null` = mục không thuộc dịch vụ nào. */
export function isServiceOff(vehicle: VehicleDetail, service: ServiceType | null): boolean {
  return service !== null && !(vehicle.serviceTypes ?? []).includes(service);
}
