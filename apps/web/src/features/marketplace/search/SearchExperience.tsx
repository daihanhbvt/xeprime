'use client';

import type { ReactNode } from 'react';
import { SearchCard } from './SearchCard';
import { StickySearchBar } from './StickySearchBar';
import { HERO_OBSERVER_ROOT_MARGIN, SearchExperienceProvider } from './search-context';
import { useElementVisibility } from './use-element-visibility';

/**
 * Trải nghiệm tìm kiếm của TRANG CHỦ = thẻ đầy đủ + thanh thu gọn, **một trạng thái, hai trình
 * bày** (`SearchExperienceProvider`).
 *
 * Đây là ranh giới client duy nhất của khu tìm kiếm: page vẫn là Server Component, chỉ đảo
 * island này sang client.
 */
export function SearchExperience() {
  return (
    <SearchExperienceProvider>
      <HomeSurfaces />
    </SearchExperienceProvider>
  );
}

function HomeSurfaces() {
  const { ref, visible } = useElementVisibility<HTMLDivElement>({
    rootMargin: HERO_OBSERVER_ROOT_MARGIN,
  });

  return (
    <>
      <SearchCard observerRef={ref} />
      <StickySearchBar active={!visible} />
    </>
  );
}

/**
 * CHỈ thanh thu gọn, quấn quanh bộ tìm kiếm sẵn có của một trang khác.
 *
 * Dùng ở `/search`: trang đó giữ nguyên thanh ngữ cảnh + chip lọc nhanh của nó, và chỉ mượn
 * thêm cụm thu gọn khi khối tìm kiếm gốc đã cuộn khuất — thứ người dùng cần lúc đang đọc danh
 * sách là đổi nhanh địa điểm/ngày giờ, không phải một bộ trường thứ hai luôn hiện.
 *
 * `children` chính là mốc quan sát: nó khuất thì thanh hiện. Trạng thái vẫn là CÙNG một nguồn
 * với trang chủ (`SearchExperienceProvider`), nên cụm thu gọn đọc và ghi đúng bộ tham số URL
 * mà trang kết quả đang dùng — không có bản nháp thứ hai.
 */
export function StickySearchOnly({ children }: { children: ReactNode }) {
  return (
    <SearchExperienceProvider>
      <StickyOnlySurfaces>{children}</StickyOnlySurfaces>
    </SearchExperienceProvider>
  );
}

function StickyOnlySurfaces({ children }: { children: ReactNode }) {
  /*
   * `IntersectionObserver` bắn 2 lần cho cả hành trình cuộn, thay vì hàng trăm lần như listener
   * `scroll` — và không đọc layout ở mỗi khung hình.
   */
  const { ref, visible } = useElementVisibility<HTMLDivElement>({
    rootMargin: HERO_OBSERVER_ROOT_MARGIN,
  });

  return (
    <>
      <div ref={ref}>{children}</div>
      <StickySearchBar active={!visible} />
    </>
  );
}
