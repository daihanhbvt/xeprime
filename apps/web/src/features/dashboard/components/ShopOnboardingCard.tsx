'use client';

import { CarOutlined, CheckCircleFilled, ClockCircleOutlined, SendOutlined, SolutionOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  isShopProfileSubmittable,
  PERMISSION,
  TENANT_STATUS,
  type TenantStatus,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { cx } from '@/lib/cx';
import styles from './ShopOnboardingCard.module.css';

type StepKey = 'profile' | 'review' | 'vehicle';
type StepState = 'todo' | 'waiting' | 'done';

/**
 * Ba bước từ "vừa mở gian hàng" tới "bán được xe", đặt ở đầu dashboard.
 *
 * Gian hàng mới tạo rơi vào một dashboard mà mọi ô đều là `0`/`—`: không có xe, không có đơn,
 * không có doanh thu. Bảng số đó đúng nhưng vô dụng — nó không nói được việc gì tiếp theo, và
 * việc tiếp theo thì có thật và rất cụ thể. Thẻ này nói ra ba việc đó, kèm nút đi thẳng tới nơi
 * làm được chúng, rồi tự biến mất khi gian hàng đã hoạt động và có xe.
 *
 * Trạng thái từng bước đọc từ dữ liệu THẬT, không phải một cờ "đã xem hướng dẫn": hồ sơ đủ chưa
 * chấm bằng đúng quy tắc backend dùng để chặn gửi duyệt (`isShopProfileSubmittable`), nên bước 1
 * không bao giờ xanh trong khi nút Gửi duyệt vẫn bị từ chối.
 */
export function ShopOnboardingCard({ vehicleCount }: { vehicleCount: number | undefined }) {
  const t = useTranslations('Dashboard.onboarding');
  const { tenant } = useTenantScope();
  const { has } = usePermissions();
  const canViewShop = has(PERMISSION.TENANT_VIEW);

  const status = tenant?.status as TenantStatus | undefined;
  const isActive = status === TENANT_STATUS.ACTIVE;
  const hasVehicle = (vehicleCount ?? 0) > 0;

  // Chỉ hỏi hồ sơ khi thẻ còn hiện và người xem có quyền — nhân viên không có `tenant.view`
  // vẫn thấy được ba bước, chỉ là không chấm được bước hồ sơ.
  const needsCard = Boolean(tenant) && (!isActive || !hasVehicle);
  const { data: shop } = useMyShop(needsCard && canViewShop);

  if (!needsCard) return null;

  const profileDone = shop
    ? isShopProfileSubmittable({
        displayName: shop.profile.displayName,
        // Tỉnh hiệu lực nằm ở chi nhánh mặc định; hai cột trên hồ sơ chỉ là bản sao.
        provinceCode: shop.defaultBranch?.provinceCode ?? shop.profile.provinceCode,
        ownerFullName: shop.profile.ownerFullName,
        ownerPhone: shop.profile.ownerPhone,
      })
    : false;

  const steps: { key: StepKey; state: StepState; href: string | null }[] = [
    {
      key: 'profile',
      // Hồ sơ đã đi qua vòng duyệt thì không còn gì để "hoàn thiện" ở bước này nữa.
      state: profileDone || status === TENANT_STATUS.PENDING_REVIEW || isActive ? 'done' : 'todo',
      href: ROUTES.MANAGE.SHOP,
    },
    {
      key: 'review',
      state: isActive
        ? 'done'
        : status === TENANT_STATUS.PENDING_REVIEW
          ? 'waiting'
          : 'todo',
      href: ROUTES.MANAGE.SHOP,
    },
    {
      key: 'vehicle',
      state: hasVehicle ? 'done' : 'todo',
      href: ROUTES.MANAGE.VEHICLE_NEW,
    },
  ];

  return (
    <section className={styles.card} aria-labelledby="shop-onboarding-title">
      <header className={styles.head}>
        <h2 className={styles.title} id="shop-onboarding-title">
          {t('title')}
        </h2>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>

      <ol className={styles.steps}>
        {steps.map((step, index) => (
          <li key={step.key} className={cx(styles.step, step.state === 'done' && styles.stepDone)}>
            <span className={styles.marker} aria-hidden="true">
              {step.state === 'done' ? <CheckCircleFilled className={styles.markerDone} /> : index + 1}
            </span>
            <span className={styles.body}>
              <span className={styles.stepTitle}>{t(`steps.${step.key}.title`)}</span>
              <span className={styles.stepText}>{t(`steps.${step.key}.body`)}</span>
            </span>
            <span className={styles.action}>
              {step.state === 'done' ? (
                <span className={styles.doneLabel}>{t('done')}</span>
              ) : step.state === 'waiting' ? (
                <span className={styles.waitingLabel}>
                  <ClockCircleOutlined aria-hidden="true" /> {t('waiting')}
                </span>
              ) : step.href ? (
                <Link href={step.href}>
                  <Button size="small" type="primary" icon={STEP_ICON[step.key]}>
                    {t(`steps.${step.key}.action`)}
                  </Button>
                </Link>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const STEP_ICON: Record<StepKey, ReactNode> = {
  profile: <SolutionOutlined />,
  review: <SendOutlined />,
  vehicle: <CarOutlined />,
};
