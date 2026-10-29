import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  draftFromFilters,
  draftToFilterPatch,
  resolveServiceType,
  type RentalMode,
  type SearchDraft,
} from '@xeprime/domain';
import { type MarketplaceFilters, type PublicDestination } from '@xeprime/types';
import {
  PROVINCE_CODES,
  VEHICLE_TYPE,
  type RouteType,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import type { Dayjs } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import { logger } from '@/lib/logger';
import { forgetGeoProvince } from '@/lib/geo-province-memory';
import { rememberProvince } from '@/lib/province-memory';
import { deviceInitialProvinceDeps } from './initial-province.deps';
import { resolveInitialProvince } from './initial-province';
import { readRememberedRentalRange, rememberRentalRange } from '@/lib/rental-range-memory';
import { readRememberedVehicleType, rememberVehicleType } from '@/lib/vehicle-type-memory';
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

/** Không có ngữ cảnh tìm kiếm nào = không lọc gì. Tách riêng để không cấp phát object mỗi render. */
const NO_FILTERS: MarketplaceFilters = {};

/**
 * Ngữ cảnh tìm kiếm ĐANG ÁP DỤNG, hoặc rỗng khi không có.
 *
 * Dành cho những thành phần chỉ cần biết "khách đang lọc dịch vụ nào" để chọn giá hiển thị —
 * `VehicleCard` là chính. Thẻ xe xuất hiện ở cả những nơi KHÔNG có tìm kiếm nào (trang gian
 * hàng công khai), và ở đó "không lọc" là một câu trả lời hợp lệ, không phải một lỗi cấu hình.
 *
 * Đừng dùng thay cho `useSearchExperience`: thứ gì cần `submit`, `setFilters` hay danh sách
 * tỉnh thì THẬT SỰ phải nằm trong provider, và ném lỗi ở đó là đúng.
 */
export function useSearchFilters(): MarketplaceFilters {
  return useContext(SearchExperienceContext)?.filters ?? NO_FILTERS;
}

export function SearchExperienceProvider({
  children,
  initial,
  askLocation = false,
}: {
  children: ReactNode;
  /** Ngữ cảnh mang từ màn trước sang — màn kết quả nhận nguyên bộ filter của trang chủ. */
  initial?: MarketplaceFilters;
  /**
   * Được phép HỎI quyền vị trí để đoán tỉnh mở đầu. Mặc định TẮT, và chỉ trang chủ bật.
   *
   * Hộp thoại quyền là thứ đắt nhất app tiêu của người dùng, nên nó phải gắn với một lý do họ
   * nhìn thấy: trang chủ đang chọn xem xe ở đâu. Bật ở màn kết quả là hỏi giữa lúc họ đã tự nói
   * ra tỉnh mình muốn — và câu trả lời sẽ bị bỏ đi ngay, vì `initial` thắng mọi gợi ý.
   */
  askLocation?: boolean;
}) {
  const t = useTranslations('HomeSearch.location');
  const nationwideLabel = t('nationwide');
  const unavailableLabel = t('unavailable');

  const [draft, setDraft] = useState<SearchDraft>(() => draftFromFilters(initial ?? {}));

  /* Ngữ cảnh mang từ màn trước, chốt ở lần mount đầu — effect khôi phục bên dưới chỉ đọc nó một lần. */
  const initialRef = useRef(initial);

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
   * Điền lại khoảng thuê khách đã chọn ở lượt trước — bản native của effect khôi phục trong
   * `search/search-context.tsx`.
   *
   * Ba chốt chặn, mỗi cái chặn một cách làm hỏng ý định của người dùng:
   *   - `initial?.pickupAt && initial?.returnAt` ⇒ màn trước đã nói (khách vừa lọc ở trang chủ
   *     rồi sang màn kết quả), và ngữ cảnh mang sang luôn thắng — đúng vai URL bên web;
   *   - `userEdited` ⇒ khách đã chạm vào thẻ trong lượt này, đừng ghi đè thứ họ vừa gõ;
   *   - chỉ chạy MỘT lần (mảng phụ thuộc rỗng) ⇒ không giật lại ô vì một lý do khác.
   *
   * Cố ý KHÔNG đánh dấu là đã-sửa: đây là điền sẵn, không phải một thao tác mới. Đánh dấu lên là
   * khoảng ngày này thành một bộ lọc ẩn mà khách chưa hề bấm "Tìm xe" để xác nhận — đúng cái bẫy
   * `applied` ở trên đang tránh.
   */
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (userEditedRef.current) return;
    if (initialRef.current?.pickupAt && initialRef.current?.returnAt) return;

    let alive = true;
    void readRememberedRentalRange().then((remembered) => {
      if (!alive || !remembered || userEditedRef.current) return;
      setDraft((prev) => ({
        ...prev,
        rental: {
          pickupAt: remembered.pickupAt,
          returnAt: remembered.returnAt,
          mode: remembered.mode,
        },
      }));
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Loại xe khách đã TỰ CHỌN ở lượt trước → điền vào BẢN NHÁP — bản native của khối khôi phục loại
   * xe trong `search/search-context.tsx` (web #214).
   *
   * **Chỉ ngoài màn KẾT QUẢ** (`initialRef` trống), cùng lý do với tỉnh ngay dưới: ở màn kết quả
   * thẻ tìm kiếm LÀ bộ lọc, điền "Xe máy" mà ngữ cảnh không mang là nút chọn nói một đằng, danh
   * sách một nẻo. Không bật `userEditedRef`: đây là điền sẵn, không phải thao tác.
   */
  useEffect(() => {
    if (initialRef.current) return;

    let alive = true;
    void readRememberedVehicleType().then((remembered) => {
      if (!alive || !remembered || userEditedRef.current) return;
      setDraft((prev) => ({
        ...prev,
        vehicleType: remembered,
        serviceType: resolveServiceType(remembered, prev.serviceType),
      }));
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Tỉnh/thành khách đã TỰ CHỌN ở lượt trước → điền vào BẢN NHÁP (ADR 0042 điều 6). Bản native
   * của khối khôi phục tỉnh trong `search/search-context.tsx`.
   *
   * **Chỉ ngoài màn KẾT QUẢ.** Ở màn kết quả, thẻ tìm kiếm LÀ bộ lọc và `initial` là thứ quyết
   * định danh sách; điền một tỉnh mà bộ lọc không mang nghĩa là viên địa điểm hiện "Bắc Ninh"
   * trong khi kết quả bên dưới vẫn là toàn quốc — và cách duy nhất để chữa là tự lọc hộ khách
   * một thứ họ chưa bấm. `initialRef` có giá trị đúng bằng "đang ở màn kết quả" (chỉ màn đó
   * truyền `initial`), nên điều kiện này là bản dịch thẳng của `!isResultsPage` bên web.
   *
   * ⚠️ Bộ nhớ tỉnh có HAI người ghi, và họ chọn từ HAI danh mục khác nhau:
   *
   *   - bộ chọn địa điểm ở đây ghi mã lấy từ `/public/destinations` — chỉ những tỉnh ĐANG CÓ XE;
   *   - ô địa chỉ trong các form (`AddressFields`) ghi mã lấy từ `/provinces` — MỌI tỉnh đang mở.
   *
   * Người đọc thì chỉ hiển thị được mã có trong `destinations`. Nên một người vừa khai địa chỉ
   * gian hàng ở một tỉnh chưa có xe nào sẽ quay lại trang chủ và thấy viên địa điểm ghi "Địa điểm
   * không còn khả dụng" — một câu đúng nghĩa đen nhưng nói về một lựa chọn họ chưa hề làm ở đây.
   *
   * Vì vậy: bộ nhớ là một GỢI Ý, và bề mặt nào cũng có quyền không nhận nó. Chỉ điền khi danh mục
   * của CHÍNH bề mặt này tra ra tỉnh đó; không tra ra thì để nguyên "Toàn quốc" — và KHÔNG xoá bộ
   * nhớ, vì mã vẫn đúng và vẫn hữu ích cho các form địa chỉ.
   *
   * Phải đợi `destinations` về mới quyết, nếu không lượt render đầu luôn tra hụt và bộ nhớ không
   * bao giờ được dùng. Cố ý KHÔNG bật `userEditedRef`: đây là điền sẵn, không phải một thao tác —
   * bật lên là khoá ngày mặc định của bản nháp cũng thành bộ lọc mà khách chưa hề xác nhận.
   */
  const restoredProvinceRef = useRef(false);
  useEffect(() => {
    if (initialRef.current || restoredProvinceRef.current || destinationsLoading) return;
    restoredProvinceRef.current = true;

    let alive = true;
    void resolveInitialProvince(
      deviceInitialProvinceDeps({
        hasVehicles: (code) => Boolean(destinations?.some((item) => item.provinceCode === code)),
        // Chỉ hỏi quyền vị trí ở bề mặt trang chủ, và chỉ khi lượt này CHƯA có ngữ cảnh nào:
        // `askLocation` đi vào từ nơi dựng provider, nên màn kết quả không bao giờ hỏi.
        mayAskPermission: askLocation,
      }),
    ).then((resolved) => {
      if (!alive) return;
      logger.debug('[home-province] chốt tỉnh mở trang chủ', {
        code: resolved.code,
        source: resolved.source,
      });
      if (!resolved.code) return;
      setDraft((prev) => (prev.provinceCode ? prev : { ...prev, provinceCode: resolved.code }));
    });
    return () => {
      alive = false;
    };
    // `askLocation` cố ý KHÔNG nằm trong danh sách phụ thuộc: nó là cấu hình của bề mặt, chốt ở
    // lần mount đầu, và `restoredProvinceRef` đã khoá effect này lại đúng một lượt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations, destinationsLoading]);

  /**
   * Mọi lối sửa của NGƯỜI DÙNG đi qua đây — và chỉ từ đây ngữ cảnh mới được áp.
   *
   * Đổi loại xe / dịch vụ / địa điểm áp NGAY (web cũng ghi shallow lên URL ngay), nhưng lần áp
   * đầu tiên cũng là lúc khoảng thuê mặc định bắt đầu có hiệu lực — đúng như web: chạm vào thẻ
   * là đóng dấu cả ngữ cảnh lên URL.
   */
  /*
   * Ngữ cảnh mới GHI ĐÈ đúng các khoá ngữ cảnh (`draftToFilterPatch` phát đủ cả bảy, khoá vắng mặt
   * là `undefined` ⇒ gỡ), còn FACET (hãng, số chỗ, giá…) và từ khoá giữ nguyên — đúng như web, nơi
   * nháp ghi qua `setFilters` lên URL mà không đụng tới facet của panel Bộ lọc.
   */
  const edit = useCallback((patch: (prev: SearchDraft) => SearchDraft) => {
    userEditedRef.current = true;
    setDraft((prev) => {
      const next = patch(prev);
      setFiltersState((current) => mergeFilters(current, draftToFilterPatch(next)));
      return next;
    });
  }, []);

  const setVehicleType = useCallback(
    (next: VehicleType) => {
      rememberVehicleType(next);
      edit((prev) => ({
        ...prev,
        vehicleType: next,
        // Xe máy không có "có tài xế" — luật ở package dùng chung, không đoán lại ở đây.
        serviceType: resolveServiceType(next, prev.serviceType),
      }));
      /*
       * Màn kết quả: dọn facet KHÔNG thuộc loại xe mới, như web #214 — số chỗ/kiểu dáng là của ô
       * tô, phân khúc là của xe máy. Để lại là một bộ lọc ra danh sách rỗng mà khách không thấy.
       */
      if (initialRef.current) {
        setFiltersState((current) =>
          mergeFilters(
            current,
            next === VEHICLE_TYPE.MOTORBIKE
              ? { seats: undefined, bodyType: undefined }
              : { motorbikeCategory: undefined },
          ),
        );
      }
    },
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

  /*
   * Chỗ DUY NHẤT ghi tỉnh vào bộ nhớ, và nó nằm đúng ở trình xử lý thao tác của người dùng —
   * không phải trong một effect theo dõi `draft`. Khác biệt đó là toàn bộ điểm của việc ghi nhớ:
   * `draft` còn đổi vì tham số điều hướng và vì chính khối điền sẵn ở trên, nên một effect sẽ
   * đóng dấu cả những tỉnh khách chưa bao giờ chọn. `pickProvince` ("Địa điểm nổi bật") cũng
   * KHÔNG ghi — web để nguyên như vậy: đó là một gợi ý bấm nhanh, không phải khai báo nơi mình ở.
   */
  const setProvinceCode = useCallback(
    (next: string) => {
      rememberProvince(next);
      /*
       * Và VỨT phép đo vị trí. Từ giây này trở đi lựa chọn của người dùng là câu trả lời, kể cả
       * khi nó là "Toàn quốc" — mà "Toàn quốc" thì `rememberProvince` XOÁ bộ nhớ lựa chọn
       * (ADR 0042 điều 6). Giữ lại phép đo nghĩa là lần mở sau app lại tự lọc theo tỉnh nó đoán,
       * đè lên đúng cái ý định vừa được nói ra.
       */
      forgetGeoProvince();
      edit((prev) => ({ ...prev, provinceCode: next }));
    },
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
  /*
   * Hai hàm dưới là chỗ DUY NHẤT ghi khoảng thuê vào bộ nhớ — và chúng nằm đúng ở trình xử lý
   * thao tác của người dùng, không phải trong một effect theo dõi `draft`. Khác biệt đó là toàn
   * bộ điểm của việc ghi nhớ: `draft` còn đổi vì tham số điều hướng và vì gợi ý tự sinh, nên một
   * effect sẽ lưu cả những khoảng ngày khách chưa bao giờ chọn. Web ghi cùng luật này ở
   * `search/search-context.tsx`.
   */
  const rentalDraft = draft.rental;

  const setRentalRange = useCallback(
    (next: { pickupAt: Dayjs | null; returnAt: Dayjs | null }) => {
      rememberRentalRange({ ...next, mode: rentalDraft.mode });
      edit((prev) => ({ ...prev, rental: { ...prev.rental, ...next } }));
    },
    [edit, rentalDraft.mode],
  );

  const setRentalMode = useCallback(
    (next: RentalMode) => {
      rememberRentalRange({ ...rentalDraft, mode: next });
      edit((prev) => ({ ...prev, rental: { ...prev.rental, mode: next } }));
    },
    [edit, rentalDraft],
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

  /*
   * Áp bản nháp lên ngữ cảnh bằng phép MERGE — như `submit` ở trang kết quả web
   * (`setFilters(draftToFilterPatch(draft))`): chỉ các khoá ngữ cảnh bị ghi đè, còn FACET (hãng,
   * số chỗ, giá, sort, phân khúc, tiện ích, instantBook, minRating) và từ khoá giữ nguyên. Thay
   * cả object là xoá sạch bộ lọc khách đã chọn mỗi lần đổi nơi/giờ.
   *
   * Đọc nháp qua updater chứ không qua closure: `submit()` thường được gọi ngay sau
   * `setProvinceCode`/`setRentalRange` trong cùng một lượt xử lý, lúc closure còn giữ nháp CŨ.
   */
  const submit = useCallback(() => {
    setDraft((current) => {
      setFiltersState((prev) => mergeFilters(prev, draftToFilterPatch(current)));
      return current;
    });
  }, []);

  /*
   * Vá ngữ cảnh từ bên ngoài thẻ tìm kiếm (Áp dụng của tấm Bộ lọc, viên "Nhu cầu", "Tất cả"…).
   * Patch chạm khoá NGỮ CẢNH thì dựng lại nháp theo đúng luật "URL → nháp" của web
   * (`search/search-context.tsx`): `draftFromFilters(next)`, giữ loại xe / khoảng thuê / lộ trình
   * của nháp khi ngữ cảnh mới không mang chúng. Không làm vậy thì lượt `edit` kế tiếp ghi nháp
   * cũ đè lên và âm thầm hoàn tác lựa chọn vừa áp (Xe máy → Ô tô, Dài hạn → Tự lái).
   */
  const setFilters = useCallback((patch: Partial<MarketplaceFilters>) => {
    setFiltersState((prev) => {
      const next = mergeFilters(prev, patch);
      if (CONTEXT_KEYS.some((key) => key in patch)) {
        setDraft((prevDraft) => {
          const fromFilters = draftFromFilters(next);
          return {
            ...fromFilters,
            vehicleType: next.vehicleType ? fromFilters.vehicleType : prevDraft.vehicleType,
            rental: next.pickupAt && next.returnAt ? fromFilters.rental : prevDraft.rental,
            routeType: next.routeType ? fromFilters.routeType : prevDraft.routeType,
          };
        });
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
 * Vá `patch` lên ngữ cảnh; giá trị rỗng (`undefined`, `null`, `''`, `false`, mảng rỗng) GỠ khoá đó.
 *
 * Bỏ hẳn key thay vì gán `undefined`: key mang `undefined` vẫn vào query key của TanStack Query,
 * và hai lần lọc giống hệt nhau thành hai cache khác nhau.
 */
function mergeFilters(
  prev: MarketplaceFilters,
  patch: Partial<MarketplaceFilters>,
): MarketplaceFilters {
  const next: MarketplaceFilters = { ...prev };
  for (const [key, value] of Object.entries(patch)) {
    const empty =
      value === undefined ||
      value === null ||
      value === '' ||
      value === false ||
      (Array.isArray(value) && value.length === 0);
    if (empty) delete next[key as keyof MarketplaceFilters];
    else Object.assign(next, { [key]: value });
  }
  return next;
}

/**
 * Bảy khoá NGỮ CẢNH (nơi · thời gian · chế độ giờ · loại xe · dịch vụ · lộ trình) — đúng tập
 * `draftToFilterPatch` phát ra. Patch chạm một trong số này thì nháp phải dựng lại.
 */
const CONTEXT_KEYS: readonly (keyof MarketplaceFilters)[] = [
  'vehicleType',
  'serviceType',
  'provinceCode',
  'pickupAt',
  'returnAt',
  'hourly',
  'routeType',
];
