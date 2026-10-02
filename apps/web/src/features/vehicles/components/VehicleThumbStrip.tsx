'use client';

import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { decorativeIcon } from '@/lib/decorative-icon';

import { useImageSlotLabel } from '../hooks/use-image-slot-label';
import { vehicleGalleryItems } from '../media';
import type { VehicleDetail } from '../types';
import styles from './VehicleThumbStrip.module.css';

/** Số ảnh nhỏ thấy cùng lúc — phần còn lại lướt bằng hai mũi tên. */
const THUMB_WINDOW = 4;

/**
 * DẢI ẢNH theo vị trí dưới ảnh đại diện ở thẻ đầu màn sửa xe (30/09/2026). Thứ tự và nhãn lấy
 * từ `vehicleGalleryItems` — cùng nguồn với thư viện ảnh của Hồ sơ 360, nên hai nơi bày ảnh như
 * nhau.
 *
 * Mỗi ảnh mang nhãn vị trí ngay trên ảnh (Mặt trước, Bên trái…), bấm để phóng to; hai mũi tên ở
 * hai đầu dải chỉ có khi nhiều ảnh hơn chỗ, mỗi lần lướt một ảnh. Ảnh đại diện không nằm trong
 * dải — nó là ảnh lớn phía trên. Chỉ đọc.
 */
export function VehicleThumbStrip({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.edit.aside');
  const imageSlotLabel = useImageSlotLabel();
  const thumbs = vehicleGalleryItems(vehicle, imageSlotLabel).filter(
    (item) => item.url !== vehicle.mainImageUrl,
  );
  const [windowStart, setWindowStart] = useState(0);

  if (thumbs.length === 0) return null;
  const maxStart = Math.max(thumbs.length - THUMB_WINDOW, 0);
  const from = Math.min(windowStart, maxStart);
  const visible = thumbs.slice(from, from + THUMB_WINDOW);
  const sliding = thumbs.length > THUMB_WINDOW;
  const scroll = (delta: number) =>
    setWindowStart((value) => Math.min(Math.max(Math.min(value, maxStart) + delta, 0), maxStart));

  return (
    <div className={styles.row}>
      {sliding ? (
        <Tooltip title={t('prevImage')}>
          <button
            type="button"
            className={styles.nav}
            aria-label={t('prevImage')}
            disabled={from === 0}
            onClick={() => scroll(-1)}
          >
            {decorativeIcon(<LeftOutlined />)}
          </button>
        </Tooltip>
      ) : null}
      <PreviewImageGroup>
        <ul className={styles.thumbs}>
          {visible.map((item) => (
            <li key={item.url} className={styles.thumb}>
              <PreviewImage src={item.url} alt={item.label ?? ''} className={styles.img} />
              {item.label ? <span className={styles.label}>{item.label}</span> : null}
            </li>
          ))}
        </ul>
      </PreviewImageGroup>
      {sliding ? (
        <Tooltip title={t('nextImage')}>
          <button
            type="button"
            className={styles.nav}
            aria-label={t('nextImage')}
            disabled={from === maxStart}
            onClick={() => scroll(1)}
          >
            {decorativeIcon(<RightOutlined />)}
          </button>
        </Tooltip>
      ) : null}
    </div>
  );
}
