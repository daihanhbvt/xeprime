'use client';

import { Alert, Empty, Pagination, Skeleton } from 'antd';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getErrorMessage } from '@/services/api-client';
import { useShopListings } from '../hooks/use-shop-listings';
import { VehicleCard } from './VehicleCard';
import styles from './ShopVehicleGrid.module.css';

const PAGE_SIZE = 12;

/**
 * Lưới xe của gian hàng — client island (VehicleCard có nút đặt xe + phân trang qua URL, ADR 0004).
 * Đủ trạng thái loading/empty/error để không bao giờ ra màn trắng.
 */
export function ShopVehicleGrid({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pageParam = Number(searchParams.get('page'));
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const { data, isLoading, isError, error } = useShopListings(slug, page);
  const total = data?.meta.total ?? 0;

  function goPage(next: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <section className={styles.section} aria-label="Xe của gian hàng">
      <h2 className={styles.title}>Xe đang cho thuê{total > 0 ? ` (${total})` : ''}</h2>

      {isError ? (
        <Alert
          type="error"
          showIcon
          message="Không tải được danh sách xe"
          description={getErrorMessage(error)}
        />
      ) : isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <div key={i} className={styles.skeleton}>
              <Skeleton.Image active className={styles.skeletonImg} />
              <Skeleton active paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
      ) : total === 0 ? (
        <Empty className={styles.empty} description="Gian hàng chưa có xe công khai." />
      ) : (
        <>
          <div className={styles.grid}>
            {data?.listings.map((listing) => <VehicleCard key={listing.id} listing={listing} />)}
          </div>
          {total > PAGE_SIZE ? (
            <div className={styles.pager}>
              <Pagination
                current={page}
                pageSize={PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={goPage}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
