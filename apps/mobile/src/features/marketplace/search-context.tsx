import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  draftFromFilters,
  draftToFilterPatch,
  resolveServiceType,
  type RentalMode,
  type SearchDraft,
} from '@xeprime/domain';
import { type MarketplaceFilters, type PublicDestination } from '@xeprime/types';
import { PROVINCE_CODES, type RouteType, type ServiceType, type VehicleType } from '@xeprime/types';
import type { Dayjs } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import { useDestinations } from './hooks/use-marketplace-data';

/**
 * Trải nghiệm tìm kiếm trang chủ — bản native của `search/search-context.tsx`.
 *
 * **Luật thì dùng chung**: `draftFromFilters` / `draftToFilterPatch` / `resolveServiceType` đến
 * từ `@xeprime/api-client`, nên "dịch vụ nào phát tham số nào" là MỘT hiện thực cho cả hai
 * client (ADR 0011 nằm trong đó: dài hạn không phát `pickupAt`/`returnAt`/`hourly`).
 *
 * Khác web đúng một chỗ: web cất bản nháp ở URL searchParams (ADR 0004) để link chia sẻ được
 * và nút Back hoạt động; native không có thanh địa chỉ nên nó sống ở state màn hình. Vì thế ở
 * đây KHÔNG có lớp đồng bộ URL↔nháp của web — không có nguồn thứ hai để đồng bộ với.
 *
 * `filters` là ngữ cảnh ĐÃ ÁP DỤNG mà khối "Xe khả dụng" đọc — nó bắt đầu RỖNG và chỉ được
 * ghi khi người dùng thật sự chạm vào thẻ tìm kiếm — kể cả khoảng thuê, đúng như web.
 */
const PROVINCE_OPTIONS_LIMIT = PROVINCE_CODES.length;

interface SearchExperienceValue {
  draft: SearchDraft;
  /** Ngữ cảnh ĐÃ áp dụng — nguồn của khối "Xe khả dụng". */
  filters: MarketplaceFilters;
  setVehicleType: (next: VehicleType) => void;
  setServiceType: (next: ServiceType) => void;
  setProvinceCode: (next: string) => void;
  /** Chọn tỉnh từ "Địa điểm nổi bật" — không áp khoảng thuê mặc định, xem phần cài đặt. */
  pickProvince: (next: string) => void;
  setRouteType: (next: RouteType) => void;
  setRentalRange: (next: { pickupAt: Dayjs | null; returnAt: Dayjs | null }) => void;
  setRentalMode: (next: RentalMode) => void;
  /** Áp bản nháp vào ngữ cảnh đang xem. */
  submit: () => void;
  /**
   * Ghi thẳng các chiều FACET (hãng, số chỗ, giá, tiện ích…) vào ngữ cảnh.
   *
   * Tách khỏi `edit`: các chiều này không nằm trong bản nháp của thẻ tìm kiếm, và màn kết quả
   * áp chúng NGAY khi bấm "Áp dụng" chứ không chờ "Tìm xe". `undefined` = gỡ chiều đó.
   */
  setFilters: (patch: Partial<MarketplaceFilters>) => void;
  /** Tỉnh/thành có xe — nạp MỘT lần cho cả thẻ tìm kiếm lẫn thanh thu gọn. */
  destinations: PublicDestination[] | undefined;
  destinationsLoading: boolean;
  destinationsError: unknown;
  provinceName: (code: string) => string | undefined;
  /**
   * Nhãn hiển thị cho một mã tỉnh: tên tỉnh · "Toàn quốc" (không lọc) · "…" (đang tải) ·
   * "Địa điểm không còn khả dụng".
   *
   * Không được rút gọn thành `provinceName(code) ?? 'Toàn quốc'`: mã đã đặt mà tra không ra
   * thì hiện "Toàn quốc" là NÓI DỐI — danh sách vẫn đang lọc theo đúng mã đó. Web ghi rõ luật
   * này trong `LocationPicker`; ở đây nó nằm trong context để cả ba bề mặt native dùng chung.
   */
  provinceLabel: (code: string) => string;
}

