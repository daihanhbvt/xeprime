'use client';

import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import { Button, Card } from 'antd';
import { useTranslations } from 'next-intl';
import {
  FEATURE_STATE,
  PLAN_FEATURE_VALUES,
  isFeatureVisible,
  type PlanFeature,
} from '@xeprime/types';
import { useFeatureStates } from '@/hooks/use-feature';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './PlanFeatureList.module.css';

/**
 * "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn
 * "Gói của tôi", và nói rõ nó chỉ thuyết phục khi danh sách viết bằng **ngôn ngữ người dùng**,
 * không phải tên module. Nhãn vì vậy lấy từ nhóm `Domain.planFeature` (dịch cả vi lẫn en), không
 * phải từ khoá cờ.
 *
 * Ba trạng thái gộp thành HAI cột, có chủ đích:
 *  - `enabled` → "đang mở";
 *  - `read_only` và `hidden` → "nâng cấp để mở thêm". `read_only` kèm ghi chú *đang chỉ xem* —
 *    người dùng phải phân biệt được "chưa bao giờ có" với "có dữ liệu nhưng hết hạn", nếu không
 *    họ tưởng sổ cũ đã mất.
 */
export function PlanFeatureList({ onUpgrade }: { onUpgrade: () => void }) {
  const t = useTranslations('Subscription');
  const domainLabel = useDomainLabel();
  const states = useFeatureStates();

  const included: PlanFeature[] = [];
  const locked: PlanFeature[] = [];
  for (const feature of PLAN_FEATURE_VALUES) {
    // Cờ vắng trong cache cũ ⇒ coi như đang mở, cùng mặc định "không khoá ai" của `useFeature`.
    const state = states[feature] ?? FEATURE_STATE.ENABLED;
    (state === FEATURE_STATE.ENABLED ? included : locked).push(feature);
  }

  return (
    <Card size="small" title={t('features.title')}>
      {included.length > 0 ? (
        <>
          <div className={styles.groupTitle}>{t('features.included')}</div>
          <ul className={styles.list}>
            {included.map((feature) => (
              <li key={feature} className={styles.item}>
                <CheckCircleFilled className={styles.iconOn} aria-hidden="true" />
                {domainLabel('planFeature', feature)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {locked.length > 0 ? (
        <>
          <div className={styles.groupTitle}>{t('features.upgrade')}</div>
          <ul className={styles.list}>
            {locked.map((feature) => (
              <li key={feature} className={styles.itemLocked}>
                <LockOutlined className={styles.iconOff} aria-hidden="true" />
                {domainLabel('planFeature', feature)}
                {/* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */}
                {isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED) ? (
                  <span className={styles.hint}>· {t('features.readOnlyHint')}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {/* Mở thẳng modal mua gói — người đọc danh sách này đang ở đúng trang đó rồi, một
              link về chính nó là một cú bấm không đi tới đâu. */}
          <Button size="small" onClick={onUpgrade}>
            {t('features.upgradeCta')}
          </Button>
        </>
      ) : (
        <div className={styles.allIncluded}>{t('features.allIncluded')}</div>
      )}
    </Card>
  );
}
