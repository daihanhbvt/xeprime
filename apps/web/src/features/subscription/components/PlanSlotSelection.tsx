'use client';

import { Alert, Checkbox } from 'antd';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { PLAN_VEHICLE_SCOPE, planVehicleScopeOf } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import type { PlanSlotOverflow } from '../types';
import styles from './PlanSlotSelection.module.css';

/** Lựa chọn của người mua cho các nhóm vượt suất (ADR 0085 điều 5). */
export interface PlanSlotChoice {
  /** Xe giữ lại trên chợ — mỗi nhóm tối đa đúng số suất của nó. */
  keepVehicleIds: string[];
  /** Đã xác nhận các xe không giữ sẽ tạm ẩn khi gói kích hoạt. */
  accepted: boolean;
}

export const EMPTY_PLAN_SLOT_CHOICE: PlanSlotChoice = { keepVehicleIds: [], accepted: false };

/** Bước xác nhận được đi tiếp chưa: không vượt suất, hoặc đã xác nhận ẩn phần còn lại. */
export function planSlotChoiceReady(
  groups: readonly PlanSlotOverflow[] | undefined,
  choice: PlanSlotChoice,
): boolean {
  return !groups || groups.length === 0 || choice.accepted;
}

/**
 * Phần thân gửi kèm lượt mua: chỉ có khi có nhóm vượt suất (server bỏ qua cả hai trường khi không
 * vượt). Danh sách giữ lại lọc về đúng các xe của nhóm đang vượt — lựa chọn cũ của một bản xem trước
 * khác không lọt lên dây.
 */
export function planSlotSelectionBody(
  groups: readonly PlanSlotOverflow[] | undefined,
  choice: PlanSlotChoice,
): { keepVehicleIds?: string[]; acceptVehicleHiding?: boolean } {
  if (!groups || groups.length === 0) return {};
  const allowed = new Set(groups.flatMap((group) => group.vehicles.map((vehicle) => vehicle.id)));
  return {
    keepVehicleIds: choice.keepVehicleIds.filter((id) => allowed.has(id)),
    acceptVehicleHiding: choice.accepted,
  };
}

/**
 * "Số xe trên chợ vượt suất của gói" — bước xác nhận của MỌI lối mua gói (hộp mua của gian hàng, hộp
 * gia hạn một làn, luồng nâng cấp của chủ xe cá nhân) khi bản xem trước báo nhóm vượt suất (ADR 0085
 * điều 5).
 *
 * Hệ thống KHÔNG chọn thay: không có xe nào được tích sẵn, người mua tự chọn tối đa đúng số suất của
 * từng nhóm (ít hơn cũng được), và phải tích ô xác nhận thì nút tạo hoá đơn mới mở. Nhóm trần 0 (loại
 * xe không có trong gói) không có ô chọn — chỉ liệt kê xe sẽ tạm ẩn và mời quay lại mua thêm gói.
 */
export function PlanSlotSelection({
  groups,
  value,
  onChange,
}: {
  groups: readonly PlanSlotOverflow[];
  value: PlanSlotChoice;
  onChange: (next: PlanSlotChoice) => void;
}) {
  const t = useTranslations('Subscription.slots');
  const tLanes = useTranslations('Subscription.lanes.title');
  const titleId = useId();
  if (groups.length === 0) return null;

  const kept = new Set(value.keepVehicleIds);
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(kept);
    if (checked) next.add(id);
    else next.delete(id);
    onChange({ ...value, keepVehicleIds: [...next] });
  };

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <Alert
        type="warning"
        showIcon
        title={<span id={titleId}>{t('title')}</span>}
        description={t('hint')}
      />

      {groups.map((group) => {
        const scope = planVehicleScopeOf(group.countedScope);
        const vehicleIds = group.vehicles.map((vehicle) => vehicle.id);
        const selected = vehicleIds.filter((id) => kept.has(id)).length;
        const full = selected >= group.limit;
        const hiddenBeyondList = Math.max(0, group.occupyingCount - group.vehicles.length);
        return (
          <div key={scope} className={styles.group}>
            {group.limit === 0 ? (
              <>
                <p className={styles.groupTitle}>
                  {t('noPlan', { vehicles: t(`vehicles.${scope}`), count: group.occupyingCount })}
                </p>
                <ul className={styles.hiddenList}>
                  {group.vehicles.map((vehicle) => (
                    <li key={vehicle.id}>{vehicleLabel(vehicle)}</li>
                  ))}
                </ul>
                {scope !== PLAN_VEHICLE_SCOPE.ALL ? (
                  <p className={styles.note}>{t('noPlanHint')}</p>
                ) : null}
              </>
            ) : (
              <>
                <div className={styles.groupHead}>
                  <p className={styles.groupTitle}>
                    {t('overLimit', {
                      scope: tLanes(scope),
                      limit: group.limit,
                      count: group.occupyingCount,
                    })}
                  </p>
                  <span className={styles.counter} aria-live="polite">
                    {t('selected', { selected, limit: group.limit })}
                  </span>
                </div>
                <ul className={styles.pickList} aria-label={t('listLabel')}>
                  {group.vehicles.map((vehicle) => {
                    const checked = kept.has(vehicle.id);
                    return (
                      <li key={vehicle.id}>
                        <Checkbox
                          checked={checked}
                          // Đủ suất thì xe chưa chọn khoá lại — bỏ chọn một xe khác để đổi.
                          disabled={!checked && full}
                          onChange={(event) => toggle(vehicle.id, event.target.checked)}
                        >
                          {vehicleLabel(vehicle)}
                        </Checkbox>
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.note}>{t('pickBigger')}</p>
              </>
            )}
            {hiddenBeyondList > 0 ? (
              <p className={styles.note}>{t('more', { count: hiddenBeyondList })}</p>
            ) : null}
          </div>
        );
      })}

      <Checkbox
        className={styles.accept}
        checked={value.accepted}
        onChange={(event) => onChange({ ...value, accepted: event.target.checked })}
      >
        {t('accept')}
      </Checkbox>
    </section>
  );
}

/** "Tên · biển số" — biển số là thứ người bán nhận ra chiếc xe nhanh nhất. */
function vehicleLabel(vehicle: PlanSlotOverflow['vehicles'][number]): string {
  return vehicle.plateNumber ? `${vehicle.name}${LIST_SEPARATOR}${vehicle.plateNumber}` : vehicle.name;
}
