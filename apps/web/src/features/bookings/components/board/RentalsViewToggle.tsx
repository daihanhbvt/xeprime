'use client';

import { AppstoreOutlined, HolderOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { RENTAL_VIEW, type RentalView } from '@/constants/rental-stages';
import styles from './RentalsViewToggle.module.css';

/**
 * Đuôi thanh lọc của màn "Đơn thuê xe" (Figma `23895:15181`): dòng "⋮⋮ Chỉ kéo được sang bước tiếp
 * theo" (chỉ ở Kanban, chỉ khi có thẻ nào kéo được) + hai nút chuyển Kanban / List.
 */
export function RentalsViewToggle({
  view,
  onChange,
  showDragHint,
}: {
  view: RentalView;
  onChange: (view: RentalView) => void;
  showDragHint: boolean;
}) {
  const t = useTranslations('Bookings.board');
  const options = [
    {
      value: RENTAL_VIEW.BOARD,
      label: t('view.board'),
      icon: <AppstoreOutlined aria-hidden="true" />,
    },
    {
      value: RENTAL_VIEW.LIST,
      label: t('view.list'),
      icon: <UnorderedListOutlined aria-hidden="true" />,
    },
  ] as const;

  return (
    <div className={styles.root}>
      {showDragHint && view === RENTAL_VIEW.BOARD ? (
        <span className={styles.hint}>
          <HolderOutlined aria-hidden="true" />
          {t('kanban.dragHint')}
        </span>
      ) : null}
      <div className={styles.group} role="group" aria-label={t('view.label')}>
        {options.map((option) => (
          <Tooltip key={option.value} title={option.label}>
            <button
              type="button"
              className={view === option.value ? styles.buttonActive : styles.button}
              aria-pressed={view === option.value}
              aria-label={option.label}
              onClick={() => onChange(option.value)}
            >
              {option.icon}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
