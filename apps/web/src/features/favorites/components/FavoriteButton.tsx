'use client';

import { HeartFilled, HeartOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
import { cx } from '@/lib/cx';
import { useFavoriteToggle } from '../hooks/use-favorite';

/**
 * Nút trái tim của một xe — thẻ kết quả tìm kiếm và trang chi tiết. Hình dáng do nơi gọi quyết
 * (`className`/`activeClassName`), hành vi ở `useFavoriteToggle`.
 *
 * Là `<button>` thật với `aria-pressed` (trước đây là `<span aria-hidden>` — bàn phím và trình đọc
 * màn hình không tới được). Nằm TRÊN liên kết phủ cả thẻ, nên chặn cả `preventDefault` lẫn
 * `stopPropagation`: bấm tim không được mở trang chi tiết. Không khoá nút khi đang lưu — bấm dồn
 * dập là hợp lệ và hội tụ về lượt cuối.
 */
export function FavoriteButton({
  vehicleId,
  vehicleName,
  className,
  activeClassName,
}: {
  vehicleId: string;
  vehicleName: string;
  className?: string;
  activeClassName?: string;
}) {
  const t = useTranslations('Favorites.button');
  const { isFavorite, toggle } = useFavoriteToggle(vehicleId);
  const label = isFavorite ? t('remove', { name: vehicleName }) : t('save', { name: vehicleName });

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    toggle();
  }

  return (
    <button
      type="button"
      className={cx(className, isFavorite && activeClassName)}
      aria-pressed={isFavorite}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {isFavorite ? <HeartFilled aria-hidden /> : <HeartOutlined aria-hidden />}
    </button>
  );
}
