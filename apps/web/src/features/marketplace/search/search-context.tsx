'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PROVINCE_CODES, type RouteType, type ServiceType, type VehicleType } from '@xeprime/types';
import type { RentalMode, RentalRange } from '@/components/form/RentalDateTimeRangeField';
import { ROUTES } from '@/constants/routes';
import { XP_TOKENS } from '@/styles/theme';
import { applyFilterPatch } from '../filter-params';
import { useDestinations } from '../hooks/use-destinations';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { PublicDestination } from '../types';
import {
  buildSearchHref,
  draftFromFilters,
  draftToFilterPatch,
  resolveServiceType,
  searchContextSignature,
  type SearchDraft,
} from './search-draft';

/**
 * Bộ chọn địa điểm lấy TRỌN danh mục tỉnh/thành, không phải top-N.
 *
 * Panel lọc ở client, nên một danh sách bị cắt sẽ báo "Không có tỉnh/thành nào khớp" cho đúng
 * những tỉnh ít xe nhất — trong khi chúng vẫn có xe. Trần của endpoint là 63; danh mục hiện có
 * {@link PROVINCE_CODES}.length mục và endpoint chỉ trả tỉnh THỰC SỰ có xe, nên đây là "tất cả",
 * không phải một con số cao cho chắc.
 */
const PROVINCE_OPTIONS_LIMIT = PROVINCE_CODES.length;

/**
 * Neo `IntersectionObserver` của hero: trừ đi phần bị header dính che, nên hero coi như "khuất"
 * ngay khi trôi xuống dưới header — thanh thu gọn xuất hiện đúng lúc thẻ hero khuất hẳn.
 */
export const HERO_OBSERVER_ROOT_MARGIN = `-${XP_TOKENS['market-header-height']} 0px 0px 0px`;

interface SearchExperienceValue {
  draft: SearchDraft;
  setVehicleType: (next: VehicleType) => void;
  setServiceType: (next: ServiceType) => void;
  setProvinceCode: (next: string) => void;
  setRouteType: (next: RouteType) => void;
  setRentalRange: (next: RentalRange) => void;
  setRentalMode: (next: RentalMode) => void;
  /** Điều hướng sang `/search` với ngữ cảnh hiện tại. */
  submit: () => void;
  /** Tỉnh/thành có xe — nạp MỘT lần cho cả hero lẫn sticky, không hai subscription. */
  destinations: PublicDestination[] | undefined;
  destinationsLoading: boolean;
  destinationsError: unknown;
}

const SearchExperienceContext = createContext<SearchExperienceValue | null>(null);

export function useSearchExperience(): SearchExperienceValue {
  const value = useContext(SearchExperienceContext);
  if (!value) throw new Error('useSearchExperience phải nằm trong <SearchExperienceProvider>');
  return value;
}

/**
 * Nguồn sự thật dùng chung của trải nghiệm tìm kiếm trang chủ.
 *
 * Hero và thanh thu gọn là HAI cách trình bày của MỘT trạng thái: không có `heroSearchState`
 * và `stickySearchState` song song, nên không có đường nào để hai thanh nói hai điều khác nhau.
 * Toàn bộ luật "dịch vụ nào phát tham số nào" nằm ở `search-draft.ts`.
 *
 * Ranh giới client: provider này chỉ bọc phần tương tác. Trang chủ vẫn là Server Component.
 */
