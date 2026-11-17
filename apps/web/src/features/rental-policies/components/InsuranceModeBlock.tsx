'use client';

import { Alert, Radio } from 'antd';
import { useTranslations } from 'next-intl';
import { useController, type Control } from 'react-hook-form';
import {
  INSURANCE_MODE,
  INSURANCE_MODE_DEFAULT,
  INSURANCE_MODE_VALUES,
  type InsuranceMode,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';

import type { PolicyFormValues } from '../schema';
import type { ShopInsuranceImpact } from '../types';
import { PolicyInfoTip } from './PolicyInfoTip';
import styles from './ShopPolicies.module.css';

/** Số tên xe hiện trong cảnh báo — phần còn lại gộp thành "và N xe khác". */
const IMPACT_NAMES_SHOWN = 5;

/**
 * Bảo hiểm vật chất xe MIC: Bắt buộc hay Tuỳ chọn (ADR 0091 điều 1) — một khối cho chính sách mặc
 * định của gian hàng (theo loại xe) và chính sách riêng của một xe.
 *
 * Nơi gọi chỉ dựng khối này khi nền tảng ĐANG bán bảo hiểm theo bậc và đó là ô tô: chế độ không có
 * hiệu lực ở chỗ khác, nên một ô chọn ở đó là hứa một thứ không xảy ra.
 *
 * `impact` (chỉ trang gian hàng) liệt kê xe kế thừa mà thiếu dữ liệu — hiện khi đang chọn Bắt buộc,
 * để chủ xe thấy trước xe nào sẽ ngừng nhận đặt tự lái. Server vẫn là nơi chặn thật.
 */
export function InsuranceModeBlock<T extends PolicyFormValues>({
  control,
  disabled,
  impact,
}: {
  control: Control<T>;
  disabled: boolean;
  impact?: ShopInsuranceImpact | null;
}) {
  const t = useTranslations('Shop.policies.workspace.insurance');
  const domainLabel = useDomainLabel();
  const { field } = useController({
    control: control as unknown as Control<PolicyFormValues>,
    name: 'insuranceMode',
  });
  const mode = (field.value ?? INSURANCE_MODE_DEFAULT) as InsuranceMode;
  const affected = mode === INSURANCE_MODE.REQUIRED && impact ? impact.total : 0;
  const names = impact?.vehicles.slice(0, IMPACT_NAMES_SHOWN).map((v) => v.name) ?? [];

  return (
    <div className={styles.subCard}>
      <h3 className={styles.subTitle}>
        {t('title')}
        <PolicyInfoTip label={t('tipLabel')}>{t('hint')}</PolicyInfoTip>
      </h3>

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
    </div>
  );
}
