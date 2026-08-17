'use client';

import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Empty, Skeleton } from 'antd';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/services/api-client';
import { usePublicListings } from '../hooks/use-public-listings';
import { VehicleCard } from './VehicleCard';
import styles from './VehiclePreview.module.css';

/** Trang chủ chỉ XEM TRƯỚC — tối đa 8 xe, không phân trang, không bộ lọc. */
const PREVIEW_LIMIT = 8;

/**
 * Khối "Xe cho thuê gợi ý" ở trang chủ.
 *
 * Trước đây trang chủ nhúng nguyên bộ máy tìm kiếm (bộ lọc + sắp xếp + phân trang), nên có HAI
 * nơi làm cùng một việc và link chia sẻ luôn trỏ về `/`. Giờ trang chủ chỉ giới thiệu 8 xe rồi
 * đưa sang `/search` — nơi duy nhất sở hữu bộ lọc và trạng thái tìm kiếm.
 *
 * Hỏng khối này KHÔNG được làm hỏng cả trang chủ: lỗi hiện một alert gọn, các mục "Địa điểm nổi
 * bật"/"Gian hàng nổi bật" bên dưới vẫn dùng được.
 */
export function VehiclePreview() {
  const { data, isLoading, isError, error } = usePublicListings({ page: 1, limit: PREVIEW_LIMIT });
  const items = data?.listings ?? [];

  return (
    <section className={styles.section} aria-labelledby="home-vehicles">
      <div className={styles.head}>
        <div>
          <h2 id="home-vehicles" className={styles.title}>
            Xe khả dụng {data ? <span className={styles.count}>({data.meta.total} xe)</span> : null}
          </h2>
        </div>
        <Link href={ROUTES.SEARCH} className={styles.seeAll}>
          Khám phá xe <RightOutlined />
        </Link>
      </div>

      {isLoading ? (
        <ul className={styles.grid} aria-busy="true">
          {/* Khung chờ dựng đúng số ô và đúng tỉ lệ thẻ thật → không giật layout khi có dữ liệu. */}
          {Array.from({ length: PREVIEW_LIMIT }, (_, i) => (
            <li key={i} className={styles.skeletonCard}>
              <Skeleton.Image active className={styles.skeletonImg} />
              <Skeleton active paragraph={{ rows: 2 }} title={{ width: '70%' }} />
            </li>
          ))}
        </ul>
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được danh sách xe"
          description={getErrorMessage(error)}
          action={
            <Link href={ROUTES.SEARCH}>
              <Button size="small">Mở trang tìm xe</Button>
            </Link>
          }
        />
      ) : items.length === 0 ? (
        // "Chưa có xe nào" ở đây nghĩa là HỆ THỐNG chưa có xe công khai — không phải lọc ra rỗng,
        // vì khối này không nhận bộ lọc nào.
        <Empty description="Chưa có xe nào được đăng công khai" />
      ) : (
        <ul className={styles.grid}>
          {items.map((listing) => (
            <li key={listing.id}>
              <VehicleCard listing={listing} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