export function SearchExperienceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { filters, setFilters } = useMarketplaceFilters();
  /**
   * Trên trang KẾT QUẢ (chỉ có thanh thu gọn), mỗi thay đổi ghi thẳng vào URL qua `setFilters` —
   * facet của panel Bộ lọc giữ nguyên, danh sách nạp lại tại chỗ, KHÔNG điều hướng đi đâu.
   * Trên trang chủ, thẻ là bản nháp: chỉ đồng bộ shallow cho các khối cùng trang đọc ngữ cảnh,
   * còn "Tìm xe" mới điều hướng sang kết quả.
   */
  const isResultsPage = pathname === ROUTES.SEARCH;
  const {
    data: destinations,
    isLoading: destinationsLoading,
    error: destinationsError,
  } = useDestinations(PROVINCE_OPTIONS_LIMIT);

  const [draft, setDraft] = useState<SearchDraft>(() => draftFromFilters(filters));

  const urlSignature = searchContextSignature(filters);
  const draftSignature = searchContextSignature(draftToFilterPatch(draft));

  /*
   * URL → nháp, khi URL bị NGƯỜI KHÁC đổi (bấm "Địa điểm nổi bật", nút back, mở link chia sẻ).
   *
   * Đồng bộ NGAY TRONG RENDER, không phải effect: đây là "điều chỉnh state khi đầu vào đổi",
   * và React chạy lại component trước khi commit nên người dùng không thấy một khung hình mang
   * ngữ cảnh cũ.
   *
   * Guard hai lớp để không thành vòng lặp: (1) chỉ chạy khi chữ ký URL thực sự đổi so với lần
   * render trước, (2) bỏ qua nếu URL mới chính là thứ nháp vừa ghi ra. Nhờ vậy "nháp ghi URL"
   * và "URL nạp nháp" không đá nhau.
   *
   * Giữ lại khoảng thuê/lộ trình đang có trong bộ nhớ khi URL không mang chúng: đứng ở tab dài
   * hạn (URL không có ngày theo ADR 0011) mà bấm một địa điểm nổi bật thì lịch tự lái đã chọn
   * vẫn còn nguyên để quay lại.
   */
  const [lastUrlSignature, setLastUrlSignature] = useState(urlSignature);
  if (lastUrlSignature !== urlSignature) {
    setLastUrlSignature(urlSignature);
    if (urlSignature !== draftSignature) {
      setDraft((prev) => {
        const fromUrl = draftFromFilters(filters);
        return {
          ...fromUrl,
          rental: filters.pickupAt && filters.returnAt ? fromUrl.rental : prev.rental,
          routeType: filters.routeType ? fromUrl.routeType : prev.routeType,
        };
      });
    }
  }

  /*
   * Nháp → URL, **chỉ khi chính người dùng chạm vào thẻ tìm kiếm**.
   *
   *  - Trang KẾT QUẢ: ghi qua `setFilters` (router.replace) — facet của panel Bộ lọc giữ nguyên,
   *    `page` về 1, danh sách nạp lại. Thẻ tìm kiếm ở đây LÀ bộ lọc, không phải bản nháp.
   *  - Trang CHỦ: `history.replaceState` (shallow — Next đồng bộ `useSearchParams`) để khối "Xe
   *    khả dụng" đọc `?serviceType=`; không re-render server component, không thêm entry lịch sử.
   *
   * `userEdited` là cờ Ý ĐỊNH, không phải cờ "đã mount". Hai lý do nó phải như vậy:
   *   - `reactStrictMode` bật ⇒ effect chạy hai lần lúc mount, cờ "bỏ qua lần đầu" để lọt lần hai;
   *   - nháp còn được nạp lại từ URL do NGƯỜI KHÁC đổi (bấm "Địa điểm nổi bật"). Nếu lần nạp đó
   *     cũng kích hoạt ghi, một khách chưa hề chạm vào thẻ sẽ bị đóng dấu khoảng thuê MẶC ĐỊNH
   *     lên URL, và "Xe khả dụng" âm thầm lọc theo một khoảng ngày khách không hề chọn.
   */
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (!userEditedRef.current) return;

    if (isResultsPage) {
      if (urlSignature !== draftSignature) setFilters(draftToFilterPatch(draft));
      return;
    }
    if (pathname !== ROUTES.HOME) return;

    const params = new URLSearchParams(window.location.search);
    applyFilterPatch(params, draftToFilterPatch(draft));
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [pathname, draft, isResultsPage, setFilters, urlSignature, draftSignature]);

  const value = useMemo<SearchExperienceValue>(() => {
    /** Mọi lối sửa của NGƯỜI DÙNG đi qua đây — nạp lại từ URL thì không. */
    const edit = (update: (prev: SearchDraft) => SearchDraft) => {
      userEditedRef.current = true;
      setDraft(update);
    };

    return {
      draft,
      /*
       * Đổi loại xe giữ nguyên địa điểm và mọi bản nháp tương thích. Chỉ DỊCH VỤ có thể phải
       * đổi theo: xe máy không có "có tài xế" (`resolveServiceType`), nên đứng ở tab đó rồi
       * chuyển sang xe máy sẽ rơi về tự lái thay vì để lại một tab không tồn tại.
       */
      setVehicleType: (vehicleType) =>
        edit((prev) => ({
          ...prev,
          vehicleType,
          serviceType: resolveServiceType(vehicleType, prev.serviceType),
        })),
      /*
       * Đổi dịch vụ KHÔNG dọn form: loại xe, địa điểm, khoảng thuê và lộ trình đều còn nguyên
       * trong bộ nhớ. Cái thay đổi là những gì được PHÁT ra URL — việc đó do `draftToFilterPatch`
       * quyết định, nên đi tự lái → dài hạn → tự lái lấy lại đúng lịch cũ, và dài hạn không bao
       * giờ suy ra một khoảng ngày từ gói thuê (ADR 0011).
       */
      setServiceType: (serviceType) => edit((prev) => ({ ...prev, serviceType })),
      setProvinceCode: (provinceCode) => edit((prev) => ({ ...prev, provinceCode })),
      setRouteType: (routeType) => edit((prev) => ({ ...prev, routeType })),
      setRentalRange: (range) =>
        edit((prev) => ({
          ...prev,
          rental: { ...prev.rental, pickupAt: range.pickupAt, returnAt: range.returnAt },
        })),
      setRentalMode: (mode) => edit((prev) => ({ ...prev, rental: { ...prev.rental, mode } })),
      /*
       * Trang kết quả đã lọc sống theo từng thay đổi, nên "Tìm xe" ở đó chỉ cần đảm bảo URL
       * khớp nháp (trường hợp người dùng chưa đổi gì thì đây là lần ghi đầu tiên).
       */
      submit: () =>
        isResultsPage ? setFilters(draftToFilterPatch(draft)) : router.push(buildSearchHref(draft)),
      destinations,
      destinationsLoading,
      destinationsError,
    };
  }, [
    draft,
    destinations,
    destinationsLoading,
    destinationsError,
    router,
    isResultsPage,
    setFilters,
  ]);

  return (
    <SearchExperienceContext.Provider value={value}>{children}</SearchExperienceContext.Provider>
  );
}
