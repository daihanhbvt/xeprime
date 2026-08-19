import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Skeleton } from 'antd';
import { MarketplaceResults } from '@/features/marketplace/components/MarketplaceResults';
import styles from './search-page.module.css';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Marketplace.meta.search');
  return {
    title: t('title'),
    description: t('description'),
    // Trang kết quả có vô số tổ hợp query — không để công cụ tìm kiếm index từng tổ hợp.
    robots: { index: false, follow: true },
  };
}

/**
 * `/search` — nơi DUY NHẤT sở hữu bối cảnh tìm kiếm: bộ lọc, chip đang lọc, tổng kết quả,
 * sắp xếp, phân trang server, và các trạng thái tải/rỗng/lỗi.
 *
 * Không lặp lại hero, địa điểm nổi bật, gian hàng nổi bật, 4 bước thuê hay CTA chủ xe — đó là
 * nội dung tiếp thị của trang chủ. Header/footer chung vẫn giữ (layout `(public)`).
 *
 * Page là Server Component; phần đọc `useSearchParams` nằm trong client island, bọc `Suspense`
 * theo yêu cầu của Next khi prerender.
 */
export default function SearchPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<SearchFallback />}>
        <MarketplaceResults />
      </Suspense>
    </div>
  );
}

/** Khung chờ dựng sẵn đúng hình dạng lưới kết quả để không giật layout khi island gắn vào. */
function SearchFallback() {
  return (
    <div className={styles.fallback} aria-busy="true">
      <Skeleton active paragraph={{ rows: 1 }} title={{ width: 220 }} />
      <div className={styles.fallbackGrid}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} active paragraph={{ rows: 3 }} />
        ))}
      </div>
    </div>
  );
}
