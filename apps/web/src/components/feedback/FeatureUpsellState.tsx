'use client';

import { LockOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PlanFeature } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './PermissionState.module.css';

/**
 * Màn cho tính năng ở trạng thái `hidden` (ADR 0027 điều 3) — người dùng gõ thẳng URL của một
 * trang mà gian hàng chưa mua.
 *
 * ⚠️ KHÁC `PermissionState kind="forbidden"`, và khác ở đúng chỗ quan trọng: người dùng **không
 * thiếu quyền**. Vai của họ đủ; GIAN HÀNG của họ thiếu tính năng. Nên câu chữ không được nói
 * "bạn không có quyền", và lối đi tiếp là **xem gói** chứ không phải "liên hệ quản trị viên" —
 * chỉ họ mới quyết định được việc nâng cấp.
 *
 * Dùng chung CSS với `PermissionState`: cùng một hình dạng trạng thái toàn màn, khác nội dung.
 */
export function FeatureUpsellState({ feature }: { feature: PlanFeature }) {
  const t = useTranslations('ManageCommon');
  const domainLabel = useDomainLabel();

  return (
    <div className={styles.root} role="status">
      <span className={styles.icon} aria-hidden="true">
        <LockOutlined />
      </span>
      <p className={styles.title}>
        {t('feature.upsellTitle', { feature: domainLabel('planFeature', feature) })}
      </p>
      <p className={styles.description}>{t('feature.upsellBody')}</p>
      <div className={styles.actions}>
        <Link href={ROUTES.MANAGE.SUBSCRIPTION}>
          <Button type="primary">{t('feature.viewPlansCta')}</Button>
        </Link>
      </div>
    </div>
  );
}
