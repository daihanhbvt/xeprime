'use client';

import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import styles from './ServiceTypeChip.module.css';

/**
 * Viên loại dịch vụ trên dải đầu thẻ đơn/yêu cầu (Figma Partner-XePrime): "Tự lái" xanh dương,
 * "Có tài xế" hồng, "Thuê xe dài hạn" tím (người dùng chốt 20/11/2026, cùng app). Nhãn đọc từ namespace `Domain` (mã là dữ
 * liệu — ADR 0012).
 */
export function ServiceTypeChip({ value }: { value: string }) {
  const domainLabel = useDomainLabel();
  return (
    <span className={cx(styles.chip, toneOf(value))}>
      {domainLabel('serviceType', value as ServiceType)}
    </span>
  );
}

function toneOf(value: string): string | undefined {
  switch (value) {
    case SERVICE_TYPE.SELF_DRIVE:
      return styles.selfDrive;
    case SERVICE_TYPE.WITH_DRIVER:
      return styles.withDriver;
    case SERVICE_TYPE.LONG_TERM:
      return styles.longTerm;
    default:
      return undefined;
  }
}
