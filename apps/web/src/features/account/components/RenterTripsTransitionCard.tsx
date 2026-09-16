'use client';

import { ArrowRightOutlined, CarOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CUSTOMER_TRIP_FILTER, TRIP_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import { useTrips } from '@/features/trips/hooks';

import styles from './RenterTripsTransitionCard.module.css';

/**
 * LỐI THEO NGỮ CẢNH tới chuyến ĐI THUÊ cũ — hiện trong "Tài khoản & bảo mật" của Manage.
 *
 * ## Vì sao là một thẻ, không phải một mục menu
 *
 * Người nâng từ tuyến hoa hồng lên tuyến gói có thể còn chuyến đi thuê chưa khép: xe phải trả,
 * khoản hoàn phải nhận, chủ xe kia còn cần liên lạc. Khu khách đã đóng với họ, nên nếu không có
 * lối nào thì những nghĩa vụ đó biến mất khỏi giao diện — chúng vẫn tồn tại, chỉ là không ai
 * nhìn thấy.
 *
 * Nhưng một mục "Chuyến của tôi" thường trực trong sidebar Manage sẽ dựng lại đúng thứ việc tách
 * tuyến vừa gỡ bỏ, và với gian hàng chưa bao giờ đi thuê thì đó là một mục rỗng vĩnh viễn. Thẻ
 * này chỉ xuất hiện khi CÓ chuyến, và biến mất khi chuyến cuối khép lại — nó là dấu vết của một
 * lần chuyển tuyến, không phải một chức năng thường trực.
 *
 * ## Vì sao không hiện khi đang tải hay lỗi
 *
 * Con số 0 và "chưa biết" dẫn tới cùng một hành vi: không mời gọi. Một thẻ nháy lên rồi biến mất
 * mỗi lần mở trang còn khó chịu hơn là không có; và một thẻ hiện khi truy vấn hỏng sẽ dẫn tới
 * một danh sách trống mà không ai giải thích được.
 */
export function RenterTripsTransitionCard() {
  const t = useTranslations('Trips.transitional');
  // Trang 1, vai `renter`: chỉ cần `counts.current`, không cần danh sách.
  const { data } = useTrips(CUSTOMER_TRIP_FILTER.CURRENT, 1, TRIP_ROLE.RENTER);

  const open = data?.counts.current ?? 0;
  if (open <= 0) return null;

  return (
    <section className={styles.card}>
      <CarOutlined className={styles.icon} aria-hidden="true" />
      <div className={styles.body}>
        <h2 className={styles.title}>{t('cardTitle')}</h2>
        <p className={styles.text}>{t('cardBody')}</p>
      </div>
      <Button type="primary" className={styles.action}>
        <Link href={ROUTES.MANAGE.ACCOUNT_TRIPS}>
          {t('open')} <ArrowRightOutlined aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
