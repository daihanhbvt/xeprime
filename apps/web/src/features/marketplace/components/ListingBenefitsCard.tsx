'use client';

import { CheckOutlined, RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import styles from './ListingBenefitsCard.module.css';

/**
 * Thẻ "Tự nhận xe" cột phải theo chuẩn Figma v2 (node 19707:83510):
 * - Viền vàng ấm, bo góc 16px
 * - 3 cam kết tự nhận xe kèm icon check xanh mint
 * - Link "Cách thức hoạt động >"
 */
export function ListingBenefitsCard() {
  return (
    <div className={styles.card}>
      <h3 className={styles.title}>Tự nhận xe</h3>
      <ul className={styles.list}>
        <li className={styles.item}>
          <span className={styles.checkIconWrap}>
            <CheckOutlined className={styles.checkIcon} />
          </span>
          <span>Tối ưu chi phí khi thuê gói theo giờ</span>
        </li>
        <li className={styles.item}>
          <span className={styles.checkIconWrap}>
            <CheckOutlined className={styles.checkIcon} />
          </span>
          <span>Nhận và trả xe chủ động qua ứng dụng Xe Prime</span>
        </li>
        <li className={styles.item}>
          <span className={styles.checkIconWrap}>
            <CheckOutlined className={styles.checkIcon} />
          </span>
          <span>Đặt xe nhanh, không cần chờ chủ xe duyệt đơn</span>
        </li>
      </ul>
      <Link href={ROUTES.ABOUT} className={styles.link}>
        <span>Cách thức hoạt động</span>
        <RightOutlined className={styles.arrowIcon} />
      </Link>
    </div>
  );
}