const SearchExperienceContext = createContext<SearchExperienceValue | null>(null);

export function useSearchExperience(): SearchExperienceValue {
  const value = useContext(SearchExperienceContext);
  if (!value) throw new Error('useSearchExperience phải nằm trong <SearchExperienceProvider>');
  return value;
}

export function SearchExperienceProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /** Ngữ cảnh mang từ màn trước sang — màn kết quả nhận nguyên bộ filter của trang chủ. */
  initial?: MarketplaceFilters;
}) {
  const t = useTranslations('HomeSearch.location');
  const nationwideLabel = t('nationwide');
  const unavailableLabel = t('unavailable');

  const [draft, setDraft] = useState<SearchDraft>(() => draftFromFilters(initial ?? {}));

  /**
   * Ngữ cảnh ĐÃ áp dụng — bắt đầu RỖNG, không phải bằng bản nháp.
   *
   * Bản nháp luôn mang một khoảng thuê mặc định (mai 10:00 → +3 ngày) để ô lịch có sẵn giá trị
   * hợp lệ, nhưng đó là gợi ý của app chứ KHÔNG phải lựa chọn của khách. Áp nó ngay từ lần
   * render đầu là âm thầm lọc "Xe khả dụng" theo một khoảng ngày khách chưa hề chọn — trang chủ
   * hiện 29 xe trong khi thực tế có 49.
   *
   * Web chặn đúng chỗ này bằng cờ `userEditedRef` (`search/search-context.tsx`): nó chỉ ghi
   * bản nháp lên URL sau khi NGƯỜI DÙNG chạm vào thẻ tìm kiếm. `applied` bên dưới là cùng một
   * luật, cất ở state thay vì URL.
   */
  const [filters, setFiltersState] = useState<MarketplaceFilters>(initial ?? {});

  const {
    data: destinations,
    isLoading: destinationsLoading,
    error: destinationsError,
  } = useDestinations(PROVINCE_OPTIONS_LIMIT);

  /**
   * Mọi lối sửa của NGƯỜI DÙNG đi qua đây — và chỉ từ đây ngữ cảnh mới được áp.
   *
   * Đổi loại xe / dịch vụ / địa điểm áp NGAY (web cũng ghi shallow lên URL ngay), nhưng lần áp
   * đầu tiên cũng là lúc khoảng thuê mặc định bắt đầu có hiệu lực — đúng như web: chạm vào thẻ
   * là đóng dấu cả ngữ cảnh lên URL.
   */
  const edit = useCallback((patch: (prev: SearchDraft) => SearchDraft) => {
    setDraft((prev) => {
      const next = patch(prev);
      setFiltersState(applied(next));
      return next;
    });
  }, []);

  const setVehicleType = useCallback(
    (next: VehicleType) =>
      edit((prev) => ({
        ...prev,
        vehicleType: next,
        // Xe máy không có "có tài xế" — luật ở package dùng chung, không đoán lại ở đây.
        serviceType: resolveServiceType(next, prev.serviceType),
      })),
    [edit],
  );

  const setServiceType = useCallback(
    (next: ServiceType) =>
      edit((prev) => ({
        ...prev,
        serviceType: resolveServiceType(prev.vehicleType, next),
      })),
    [edit],
  );

  const setProvinceCode = useCallback(
    (next: string) => edit((prev) => ({ ...prev, provinceCode: next })),
    [edit],
  );

  const setRouteType = useCallback(
    (next: RouteType) => edit((prev) => ({ ...prev, routeType: next })),
    [edit],
  );

  /*
   * Lịch và chế độ giờ/ngày cũng đi qua `edit` — GIỐNG web: chọn xong khoảng thuê là "Xe khả
   * dụng" đổi theo ngay tại trang chủ, không phải chờ bấm "Tìm xe".
   *
   * Không sợ nạp lại theo từng cú chạm lịch: khoảng CHƯA đủ hai đầu thì `draftToFilterPatch`
   * không phát `pickupAt`/`returnAt`, nên ngữ cảnh chỉ đổi đúng một lần — lúc khoảng đã trọn.
   */
  const setRentalRange = useCallback(
    (next: { pickupAt: Dayjs | null; returnAt: Dayjs | null }) =>
      edit((prev) => ({ ...prev, rental: { ...prev.rental, ...next } })),
    [edit],
  );

  const setRentalMode = useCallback(
    (next: RentalMode) => edit((prev) => ({ ...prev, rental: { ...prev.rental, mode: next } })),
    [edit],
  );

  /**
   * Chọn tỉnh từ "Địa điểm nổi bật" — vá ĐÚNG khoá tỉnh, không đi qua `edit`.
   *
   * `edit` đóng dấu trọn bản nháp lên ngữ cảnh, mà bản nháp luôn mang sẵn khoảng thuê mặc định
   * khách chưa hề chọn — bấm "Hà Nội" xong danh sách bị lọc theo khoảng đó và tụt từ 8 xe xuống 4.
   * Web làm đúng: `FeaturedLocations` bên đó gọi `setFilters({ provinceCode })`.
   */
  const pickProvince = useCallback((next: string) => {
    setDraft((prev) => ({ ...prev, provinceCode: next }));
    setFiltersState((prev) => {
      const result = { ...prev };
      if (next) result.provinceCode = next;
      else delete result.provinceCode;
      return result;
    });
  }, []);

  const submit = useCallback(() => setFiltersState(applied(draft)), [draft]);

  const setFilters = useCallback((patch: Partial<MarketplaceFilters>) => {
    setFiltersState((prev) => {
      const next: MarketplaceFilters = { ...prev };
      for (const [key, value] of Object.entries(patch)) {
        const empty =
          value === undefined ||
          value === null ||
          value === '' ||
          value === false ||
          (Array.isArray(value) && value.length === 0);
        // Bỏ hẳn key thay vì gán `undefined`: key mang `undefined` vẫn vào query key của
        // TanStack Query, và hai lần lọc giống hệt nhau thành hai cache khác nhau.
        if (empty) delete next[key as keyof MarketplaceFilters];
        else Object.assign(next, { [key]: value });
      }
      return next;
    });
  }, []);

  const provinceName = useCallback(
    (code: string) => destinations?.find((item) => item.provinceCode === code)?.provinceName,
    [destinations],
  );

  const provinceLabel = useCallback(
    (code: string) => {
      if (!code) return nationwideLabel;
      const found = destinations?.find((item) => item.provinceCode === code)?.provinceName;
      if (found) return found;
      return destinationsLoading ? '…' : unavailableLabel;
    },
    [destinations, destinationsLoading, nationwideLabel, unavailableLabel],
  );

  const value = useMemo(
    () => ({
      draft,
      filters,
      setVehicleType,
      setServiceType,
      setProvinceCode,
      pickProvince,
      setRouteType,
      setRentalRange,
      setRentalMode,
      submit,
      setFilters,
      destinations,
      destinationsLoading,
      destinationsError,
      provinceName,
      provinceLabel,
    }),
    [
      draft,
      filters,
      setVehicleType,
      setServiceType,
      setProvinceCode,
      pickProvince,
      setRouteType,
      setRentalRange,
      setRentalMode,
      submit,
      setFilters,
      destinations,
      destinationsLoading,
      destinationsError,
      provinceName,
      provinceLabel,
    ],
  );

  return (
    <SearchExperienceContext.Provider value={value}>{children}</SearchExperienceContext.Provider>
  );
}

/**
 * Bản nháp → ngữ cảnh áp dụng. Đi qua `draftToFilterPatch` (dùng chung với web) rồi bỏ các key
 * `undefined`: một key mang `undefined` vẫn là key CÓ MẶT trong object, và nó sẽ vào query key
 * của TanStack Query — hai lần tìm giống hệt nhau lại thành hai cache khác nhau.
 */
function applied(draft: SearchDraft): MarketplaceFilters {
  const patch = draftToFilterPatch(draft);
  const result: MarketplaceFilters = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    Object.assign(result, { [key]: value });
  }

  return result;
}
