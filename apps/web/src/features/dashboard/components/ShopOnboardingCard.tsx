'use client';

import { CarOutlined, CheckCircleFilled, ClockCircleOutlined, SendOutlined, SolutionOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { isShopProfileSubmittable, PERMISSION } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { cx } from '@/lib/cx';
import styles from './ShopOnboardingCard.module.css';

type StepKey = 'profile' | 'vehicle' | 'review';
type StepState = 'todo' | 'waiting' | 'done';

/**
 * Ba bước từ "vừa mở gian hàng" tới "bán được xe", đặt ở đầu dashboard.
 *
 * Gian hàng mới tạo rơi vào một dashboard mà mọi ô đều là `0`/`—`: không có xe, không có đơn,
 * không có doanh thu. Bảng số đó đúng nhưng vô dụng — nó không nói được việc gì tiếp theo, và
 * việc tiếp theo thì có thật và rất cụ thể. Thẻ này nói ra ba việc đó, kèm nút đi thẳng tới nơi
 * làm được chúng, rồi tự biến mất khi chiếc xe đầu tiên đã lên chợ.
 *
 * Trạng thái từng bước đọc từ dữ liệu THẬT, không phải một cờ "đã xem hướng dẫn": hồ sơ đủ chưa
 * chấm bằng đúng quy tắc backend dùng để chặn gửi duyệt (`isShopProfileSubmittable`), nên bước 1
 * không bao giờ xanh trong khi nút Gửi duyệt vẫn bị từ chối.
 *
 * ## Bước 2 đổi nghĩa (ADR 0036)
 *
 * Bước giữa trước đây là *"gửi hồ sơ gian hàng cho XePrime duyệt"*, với câu *"xe chỉ hiển thị
 * công khai sau khi hồ sơ gian hàng được duyệt"*. Cả hai nay đều sai: vòng duyệt duy nhất là
 * duyệt XE. Giữ nguyên thì thẻ này gửi người dùng đi chờ một cái gật đầu không còn tồn tại, và
 * đó chính là bế tắc mà ADR 0036 gỡ.
 *
 * Nên thứ tự giờ là: hồ sơ → thêm xe → **chờ duyệt xe**, và mốc biến mất của thẻ là
 * `publicVehicleCount > 0` — đúng mốc mà `resolveOwnerStage` dùng để mở bộ menu chủ xe.
 */
export function ShopOnboardingCard({ vehicleCount }: { vehicleCount: number | undefined }) {
  const t = useTranslations('Dashboard.onboarding');
  const { tenant } = useTenantScope();
  const { has } = usePermissions();
  const canViewShop = has(PERMISSION.TENANT_VIEW);

  const hasVehicle = (vehicleCount ?? 0) > 0;
  const liveVehicle = (tenant?.publicVehicleCount ?? 0) > 0;

  // Chỉ hỏi hồ sơ khi thẻ còn hiện và người xem có quyền — nhân viên không có `tenant.view`
  // vẫn thấy được ba bước, chỉ là không chấm được bước hồ sơ.
  const needsCard = Boolean(tenant) && !liveVehicle;
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
    { key: 'profile', state: profileDone ? 'done' : 'todo', href: ROUTES.MANAGE.SHOP },
    { key: 'vehicle', state: hasVehicle ? 'done' : 'todo', href: ROUTES.MANAGE.VEHICLE_NEW },
    {
      /*
       * Không có nút ở bước này, và đó là điểm chính: nút gửi duyệt nằm trên chính chiếc xe
       * (`VehiclePublicReviewPanel`), nơi có checklist nói xe còn thiếu gì. Một nút "gửi duyệt"
       * ở đây sẽ phải hỏi lại "xe nào" — hoặc tệ hơn, gửi bừa một chiếc chưa đủ điều kiện.
       */
      key: 'review',
      state: liveVehicle ? 'done' : hasVehicle ? 'waiting' : 'todo',
      href: hasVehicle ? ROUTES.MANAGE.VEHICLES : null,
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
  vehicle: <CarOutlined />,
  review: <SendOutlined />,
};
