'use client';

import { Tag } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_ALERT_PRIMARY_LIMIT,
  VEHICLE_ALERT_SEVERITY,
  VEHICLE_ALERT_SEVERITY_COLOR,
  type VehicleAlertSeverity,
} from '@xeprime/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { VehicleAlertItem } from '../types';
import styles from './VehicleAlerts.module.css';

/**
 * Hiển thị "việc cần làm" của một xe — dùng chung cho thẻ xe (`chips`) và Hồ sơ 360 (`list`).
 *
 * Nội dung do SERVER tính (`VehicleAlertsService`) và đã sắp theo bảng ưu tiên duy nhất ở
 * `@xeprime/types`; component này không tự suy ra cảnh báo nào và không sắp xếp lại.
 *
 * Màu không bao giờ là kênh thông tin duy nhất: mỗi mục đều có NHÃN CHỮ, và mức nghiêm trọng
 * còn được nói ra trong tên khả truy cập. Vàng là màu thương hiệu/hành động của XePrime nên
 * `warning` dùng cam — xem `VEHICLE_ALERT_SEVERITY_COLOR`.
 *
 * `title`/`detail` của cảnh báo là CÂU do backend dựng (tiếng Việt) — chúng đi qua đây nguyên
 * văn. Nhãn ngắn và mức nghiêm trọng thì dịch được, vì đó là từ vựng đóng nằm ở `Domain`.
 */
export function VehicleAlertChips({ alerts }: { alerts: VehicleAlertItem[] }) {
  const t = useTranslations('Vehicles.alerts');
  const domainLabel = useDomainLabel();

  if (alerts.length === 0) return null;

  return (
    <ul className={styles.chips} aria-label={t('chipsLabel')}>
      {alerts.map((alert) => {
        const severity = alert.severity as VehicleAlertSeverity;
        return (
          <li key={alert.kind}>
            <Tag
              color={VEHICLE_ALERT_SEVERITY_COLOR[severity]}
              className={styles.chip}
              // Nhãn ngắn cho mắt, nhãn đầy đủ cho trình đọc màn hình.
              aria-label={t('severityWithTitle', {
                severity: domainLabel('vehicleAlertSeverity', severity),
                title: alert.title,
              })}
            >
              {domainLabel('vehicleAlertShort', alert.kind, alert.title)}
              {alert.count && alert.count > 1 ? ` (${alert.count})` : ''}
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Danh sách việc cần làm ở Hồ sơ 360: tối đa 3 việc quan trọng nhất, phần còn lại nằm sau
 * `Xem tất cả` (§3 Wave 8). Ba việc đó luôn là ba việc ưu tiên cao nhất vì server đã sắp sẵn.
 */
export function VehicleAlertList({ alerts }: { alerts: VehicleAlertItem[] }) {
  const t = useTranslations('Vehicles.alerts');
  const domainLabel = useDomainLabel();
  const [expanded, setExpanded] = useState(false);

  if (alerts.length === 0) {
    return <p className={styles.empty}>{t('empty')}</p>;
  }

  const visible = expanded ? alerts : alerts.slice(0, VEHICLE_ALERT_PRIMARY_LIMIT);
  const hidden = alerts.length - visible.length;

  return (
    <>
      <ul className={styles.list}>
        {visible.map((alert) => {
          const severity = alert.severity as VehicleAlertSeverity;
          return (
            <li key={alert.kind} className={styles.item}>
              <span
                className={`${styles.dot} ${dotClass(severity)}`}
                aria-hidden="true"
              />
              <span className={styles.itemBody}>
                <span className={styles.itemTitle}>
                  {alert.href ? (
                    <Link href={alert.href} className={styles.itemLink}>
                      {alert.title}
                    </Link>
                  ) : (
                    alert.title
                  )}
                  {alert.count && alert.count > 1 ? (
                    <span className={styles.count}> ({alert.count})</span>
                  ) : null}
                </span>
                {/* Mức nghiêm trọng nói bằng CHỮ, không chỉ bằng màu chấm. */}
                <span className={styles.severity}>
                  {domainLabel('vehicleAlertSeverity', severity)}
                </span>
                {alert.detail ? <span className={styles.detail}>{alert.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button type="button" className={styles.moreButton} onClick={() => setExpanded(true)}>
          {t('viewAll', { count: alerts.length })}
        </button>
      ) : null}
    </>
  );
}

function dotClass(severity: VehicleAlertSeverity): string {
  if (severity === VEHICLE_ALERT_SEVERITY.CRITICAL) return styles.dotCritical ?? '';
  if (severity === VEHICLE_ALERT_SEVERITY.WARNING) return styles.dotWarning ?? '';
  return styles.dotInfo ?? '';
}
