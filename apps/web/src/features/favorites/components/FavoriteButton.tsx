'use client';

import { HeartFilled, HeartOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cx } from '@/lib/cx';
import { useFavoriteToggle } from '../hooks/use-favorite';
import styles from './FavoriteButton.module.css';

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

  // Hiệu ứng "pop" + vòng lan toả chỉ khi CHÍNH người dùng vừa bấm và tim thật sự chuyển sang
  // đã lưu (chưa đăng nhập thì toggle mở hộp đăng nhập, tim không đổi ⇒ không nổ). Tim đỏ sẵn lúc
  // tải trang không nổ. `burst` đổi `key` để chạy lại animation mỗi lần.
  const armedRef = useRef(false);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (isFavorite && armedRef.current) setBurst((n) => n + 1);
    armedRef.current = false;
  }, [isFavorite]);

  function onClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    armedRef.current = !isFavorite;
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
      <span key={burst} className={cx(styles.icon, burst > 0 && isFavorite && styles.pop)}>
        {isFavorite ? <HeartFilled aria-hidden /> : <HeartOutlined aria-hidden />}
        {burst > 0 && isFavorite ? <span className={styles.ring} aria-hidden="true" /> : null}
      </span>
    </button>
  );
}
