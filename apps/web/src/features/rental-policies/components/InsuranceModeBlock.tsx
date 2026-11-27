'use client';

import { Alert, Radio } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useController, type Control } from 'react-hook-form';
import {
  INSURANCE_ELIGIBILITY_GAP,
  INSURANCE_MODE,
  INSURANCE_MODE_DEFAULT,
  INSURANCE_MODE_VALUES,
  type InsuranceMode,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { VEHICLE_EDIT_TAB, vehicleTabPath, type VehicleEditTab } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';

import type { PolicyFormValues } from '../schema';
import type { ShopInsuranceImpact } from '../types';
import { PolicyInfoTip } from './PolicyInfoTip';
import styles from './ShopPolicies.module.css';

/** Số tên xe hiện trong cảnh báo — phần còn lại gộp thành "và N xe khác". */
const IMPACT_NAMES_SHOWN = 5;

/** Mục của màn sửa xe nơi chủ xe bổ sung từng thứ còn thiếu (`insuranceEligibilityGaps`). */
const GAP_TAB: Partial<Record<string, VehicleEditTab>> = {
  [INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING]: VEHICLE_EDIT_TAB.INFORMATION,
  [INSURANCE_ELIGIBILITY_GAP.VEHICLE_INFO_MISSING]: VEHICLE_EDIT_TAB.INFORMATION,
  [INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING]: VEHICLE_EDIT_TAB.MEDIA,
  [INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING]: VEHICLE_EDIT_TAB.DOCUMENTS,
};

/** Điều kiện bảo hiểm của MỘT xe (chính sách riêng của xe) — `gaps` rỗng = xe đủ điều kiện. */
export interface VehicleInsuranceReadiness {
  vehicleId: string;
  gaps: readonly string[];
}

/**
 * Bảo hiểm vật chất xe MIC: Bắt buộc hay Tuỳ chọn (ADR 0091 điều 1) — một khối cho chính sách mặc
 * định của gian hàng (theo loại xe) và chính sách riêng của một xe.
 *
 * Nơi gọi chỉ dựng khối này khi nền tảng ĐANG bán bảo hiểm theo bậc và đó là ô tô: chế độ không có
 * hiệu lực ở chỗ khác, nên một ô chọn ở đó là hứa một thứ không xảy ra.
 *
 * Đang chọn Bắt buộc mà xe thiếu dữ liệu thì nói TRƯỚC khi lưu — server vẫn là nơi chặn thật:
 *  - `impact` (trang gian hàng): các xe kế thừa sẽ ngừng nhận đặt tự lái;
 *  - `vehicle` (chính sách riêng của xe): xe này thiếu đúng những gì, mỗi mục dẫn tới chỗ bổ sung.
 *    Hiện cả khi xe đang theo chính sách gian hàng (ô khoá) — đó chính là lý do xe đang bị ẩn khỏi
 *    tìm xe tự lái.
 */
export function InsuranceModeBlock<T extends PolicyFormValues>({
  control,
  disabled,
  impact,
  vehicle,
  bare = false,
}: {
  control: Control<T>;
  disabled: boolean;
  /** Không khung + tiêu đề riêng - nơi gọi đã đặt khối trong thẻ "Bảo hiểm vật chất xe" của nó. */
  bare?: boolean;
  impact?: ShopInsuranceImpact | null;
  vehicle?: VehicleInsuranceReadiness | null;
}) {
  const t = useTranslations('Shop.policies.workspace.insurance');
  const domainLabel = useDomainLabel();
  const available = useAvailableHref();
  const { field } = useController({
    control: control as unknown as Control<PolicyFormValues>,
    name: 'insuranceMode',
  });
  const mode = (field.value ?? INSURANCE_MODE_DEFAULT) as InsuranceMode;
  const required = mode === INSURANCE_MODE.REQUIRED;
  const affected = required && impact ? impact.total : 0;
  const names = impact?.vehicles.slice(0, IMPACT_NAMES_SHOWN).map((v) => v.name) ?? [];
  const vehicleGaps = required && vehicle ? vehicle.gaps : [];

  return (
    <div className={bare ? styles.bareBlock : styles.subCard}>
      {bare ? null : (
        <h3 className={styles.subTitle}>
          {t('title')}
          <PolicyInfoTip label={t('tipLabel')}>{t('hint')}</PolicyInfoTip>
        </h3>
      )}

      <Radio.Group
        value={mode}
        disabled={disabled}
        onChange={(event) => field.onChange(event.target.value as InsuranceMode)}
        className={styles.modeCards}
        aria-label={t('title')}
      >
        {INSURANCE_MODE_VALUES.map((value) => (
          <Radio
            key={value}
            value={value}
            className={cx(styles.modeCard, value === mode && styles.modeCardChecked)}
          >
            <span className={styles.modeLabel}>{domainLabel('insuranceMode', value)}</span>
            <span className={styles.modeDescription}>
              {value === INSURANCE_MODE.REQUIRED ? t('modeRequired') : t('modeOptional')}
            </span>
          </Radio>
        ))}
      </Radio.Group>

      {affected > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('impactTitle', { count: affected })}
          description={
            affected > names.length
              ? t('impactNamesMore', {
                  names: names.join(LIST_SEPARATOR),
                  count: affected - names.length,
                })
              : names.join(LIST_SEPARATOR)
          }
        />
      ) : null}

      {vehicle && vehicleGaps.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={t('vehicleBlockedTitle')}
          description={
            <ul className={styles.gapList}>
              {vehicleGaps.map((gap) => {
                const tab = GAP_TAB[gap];
                const href = tab ? available(vehicleTabPath(vehicle.vehicleId, tab)) : null;
                const label = domainLabel('insuranceEligibilityGap', gap);
                return <li key={gap}>{href ? <Link href={href}>{label}</Link> : label}</li>;
              })}
            </ul>
          }
        />
      ) : null}
    </div>
  );
}
