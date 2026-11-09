'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { StatusRailTone } from '@/components/navigation/StatusRail';
import { RENTAL_STAGE, type RentalStage } from '@/constants/rental-stages';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './RentalStageHeading.module.css';

/** Sắc của từng nhóm — chấm ở cột trái, dải tiêu đề nhóm/cột (design: đỏ · cam · xanh dương · xanh lá). */
export const STAGE_TONE: Readonly<Record<RentalStage, StatusRailTone>> = {
  [RENTAL_STAGE.NEEDS_ACTION]: 'danger',
  [RENTAL_STAGE.AWAITING_PAYMENT]: 'warning',
  [RENTAL_STAGE.AWAITING_PICKUP]: 'info',
  [RENTAL_STAGE.RENTING]: 'success',
};

/**
 * Dải tiêu đề một nhóm (design "Kanban Assets"): vạch màu trái · tên · số đếm; phải là `extra`
 * ("Xem tất cả" ở dạng List). Đầu nhóm ở dạng List, đầu cột ở dạng Kanban.
 */
export function RentalStageHeading({
  stage,
  count,
  extra,
  id,
}: {
  stage: RentalStage;
  count: number | undefined;
  extra?: ReactNode;
  /** Cột Kanban gắn `aria-labelledby` vào tên nhóm. */
  id?: string;
}) {
  const tBoard = useTranslations('Bookings.board');
  const fmt = useAppFormat();
  return (
    <div className={cx(styles.groupHead, styles[STAGE_TONE[stage]])}>
      <h2 className={styles.groupTitle} id={id}>
        {tBoard(`stage.${stage}`)}
        {count === undefined ? null : <span className={styles.groupCount}>{fmt.count(count)}</span>}
      </h2>
      {extra}
    </div>
  );
}
