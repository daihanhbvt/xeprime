'use client';

import { CheckOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
import { SERVICE_TYPE_VALUES, isVehicleServiceTypeAllowed, type ServiceType } from '@xeprime/types';

import { useDomainLabel } from '@/i18n/use-domain-label';
import { decorativeIcon } from '@/lib/decorative-icon';

import styles from './ServiceTypeChips.module.css';

/**
 * LOẠI DỊCH VỤ dạng nhãn bấm chọn (30/09/2026) — thay ô chọn nhiều. Ba nhãn luôn nằm sẵn trên
 * màn, bấm là bật/tắt; không phải mở một danh sách thả xuống để thấy mình đang chọn gì.
 *
 * Component chỉ TRÌNH BÀY: nó nhận giá trị và báo thay đổi. Nơi gọi quyết định lưu thế nào —
 * wizard thêm xe gắn vào form, màn sửa xe gọi `useServiceToggle` (lưu ngay, cùng đường ghi với
 * công tắc trên menu). Dịch vụ không hợp loại xe (vd có tài xế với xe máy) bị khoá, kèm lý do.
 */
export function ServiceTypeChips({
  value,
  onToggle,
  vehicleType,
  disabled = false,
  blockedReason,
  ariaLabel,
}: {
  value: readonly string[];
  onToggle: (service: ServiceType, enabled: boolean) => void;
  vehicleType: string;
  disabled?: boolean;
  /** Lý do KHÔNG đổi được một nhãn (tooltip) — `null` = đổi được. */
  blockedReason?: (service: ServiceType, enabled: boolean) => string | null;
  ariaLabel: string;
}) {
  const domainLabel = useDomainLabel();

  return (
    <div className={styles.chips} role="group" aria-label={ariaLabel}>
      {SERVICE_TYPE_VALUES.map((service) => {
        const checked = value.includes(service);
        const allowed = isVehicleServiceTypeAllowed(vehicleType, service);
        const reason = blockedReason?.(service, !checked) ?? null;
        const locked = disabled || (!checked && !allowed) || Boolean(reason);
        const chip = (
          <Tag.CheckableTag
            key={service}
            checked={checked}
            className={locked ? styles.locked : styles.chip}
            aria-disabled={locked || undefined}
            onChange={(next) => {
              if (!locked) onToggle(service, next);
            }}
          >
            {checked ? decorativeIcon(<CheckOutlined className={styles.check} />) : null}
            {domainLabel('serviceType', service)}
          </Tag.CheckableTag>
        );
        return reason ? (
          <Tooltip key={service} title={reason}>
            <span>{chip}</span>
          </Tooltip>
        ) : (
          chip
        );
      })}
    </div>
  );
}
