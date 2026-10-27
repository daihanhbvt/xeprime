'use client';

import { ClockCircleOutlined, ExclamationOutlined, UserOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Spin } from 'antd';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  INSURANCE_PRODUCT_KIND,
  LONG_TERM_PACKAGE_MONTHS,
  LOCATION_SOURCE,
  PICKUP_PREFERENCE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  SERVICE_TYPE_VALUES,
  isRouteType,
  longTermPickupWindow,
  serviceRequiresDriverLicence,
  type InsuranceProductKind,
  type LongTermPackageMonths,
  type ServiceType,
  DELIVERY_ADDRESS_DEBOUNCE_MS,
  MIN_DELIVERY_ADDRESS_LENGTH,
} from '@xeprime/types';
import {
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  isDriverLicenceGateErrorCode,
  licenceTripLastDayKey,
  longTermReturnFromWallClock,
} from '@xeprime/domain';
import { fetchDriverLicenceOverview } from '@/features/driver-licence/api';
import { DriverLicenceVerifier } from '@/features/driver-licence/components/DriverLicenceVerifier';
import { useDriverLicence } from '@/features/driver-licence/hooks/use-driver-licence';
import type { DriverLicenceTrip } from '@/features/driver-licence/types';
import type { BookingRequestReceipt, RequestBookingPrefill } from '../types';
import type { RentalMode } from '@/components/form/RentalDateTimeRangeField';
import { DeliveryEstimate } from './DeliveryEstimate';
import { ROUTES, paymentPath } from '@/constants/routes';
import { useListingDetail } from '@/features/marketplace/hooks/use-listing-detail';
import type { PublicListingDetail } from '@/features/marketplace/types';
import {
  useAccountPhonePrompt,
  useSuppressAccountPhoneReminder,
} from '@/features/auth/components/AccountPhoneGate';
import { useAuthModal } from '@/features/auth/components/AuthModalProvider';
import { AUTH_CONTEXT, AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { fetchDeliveryDistance } from '@/features/rental-policies/api';
import { useCurrentUser } from '@/hooks/use-current-user';
import { UnpaidHoldList } from '@/features/trips/components/UnpaidHoldList';
import { useUnpaidHolds } from '@/features/trips/hooks';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { hasHoldStage as hasHoldStageOf } from '@/lib/customer-price-view';
import { appWallClockToInstant, appWallClockToIso, toAppTz } from '@/lib/datetime';
import { readDeliveryAddress, rememberDeliveryAddress } from '@/lib/delivery-address-memory';
import { rememberedOrDefaultRentalRange } from '@/lib/rental-range-memory';
import { getErrorCode, isUnauthenticated } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { checkAvailability, submitBookingRequest } from '../api';
import { clearBookingDraft, readBookingDraft, saveBookingDraft } from '../booking-draft';
import { PICKUP_METHOD, requestFormSchema, type RequestFormValues } from '../schema';
import { BookingPriceSummary } from './BookingPriceSummary';
import { NearPickupHoldNotice } from './NearPickupHoldNotice';
import { PromoCodeField } from '@/features/promo-codes/components/PromoCodeField';
import { usePromoCode } from '@/features/promo-codes/use-promo-code';
import { useCustomerCostView } from '../hooks/use-customer-cost-view';
import { publicQuoteParams, usePublicQuote, useQuoteWithPromo } from '../hooks/use-public-quote';
import { useInsuranceOffer } from '@/features/insurance/hooks';
import { BookingJourney } from './BookingJourney';
import { BookingReviewStep, type BookingReviewNextStep } from './BookingReviewStep';
import { BookingSuccessStep } from './BookingSuccessStep';
import type { BookingTrip } from './BookingTripCard';
import { VehicleSummaryPanel } from './VehicleSummaryPanel';
import styles from './RequestBookingFlow.module.css';

/*
 * Chưa đủ dài thì KHÔNG hỏi bản đồ: "12 Ng" vừa tra sai chắc chắn vừa tốn một request có tính
 * tiền. `MIN_DELIVERY_ADDRESS_LENGTH` cùng `DELIVERY_ADDRESS_DEBOUNCE_MS` (dùng chung với app, ở
 * `@xeprime/types`) giữ cho một lần gõ địa chỉ tốn ĐÚNG một lượt tra, không phải một lượt cho
 * mỗi ký tự.
 */

interface RequestBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Listing đầy đủ khi mở từ trang chi tiết — có sẵn thì KHÔNG gọi lại API. */
  listing?: PublicListingDetail | null;
  /** Ngày giờ đã chọn ở bộ lọc "Tìm xe khả dụng" (ISO) — prefill để khách khỏi nhập lại. */
  pickupAt?: string | null;
  returnAt?: string | null;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm (URL) — prefill, khách vẫn đổi được. */
  serviceType?: string | null;
  routeType?: string | null;
  /**
   * Tỉnh GỢI Ý cho ô địa chỉ giao xe — tỉnh khách đang lọc, hoặc tỉnh của chính chiếc xe.
   *
   * Địa chỉ khách đã dùng lần trước THẮNG giá trị này: một địa chỉ đầy đủ do chính họ gõ đáng
   * tin hơn một cái tỉnh suy từ bộ lọc.
   */
  deliveryProvinceCode?: string | null;
  /**
   * Thứ khách đã chọn ở thẻ đặt xe của trang chi tiết (cách nhận xe, địa chỉ giao, gói, mã) — xem
   * `RequestBookingPrefill`. Bản nháp chờ đăng nhập vẫn THẮNG nó.
   */
  prefill?: RequestBookingPrefill | null;
  onClose: () => void;
  /**
   * Báo cho vỏ biết đang có request "không được bỏ dở" (gửi yêu cầu) để nó khoá các đường đóng
   * vô ý. Flow vẫn tự giữ state; đây chỉ là thông báo ra ngoài.
   */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Đang ở màn KẾT QUẢ nào (`null` = còn đang điền) — vỏ overlay đổi hình theo tín hiệu này: giữ
   * khung hai cột rộng 1180px cho một thẻ xác nhận vài dòng thì phần lớn hộp thoại là chỗ trống.
   *
   * Không còn kiểu kết quả "thanh toán": chuyến được nhận ngay thì khách sang trang `/payment/:id`.
   */
  onResultChange?: (result: RequestBookingResult | null) => void;
}

/**
 * Hai loại màn kết quả, vì chúng cần hai vỏ khác nhau:
 *
 *  - `sent` — hộp "Đã gửi yêu cầu" (`BookingSuccessStep`, Figma `19759:22026`): khung 600 riêng,
 *    không tiêu đề hộp, tự cuộn và tự dựng hàng nút.
 *  - `notice` — trùng lặp / tài khoản không được đặt / chạm trần giữ chỗ: một lời báo ngắn trong
 *    hộp `md` thường.
 */
export type RequestBookingResult = 'sent' | 'notice';

/**
 * Chỗ khách đang đứng trong hộp. `check` KHÔNG phải một bước biểu mẫu: đó là lúc hộp đang kiểm
 * chuyến thẻ đặt xe đưa sang (chờ), đang mời đăng nhập, hay chuyến không đi tiếp được (lời báo).
 * `licence` nằm trước màn Xem lại khi bằng chưa hợp lệ; `done` là màn kết quả.
 */
type BookingStepKey = 'check' | 'licence' | 'review' | 'done';

/**
 * Luồng "Yêu cầu thuê xe" của khách — **một bước**: `Xem lại` (Figma `19727:55409`, dựng ở
 * `BookingReviewStep`) — thẻ chuyến, người thuê + lời nhắn, giấy tờ, chi phí, ô đồng ý và nút gửi.
 *
 * **Không có bước "Chuyến đi" (27/10/2026).** Chuyến (dịch vụ, thời gian, cách nhận xe, địa chỉ,
 * gói, mã, bảo hiểm) được chọn ở thẻ đặt xe của trang chi tiết — nơi có lịch bận, bản đồ và báo giá
 * sống — và thẻ chỉ mở hộp khi chuyến đã đủ (`prefill`). Mở hộp là hộp tự chạy lượt kiểm mà nút
 * "Tiếp tục" cũ từng chạy: kiểm dữ liệu, kiểm khung giờ còn trống, mời đăng nhập nếu chưa có phiên,
 * soát bằng lái. Trong lúc kiểm hộp hiện trạng thái chờ; khung giờ bận / dữ liệu không hợp lệ ⇒ một
 * lời báo kèm lối "Chọn lại" (đóng hộp, khách sửa ở thẻ), chưa đăng nhập ⇒ hộp đăng nhập, thiếu bằng
 * lái ⇒ bước bằng lái, còn lại ⇒ Xem lại. Màn Xem lại không có lối "Chỉnh sửa" quay về đâu cả.
 *
 * **Không có ô liên hệ nào** (ADR 0060). Gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập, và họ tên +
 * SĐT đã xác minh của người thuê đọc từ tài khoản đó ở server — client không gửi, server không tin.
 * Màn Xem lại chỉ hiện lại chúng (chỉ đọc). Thứ duy nhất khách gõ ở đó là LỜI NHẮN cho chủ xe.
 *
 * **Chưa đăng nhập** ⇒ kiểm khung giờ trống (công khai) như thường, rồi GIỮ chuyến vào bản nháp
 * (`booking-draft.ts`, `sessionStorage`, không lên URL) và mở hộp đăng nhập / đăng ký ngay trên hộp
 * này. Có phiên rồi thì luồng TỰ ĐI TIẾP từ đúng chỗ đó — kiểm lại khung giờ, rồi bằng lái (nếu
 * cần), rồi Xem lại. Đăng nhập Google/Facebook rời trang:
 * quay về trang xe, `RequestBookingButton` mở lại hộp từ bản nháp và luồng đi tiếp y như vậy.
 * Không có gì được GỬI trước khi khách tự bấm "Gửi yêu cầu", và chưa đăng nhập thì không có yêu
 * cầu, không có phiên khách vãng lai, không giữ lịch.
 *
 * Tài khoản chưa có SĐT đã xác minh (vừa vào bằng Google/Facebook) đi hết các bước như thường và
 * được hỏi số ĐÚNG lúc bấm "Gửi yêu cầu" (ADR 0071, `useAccountPhonePrompt`) — hộp điền sẵn SĐT liên
 * hệ vừa gõ ở màn Xem lại; xác minh xong thì lượt gửi đó đi tiếp. Trong lúc hộp đặt xe mở, lời nhắc
 * chung của vỏ site không tự bật. Server vẫn là chốt (`PHONE_NOT_VERIFIED`).
 *
 * **Giao xe tận nơi** chỉ giữ khi CHÍNH SÁCH hiệu lực cho phép (`listing.deliveryAvailable`), không
 * phải khi hồ sơ xe gắn chip tiện ích — chính sách tắt thì kéo về nhận tại điểm hẹn.
 *
 * Từ 24/08 (ADR 0018) màn Xem lại hiện thêm **quãng đường và phí dự kiến** tra từ bản đồ. Đó là
 * ƯỚC LƯỢNG và chỉ có thế: nó KHÔNG đi vào payload, KHÔNG cộng vào tổng tiền, và không sinh ra
 * trạng thái chờ khách duyệt phí nào. Yêu cầu vẫn gửi đi với phí giao 0 như Wave 9 đã chốt, chủ
 * xe thống nhất phí với khách rồi cập nhật vào đơn sau khi duyệt. Chưa cấu hình bản đồ, địa chỉ
 * quá ngắn hay tra không ra thì phần ước lượng đơn giản không hiện — luồng đặt xe không đổi một
 * bước nào.
 *
 * Tiền hiển thị đều LẤY TỪ SERVER (`/public/listings/:id/quote`) và chỉ do `BookingPriceSummary`
 * dựng — cùng câu hỏi, cùng cache với thẻ đặt xe.
 */
export function RequestBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing: providedListing,
  pickupAt,
  returnAt,
  serviceType: serviceTypeContext,
  routeType: routeTypeContext,
  deliveryProvinceCode,
  prefill,
  onClose,
  onBusyChange,
  onResultChange,
}: RequestBookingFlowProps) {
  const t = useTranslations('BookingRequests.flow');
  const tTrips = useTranslations('Trips');
  /** Chữ của các câu báo lỗi validation — namespace riêng, dùng bởi `requestFormSchema`. */
  const tf = useTranslations('BookingRequests.form');
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<BookingStepKey>('check');
  /** Dịch vụ mở đầu — từ ngữ cảnh tìm kiếm; đối chiếu với năng lực xe ở effect phía dưới. */
  const initialServiceType =
    serviceTypeContext && (SERVICE_TYPE_VALUES as string[]).includes(serviceTypeContext)
      ? (serviceTypeContext as ServiceType)
      : SERVICE_TYPE.SELF_DRIVE;

  /*
   * Mở THẲNG trang chi tiết (không qua `/search`, nên URL không mang ngày giờ) → điền khoảng
   * khách đã tự chọn trước đó, hoặc gợi ý mặc định. Không có bước này thì ô thời gian trống
   * trơn, và khách phải chọn lại đúng thứ họ vừa chọn ở trang trước.
   *
   * Tính MỘT LẦN lúc dựng chứ không trong effect. Đọc bộ nhớ trình duyệt lúc render chỉ sai khi
   * có một lần render trên SERVER để lệch với nó — mà ở đây không có: `RequestBookingModal` chỉ
   * dựng flow khi đã mở (`{open ? … : null}`), và `open` khởi tạo bằng `false` ở phía client.
   * Đổi lại, phiên bản effect phải kèm một `setState` đồng bộ (thứ `react-hooks/set-state-in-effect`
   * chặn, vì nó tạo thêm một vòng render sau khi ô đã hiện ra trống) và một `useRef` đọc ngay
   * lúc render để nhớ đã điền hay chưa.
   *
   * Đây chỉ là ĐIỀN SẴN. Nó không nói gì về việc chiếc xe này có rảnh trong khoảng đó không:
   * lịch bận (`busyDays`) và giờ giao nhận của chủ xe vẫn được kiểm trước khi cho gửi yêu cầu,
   * và chốt cuối vẫn là constraint chống trùng ở DB (ADR 0006).
   */
  /*
   * Bản nháp của CHÍNH xe này — thứ khách đã nhập trước khi được mời đăng nhập (ADR 0060). Đọc MỘT
   * LẦN lúc dựng, cùng lý do với `seededRange` ngay dưới: flow chỉ được dựng khi hộp đã mở ở client.
   * Có bản nháp thì nó THẮNG cả URL lẫn bộ nhớ khoảng thuê: đó là thứ khách vừa tự chọn cho xe này.
   */
  const [restoredDraft] = useState(() => readBookingDraft(vehicleId));

  const [seededRange] = useState(() => {
    if (restoredDraft) return null;
    // Mốc từ URL luôn THẮNG: một link chia sẻ phải mở ra đúng thứ người gửi nhìn thấy.
    if (pickupAt && returnAt) return null;
    // Dài hạn KHÔNG có khoảng nhận–trả ở bước này (ADR 0011) — khách chọn GÓI, không chọn lịch.
    if (initialServiceType === SERVICE_TYPE.LONG_TERM) return null;
    return rememberedOrDefaultRentalRange();
  });

  /** Thuê theo ngày hay theo giờ — chỉ đổi cách kể thời lượng; khách chọn nó ở thẻ đặt xe. */
  const [rentalMode] = useState<RentalMode>(
    () => restoredDraft?.rentalMode ?? prefill?.rentalMode ?? seededRange?.mode ?? 'daily',
  );
  /**
   * Khách đã bấm "Tiếp tục" khi CHƯA đăng nhập và đang ở hộp đăng nhập/đăng ký. Có phiên là luồng
   * tự đi tiếp (xem khối "quay lại sau đăng nhập" bên dưới). Mở hộp từ một bản nháp (quay về sau
   * Google/Facebook) thì bắt đầu ở trạng thái này luôn.
   */
  const [awaitingAuth, setAwaitingAuth] = useState(restoredDraft !== null);
  /**
   * Mốc mời đăng nhập gần nhất (ms). Chỉ một `/auth/me` NẠP SAU mốc này mới được tính là "đã có
   * phiên": khi phiên hết hạn giữa chừng (401), cache vẫn còn giữ người dùng CŨ thêm một lúc, và
   * coi bản cũ đó là "vừa đăng nhập" là đi tiếp ngay sau lưng hộp đăng nhập — rồi lại 401, lại mời,
   * thành một vòng lặp. Hộp dựng lại từ BẢN NHÁP (quay về sau Google/Facebook, hay quay lại trang
   * sau một lần 401) thì mốc là lúc GHI bản nháp: phiên nạp sau đó mới là phiên thật.
   */
  const [signInRequestedAt, setSignInRequestedAt] = useState(() => restoredDraft?.savedAt ?? 0);
  /**
   * Khách vừa xác minh SĐT trong hộp mở ra từ cú bấm "Gửi yêu cầu" — gửi tiếp ngay khi `/auth/me`
   * làm mới mang số đã xác minh (xem `submitTick`). "Để sau" thì cờ này không bao giờ bật.
   */
  const [submitAfterPhone, setSubmitAfterPhone] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  /**
   * Chuyến thẻ đặt xe đưa sang KHÔNG đi tiếp được — khung giờ vừa bận, dữ liệu không hợp lệ, hay
   * lượt kiểm lỗi mạng (`retryable`). Hộp không có biểu mẫu nào để sửa tại chỗ: lời báo mời khách
   * đóng hộp và chọn lại ở thẻ (hoặc thử lại khi lỗi là của mạng).
   */
  const [tripIssue, setTripIssue] = useState<{ message: string; retryable: boolean } | null>(null);
  /**
   * Kết quả của lượt kiểm: dữ liệu chuyến KHÔNG hợp lệ (`reason`) ⇒ lời báo, chỉ có lối chọn lại ở
   * thẻ. Nơi gọi chuyển kết quả vào đây trong một callback — không đổi state ngay trong effect.
   */
  function reportInvalidTrip(reason: string | null) {
    if (reason) setTripIssue({ message: reason, retryable: false });
  }

  /** Yêu cầu trùng lặp — trạng thái riêng, có lối đi tiếp, không phải một alert đỏ. */
  const [duplicate, setDuplicate] = useState(false);
  /*
   * Tài khoản KHÔNG được đặt xe (15/09/2026) — tài khoản gian hàng tuyến gói, hoặc đang đặt
   * chính xe của gian hàng mình.
   *
   * Là một TRẠNG THÁI KẾT QUẢ chiếm trọn hộp thoại, không phải một dòng lỗi đỏ cạnh nút gửi:
   * người dùng cần biết mình đang là AI và phải làm gì tiếp, mà một câu lỗi cạnh nút không nói
   * được điều đó.
   *
   * Nút đặt xe vẫn hiện như cũ. Ẩn nút không phải kiểm soát quyền (cổng thật ở backend), và ẩn
   * đi thì chủ gian hàng bấm mãi không được mà không bao giờ biết vì sao.
   */
  const [blocked, setBlocked] = useState<'shopAccount' | 'ownVehicle' | null>(null);
  /**
   * Server vừa từ chối lượt gửi vì khách đã giữ đủ số chuyến chưa trả (`HOLD_LIMIT_REACHED`). Chỉ là
   * nguồn DỰ PHÒNG cho người chưa có phiên (không đọc được lời nhắc) — có phiên thì màn chặn đọc
   * thẳng từ `useUnpaidHolds`, xem `holdLimitBlocked`.
   */
  const [submitHitHoldLimit, setSubmitHitHoldLimit] = useState(false);
  /** Kết quả nhận yêu cầu — biết đơn đã được XÁC NHẬN NGAY (auto-accept) hay còn chờ chủ xe. */
  const [receipt, setReceipt] = useState<BookingRequestReceipt | null>(null);

  // 401 = chưa đăng nhập — trạng thái hợp lệ ở màn công khai này: lượt kiểm khung giờ vẫn chạy,
  // khách chỉ được mời đăng nhập sau đó.
  const meQuery = useCurrentUser();
  const me = meQuery.data;
  const authModal = useAuthModal();
  const promptAccountPhone = useAccountPhonePrompt();
  useSuppressAccountPhoneReminder();
  /*
   * Khách đang giữ những chuyến nào chưa trả — đọc NGAY khi mở hộp thoại. Đã chạm trần thì server
   * sẽ từ chối mọi yêu cầu mới (`HOLD_LIMIT_REACHED`), nên nói trước khi khách mất công điền form.
   * Khoá nằm dưới nhánh `trips`: trả xong ở tab khác thì thông báo realtime làm mới nó, và hộp thoại
   * tự mở lại form.
   */
  const unpaidHolds = useUnpaidHolds(Boolean(me));

  /**
   * Hồ sơ xe cho cột trái. Mở từ trang chi tiết thì `providedListing` đã đủ và query TẮT —
   * không có lý do gọi lại thứ vừa render xong.
   */
  const listingQ = useListingDetail(vehicleId, { enabled: !providedListing });
  const listing = providedListing ?? listingQ.data ?? null;

  /**
   * Ảnh xe cho thẻ tóm tắt — ảnh tin đăng, rồi tới ảnh thẻ xe mà nơi gọi truyền vào. Thiếu cả hai
   * thì bỏ ảnh chứ không dựng ô xám rỗng.
   */
  const vehicleThumbUrl = listing?.mainImageUrl ?? vehicleImageUrl ?? null;

  /*
   * Schema dựng lại khi ĐỔI NGÔN NGỮ, không phải mỗi lần render: câu báo lỗi validation là chữ
   * hiện cho khách đọc, nên nó phải đi qua `t` (ADR 0012). `t` ổn định theo locale, nên `useMemo`
   * ở đây giữ cho `yupResolver` không nhận một schema mới ở mỗi phím gõ.
   */
  const schema = useMemo(() => requestFormSchema(tf), [tf]);

  /*
   * ĐIỀN SẴN từ thẻ đặt xe (`prefill`) — chỉ dùng khi KHÔNG có bản nháp. "Giao tận nơi" được giữ
   * kể cả khi thẻ chưa có địa chỉ: địa chỉ lần trước (nếu có) được điền hộ, không có thì lượt kiểm
   * báo thiếu địa chỉ — KHÔNG âm thầm đổi thành tự nhận rồi đi thẳng tới màn Xem lại.
   * Gói dài hạn ngoài sáu gói của ADR 0011 bị bỏ qua, về gói nhỏ nhất.
   *
   * Địa chỉ của thẻ là địa chỉ GIAO XE cho tự lái / dài hạn, và là điểm ĐÓN cho chuyến có tài xế.
   */
  const prefillWithDriver = !restoredDraft && initialServiceType === SERVICE_TYPE.WITH_DRIVER;
  const prefillWantsDelivery =
    !restoredDraft && !prefillWithDriver && prefill?.pickupMethod === PICKUP_METHOD.DELIVERY;
  const prefillAddress = prefill?.delivery?.addressLine.trim() ? prefill.delivery : null;
  const prefillDelivery = prefillWantsDelivery ? prefillAddress : null;
  const prefillDriverPickup = prefillWithDriver ? prefillAddress : null;
  const prefillDriverPickupPinned =
    prefillDriverPickup?.latitude != null && prefillDriverPickup.longitude != null;
  const prefillPackage =
    prefill?.packageMonths != null &&
    (LONG_TERM_PACKAGE_MONTHS as readonly number[]).includes(prefill.packageMonths)
      ? (prefill.packageMonths as LongTermPackageMonths)
      : LONG_TERM_PACKAGE_MONTHS[0];
  const prefillDeliveryPinned =
    prefillDelivery?.latitude != null && prefillDelivery.longitude != null;

  const { control, trigger, getValues, setValue, getFieldState } = useForm<RequestFormValues>({
    resolver: yupResolver(schema),
    defaultValues: restoredDraft?.values ?? {
      // Dịch vụ/lộ trình prefill từ ngữ cảnh tìm kiếm; đối chiếu với năng lực xe ở effect dưới.
      serviceType: initialServiceType,
      routeType: isRouteType(routeTypeContext) ? routeTypeContext : ROUTE_TYPE.IN_CITY,
      pickupProvinceCode: prefillDriverPickup?.provinceCode ?? '',
      pickupWardCode: '',
      pickupAddressLine: prefillDriverPickup?.addressLine.trim() ?? '',
      pickupPlaceId: prefillDriverPickup?.placeId ?? null,
      pickupLatitude: prefillDriverPickupPinned ? (prefillDriverPickup?.latitude ?? null) : null,
      pickupLongitude: prefillDriverPickupPinned ? (prefillDriverPickup?.longitude ?? null) : null,
      pickupLocationSource: prefillDriverPickup
        ? prefillDriverPickupPinned
          ? LOCATION_SOURCE.GOOGLE_PLACE
          : LOCATION_SOURCE.MANUAL
        : null,
      destination: prefillWithDriver ? (prefill?.destination?.trim() ?? '') : '',
      // Mốc từ URL là UTC; ô chọn phải hiện GIỜ VIỆT NAM (CLAUDE.md §9).
      pickupAt: pickupAt ? toAppTz(pickupAt) : (seededRange?.pickupAt ?? null),
      returnAt: returnAt ? toAppTz(returnAt) : (seededRange?.returnAt ?? null),
      // Thuê dài hạn: gói + nguyện vọng khách đã chọn ở thẻ đặt xe; không có thì gói NHỎ NHẤT và
      // nguyện vọng linh hoạt nhất.
      longTermPackageMonths: prefillPackage,
      pickupPreference: prefill?.pickupPreference ?? PICKUP_PREFERENCE.WITHIN_7_DAYS,
      requestedPickupDate:
        prefill?.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE
          ? (prefill.requestedPickupDate ?? null)
          : null,
      pickupMethod: prefillWantsDelivery ? PICKUP_METHOD.DELIVERY : PICKUP_METHOD.SELF,
      deliveryProvinceCode: prefillDelivery?.provinceCode ?? '',
      deliveryWardCode: '',
      deliveryAddressLine: prefillDelivery?.addressLine.trim() ?? '',
      deliveryPlaceId: prefillDelivery?.placeId ?? null,
      deliveryLatitude: prefillDeliveryPinned ? (prefillDelivery?.latitude ?? null) : null,
      deliveryLongitude: prefillDeliveryPinned ? (prefillDelivery?.longitude ?? null) : null,
      // Có toạ độ ⇒ khách đã chọn gợi ý bản đồ; không có ⇒ khách đã chốt đúng chữ mình gõ.
      deliveryLocationSource: prefillDelivery
        ? prefillDeliveryPinned
          ? LOCATION_SOURCE.GOOGLE_PLACE
          : LOCATION_SOURCE.MANUAL
        : null,
      note: '',
      customerName: me?.displayName ?? '',
      customerPhone: me?.phone ?? '',
      vehicleProtectionSelected: prefill?.vehicleProtectionSelected ?? false,
      personalAccidentSelected: prefill?.personalAccidentSelected ?? false,
    },
  });

  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const pickupMethod = useWatch({ control, name: 'pickupMethod' });
  const watchedService = useWatch({ control, name: 'serviceType' });
  const watchedRoute = useWatch({ control, name: 'routeType' });
  const watchedPackage = useWatch({ control, name: 'longTermPackageMonths' });
  const watchedPreference = useWatch({ control, name: 'pickupPreference' });
  const watchedRequestedDate = useWatch({ control, name: 'requestedPickupDate' });
  const watchedAccepted = useWatch({ control, name: 'acceptedTerms' });
  const watchedVehicleProtection = useWatch({ control, name: 'vehicleProtectionSelected' });
  const watchedPersonalAccident = useWatch({ control, name: 'personalAccidentSelected' });
  const isLongTerm = watchedService === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = watchedService === SERVICE_TYPE.WITH_DRIVER;
  /** Tự lái / dài hạn ⇒ khách phải có bằng lái hợp lệ cho chuyến (ADR 0057). */
  const needsLicence = serviceRequiresDriverLicence(watchedService);
  /**
   * Chuyến mà bằng phải dùng được: loại xe + ngày cuối (cùng `licenceTripLastDayKey` với cổng ở
   * server). Dài hạn chưa có ngày nhận chắc ⇒ ngày nhận MUỘN NHẤT khách đã nêu.
   */
  const licenceTrip = useMemo<DriverLicenceTrip | null>(() => {
    if (!needsLicence) return null;
    const vehicleType = listing?.vehicleType ?? null;
    if (isLongTerm) {
      if (!watchedPackage) return null;
      const latestPickupDateKey =
        watchedPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && watchedRequestedDate
          ? watchedRequestedDate.format('YYYY-MM-DD')
          : longTermPickupWindow(new Date()).end;
      return {
        vehicleType,
        lastDayKey: licenceTripLastDayKey({ latestPickupDateKey, packageMonths: watchedPackage }),
      };
    }
    if (!watchedReturn) return null;
    return {
      vehicleType,
      lastDayKey: licenceTripLastDayKey({
        returnAt: appWallClockToInstant(watchedReturn).toDate(),
      }),
    };
  }, [
    needsLicence,
    listing?.vehicleType,
    isLongTerm,
    watchedPackage,
    watchedPreference,
    watchedRequestedDate,
    watchedReturn,
  ]);
  // Có tài xế thì xe ĐẾN ĐÓN khách — "giao xe tận nơi" không có nghĩa với chuyến này.
  const isDelivery = !isWithDriver && pickupMethod === PICKUP_METHOD.DELIVERY;
  /**
   * Điều khoản chủ xe công bố cho ĐÚNG dịch vụ đang chọn (08/09/2026) — server đã tính giấy tờ
   * hiệu lực và cờ bắt đồng ý; client chỉ hiển thị và bắt tick khi được yêu cầu.
   */
  const activeTerms =
    listing?.rentalTerms?.find((term) => term.serviceType === watchedService) ?? null;
  const requiresTermsAcceptance = Boolean(activeTerms?.requireTermsAcceptance);
  /**
   * Ô đồng ý của màn Xem lại có phủ ĐIỀU KHOẢN CỦA CHỦ XE không. Server hiểu `acceptedTerms` là "đã
   * đồng ý điều khoản thuê của chủ xe" và đóng băng nó CÙNG nội dung điều khoản vào yêu cầu — nên
   * chỉ gửi khi câu đồng ý khách vừa tick thật sự nhắc tới điều khoản đó, tức là khi chủ xe CÓ điều
   * khoản (công bố, hoặc bắt buộc đồng ý). Không có thì ô chỉ là lời đồng ý văn bản của XePrime.
   */
  const agreementCoversHostTerms = Boolean(activeTerms?.termsText) || requiresTermsAcceptance;

  /**
   * Giao tận nơi có ĐẶT ĐƯỢC không — theo CHÍNH SÁCH hiệu lực, không phải chip tiện ích trên
   * hồ sơ xe. Hồ sơ xe chưa về thì chưa dựng lựa chọn nào để khỏi nháy một ô rồi rút lại.
   */
  const deliveryAvailable = Boolean(listing?.deliveryAvailable);

  /**
   * Tỉnh của chiếc xe — giá trị DỰ PHÒNG cho mã tỉnh của địa chỉ giao/đón khi địa điểm khách chọn
   * không quy được tỉnh. Lấy từ chính hồ sơ xe; `deliveryProvinceCode` (tỉnh gợi ý từ bộ lọc) chỉ
   * dùng khi hồ sơ xe chưa về hoặc chi nhánh chưa khai tỉnh.
   */
  const vehicleProvinceCode = listing?.provinceCode ?? deliveryProvinceCode ?? null;

  /** Các dịch vụ xe phục vụ được — dịch vụ thẻ đưa sang phải nằm trong đây. */
  const vehicleServices = useMemo<string[]>(
    () => listing?.serviceTypes ?? [],
    [listing?.serviceTypes],
  );

  /**
   * Ngữ cảnh từ URL có thể trỏ tới dịch vụ xe KHÔNG phục vụ (link cũ, gõ tay) — khi hồ sơ xe
   * về thì đối chiếu và rơi về dịch vụ đầu tiên của xe, không giữ một lựa chọn vô nghĩa.
   */
  useEffect(() => {
    if (vehicleServices.length === 0) return;
    if (!vehicleServices.includes(getValues('serviceType'))) {
      setValue('serviceType', vehicleServices[0] as ServiceType);
    }
  }, [vehicleServices, getValues, setValue]);

  /**
   * Chính sách tắt giao xe mà form còn giữ lựa chọn cũ (khách đổi dịch vụ, hoặc hồ sơ xe về
   * muộn) → kéo về nhận tại điểm hẹn. Không làm việc này thì payload mang `deliveryRequested`
   * mà giao diện không còn ô nào để sửa, và backend từ chối ở đúng nút cuối cùng.
   */
  useEffect(() => {
    // Hồ sơ xe chưa về thì CHƯA BIẾT chính sách — kéo về lúc này là xoá lựa chọn giao xe mà khách
    // vừa khôi phục từ bản nháp, chỉ vì cột trái tải chậm hơn.
    if (!listing) return;
    if (!deliveryAvailable && getValues('pickupMethod') === PICKUP_METHOD.DELIVERY) {
      setValue('pickupMethod', PICKUP_METHOD.SELF, { shouldValidate: true });
    }
  }, [listing, deliveryAvailable, getValues, setValue]);

  /**
   * Đồng bộ tên và số điện thoại liên hệ từ tài khoản người dùng (`me`) khi nạp xong.
   * Nếu người dùng chưa tự sửa và form chưa có giá trị, điền sẵn thông tin tài khoản.
   */
  useEffect(() => {
    if (me) {
      if (!getValues('customerName') && me.displayName) {
        setValue('customerName', me.displayName, { shouldValidate: false });
      }
      if (!getValues('customerPhone') && me.phone) {
        setValue('customerPhone', me.phone, { shouldValidate: false });
      }
    }
  }, [me, getValues, setValue]);

  /**
   * Báo giá công khai — CÙNG PricingService với luồng duyệt của shop, FE không tự cộng trừ.
   * Hỏng cũng không chặn luồng đặt: khối giá là thông tin tham khảo, giá chốt do shop duyệt.
   *
   * Dài hạn báo giá theo GÓI: không gửi ngày nào cả (giá không phụ thuộc ngày nhận, ADR 0011).
   * Dịch vụ theo ngày giữ hợp đồng nhận–trả như cũ.
   */
  const quoteParams = publicQuoteParams({
    serviceType: watchedService,
    pickupAt: watchedPickup,
    returnAt: watchedReturn,
    routeType: watchedRoute,
    packageMonths: watchedPackage,
    vehicleProtectionSelected: watchedVehicleProtection,
    personalAccidentSelected: watchedPersonalAccident,
  });
  /*
   * Quãng đường giao xe + phí dự kiến.
   *
   * Chỉ hỏi cho địa chỉ ĐÃ XÁC NHẬN: có toạ độ (khách chọn gợi ý), hoặc là địa chỉ gõ tay khách đã
   * chủ động chốt (`locationSource = manual`). Chữ đang gõ dở thì KHÔNG: tra một dòng chữ là hai
   * giao dịch Vietmap (search + place, ADR 0061) cho một thứ mà cú blur sắp trả về mốc cũ, và con
   * số phí hiện ra lúc đó nói về một chỗ khách chưa chọn. Debounce 900ms vẫn giữ cho lượt gõ đè
   * rồi quay lại không bắn request nào. Ba lớp cache xếp chồng nhau — TanStack ở đây, `geocode_cache` và
   * `geo_route_cache` ở backend — nên khách sửa qua sửa lại rồi quay về địa chỉ cũ không tốn gì.
   *
   * Query KHÔNG bao giờ ném: mọi ngả không tra được về dưới dạng `status`, nên không có nhánh
   * lỗi nào chặn khách bấm gửi yêu cầu.
   */
  const watchedDeliveryLine = useWatch({ control, name: 'deliveryAddressLine' });
  const watchedDeliveryLat = useWatch({ control, name: 'deliveryLatitude' });
  const watchedDeliveryLng = useWatch({ control, name: 'deliveryLongitude' });
  const watchedDeliverySource = useWatch({ control, name: 'deliveryLocationSource' });
  /** Địa chỉ gõ tay đã chốt — đường DUY NHẤT báo giá được tra bằng chữ (xem khối trên). */
  const deliveryManual = watchedDeliverySource === LOCATION_SOURCE.MANUAL;
  const debouncedDeliveryAddress = useDebouncedValue(
    watchedDeliveryLine?.trim() ?? '',
    DELIVERY_ADDRESS_DEBOUNCE_MS,
  );
  /*
   * Ghim khách ĐÃ XÁC NHẬN thắng chuỗi chữ: gửi toạ độ lên thì server dùng thẳng và bỏ qua bước
   * tra địa chỉ — vừa rẻ hơn một request có tính tiền, vừa cho con số khớp với đúng địa điểm
   * khách vừa chọn.
   */
  const deliveryPin =
    watchedDeliveryLat != null && watchedDeliveryLng != null
      ? { lat: watchedDeliveryLat, lng: watchedDeliveryLng }
      : null;
  const watchedPickupProvince = useWatch({ control, name: 'pickupProvinceCode' });
  const watchedPickupWard = useWatch({ control, name: 'pickupWardCode' });
  const watchedPickupLine = useWatch({ control, name: 'pickupAddressLine' });
  const watchedDeliveryProvince = useWatch({ control, name: 'deliveryProvinceCode' });
  const watchedDeliveryWard = useWatch({ control, name: 'deliveryWardCode' });
  /*
   * Chuỗi địa chỉ để XEM TRƯỚC ở bước Xác nhận. Server mới là nơi ghép chuỗi lưu xuống DB, nhưng
   * hook này gọi đúng `formatAddress` của `@xeprime/domain` — cùng một hàm — nên thứ khách đọc
   * lúc soát lại là đúng thứ sẽ được lưu.
   */
  const pickupAddressPreview = useAddressPreview(
    watchedPickupProvince,
    watchedPickupWard,
    watchedPickupLine,
  );
  const deliveryAddressPreview = useAddressPreview(
    watchedDeliveryProvince,
    watchedDeliveryWard,
    watchedDeliveryLine,
  );

  /*
   * Kết quả CŨ phải biến mất trước khi kết quả mới hiện ra.
   *
   * Đổi ghim thì khoá query đổi ngay và TanStack Query tự trả `undefined`. Đổi CHỮ thì không:
   * khoá chỉ đổi sau 900ms debounce, nên trong quãng đó màn hình vẫn trưng quãng đường và phí
   * của địa chỉ trước — một con số nói về một chỗ khác hẳn chỗ đang gõ.
   *
   * Và nó cũng gác chính lượt HỎI: nguồn `manual` đổi ngay (blur trả ô về địa chỉ gõ tay đã chốt,
   * hay bấm "dùng đúng địa chỉ đã nhập") trong khi chuỗi debounce còn là chữ vừa gõ dở. Không gác
   * thì báo giá trả tiền tra đúng cái chuỗi không ai xác nhận.
   */
  const deliveryAddressSettled =
    deliveryPin != null || (watchedDeliveryLine?.trim() ?? '') === debouncedDeliveryAddress;
  const deliveryQ = useQuery({
    queryKey: queryKeys.marketplace.deliveryDistance(
      vehicleId,
      deliveryPin ? `${deliveryPin.lat},${deliveryPin.lng}` : debouncedDeliveryAddress,
    ),
    queryFn: () => fetchDeliveryDistance(vehicleId, debouncedDeliveryAddress, deliveryPin),
    enabled:
      isDelivery &&
      deliveryAvailable &&
      (deliveryPin != null ||
        (deliveryManual &&
          deliveryAddressSettled &&
          debouncedDeliveryAddress.length >= MIN_DELIVERY_ADDRESS_LENGTH)),
    // Vị trí một địa chỉ không đổi trong một phiên đặt xe — không có lý do gì hỏi lại.
    staleTime: 10 * 60_000,
    retry: false,
  });
  const deliveryAskable =
    deliveryPin != null ||
    (deliveryManual && (watchedDeliveryLine?.trim().length ?? 0) >= MIN_DELIVERY_ADDRESS_LENGTH);
  /** Kết quả trong tay có đúng là của địa chỉ/ghim ĐANG hiển thị không. */
  const deliveryCurrent = deliveryAskable && deliveryAddressSettled && !deliveryQ.isFetching;
  /** Chỉ "đang tính" khi thật sự có thứ để hỏi — địa chỉ còn quá ngắn thì không treo spinner. */
  const deliveryPending = deliveryAskable && !deliveryCurrent;
  const delivery = deliveryCurrent ? (deliveryQ.data ?? null) : null;

  // Bật từ NGAY bước Chuyến đi: chọn xong khoảng thuê là thấy tiền tạm tính, không phải đi hết một
  // bước nữa mới biết mình sắp trả bao nhiêu. Cùng câu hỏi (và cùng cache) với thẻ đặt xe.
  const quoteQ = usePublicQuote(vehicleId, quoteParams);

  /**
   * MÃ KHUYẾN MÃI — ADR 0046.
   *
   * Tham số chuyến dùng CHÍNH `quoteParams` mà báo giá dùng: hai bên phải nói về đúng một chuyến,
   * nếu không số giảm sẽ được tính trên một báo giá khác với báo giá đang hiện trên màn hình.
   * `null` khi chưa chọn đủ ⇒ ô áp mã tự ẩn (`PromoCodeField` trả `null`).
   *
   * Hook tự XÁC MINH LẠI mã khi chuyến đổi (thời gian, dịch vụ, lộ trình, gói) — xem docblock của
   * nó: giữ số giảm cũ là hiện một tổng tiền không tồn tại.
   */
  const promoTrip = quoteParams ? { vehicleId, ...quoteParams } : null;
  const promo = usePromoCode(promoTrip);
  /*
   * Chuyến KHÔNG có khoản thu trước thì không có dòng tiền nào để tài trợ vào (báo giá tạm tính,
   * thuê dài hạn chưa chốt lịch — ADR 0046 điều 2). Đọc từ `holdAmount` của SERVER, không tự suy
   * theo dịch vụ: điều kiện thật là "XePrime có thu đồng nào online không", và chỉ server biết.
   */
  const promoUnavailable = quoteQ.data != null && quoteQ.data.breakdown.fees?.holdAmount == null;

  /** Báo giá đã ÁP MÃ — nguồn duy nhất cho mọi con số trong bảng giá (`useQuoteWithPromo`). */
  const quoteWithPromo = useQuoteWithPromo(quoteQ.data, promo.applied?.fees);

  /*
   * Bảo hiểm ĐANG được chào cho báo giá này (ADR 0064): nền tảng có đối tác phát hành, chính sách
   * mở dòng đó, sản phẩm đang bật. Không còn chào ⇒ gỡ lựa chọn khỏi form để nó không đi lên server.
   * Lựa chọn của khách đến từ thẻ đặt xe; ở đây chỉ còn việc gỡ.
   */
  const deselectInsurance = useCallback(
    (kind: InsuranceProductKind) =>
      setValue(
        kind === INSURANCE_PRODUCT_KIND.VEHICLE_TRIP
          ? 'vehicleProtectionSelected'
          : 'personalAccidentSelected',
        false,
        { shouldValidate: true },
      ),
    [setValue],
  );
  useInsuranceOffer(
    quoteQ.data,
    listing?.vehicleType,
    {
      vehicleProtectionSelected: watchedVehicleProtection,
      personalAccidentSelected: watchedPersonalAccident,
    },
    deselectInsurance,
  );

  /*
   * Mã khuyến mãi phải được đánh giá lại cho ĐÚNG NGƯỜI sau lượt đăng nhập. Kết quả xem trước phụ
   * thuộc người đang xem (khách mới, lượt mỗi khách — ADR 0046 điều 5), nên số giảm thấy lúc CHƯA
   * đăng nhập không phải lời hứa cho tài khoản vừa vào.
   *
   * `promoToEvaluate` là mã còn chờ đánh giá: mã của bản nháp lúc dựng, mã khách vừa áp ở thẻ đặt
   * xe (`prefill`), hoặc mã đang áp lúc mời đăng nhập (ghi trong `requestSignIn`). Đánh giá MỘT lần,
   * khi đã hết chờ đăng nhập và chuyến đủ để hỏi giá. Không chép số giảm cũ — server đánh giá lại
   * (ADR 0046 điều 7).
   */
  const promoToEvaluate = useRef<string | null>(
    restoredDraft ? restoredDraft.promoCode : prefill?.promoCode?.trim() || null,
  );
  /*
   * Hộp đang TỰ KIỂM chuyến thẻ đặt xe đưa sang — xem khối "TỰ ĐI TIẾP KHI MỞ" phía dưới. Mở lại từ
   * bản nháp chờ đăng nhập thì không: bản nháp có đường đi tiếp riêng (`resumeTick`). Khai ở ĐÂY vì việc đánh giá mã phải CHỜ nó xong: khách chưa đăng nhập thì lượt
   * đi tiếp sẽ mời đăng nhập, và mã phải được đánh giá cho người VỪA vào — đánh giá ẩn danh trước
   * đó vừa là kết quả sai người (ADR 0046 điều 5), vừa tiêu mất mã trước khi bản nháp kịp giữ nó.
   */
  const [preparing, setPreparing] = useState(() => restoredDraft === null);
  const promoTripReady = promoTrip !== null;
  useEffect(() => {
    if (awaitingAuth || preparing || !promoTripReady) return;
    const code = promoToEvaluate.current;
    if (!code) return;
    promoToEvaluate.current = null;
    promo.apply(code);
  }, [awaitingAuth, preparing, promoTripReady, promo]);

  /**
   * Bằng lái của tài khoản — nạp ở bước bằng lái (nút Tiếp tục cần biết bằng đã hợp lệ cho chuyến
   * chưa) và ở màn Xem lại (thẻ giấy tờ hiện hạng + hạn của bằng đã xác thực). Cùng khoá cache với
   * bộ xác thực và với lượt soát của `continueToReview`, nên không gọi thêm lần nào.
   */
  const licenceQ = useDriverLicence({
    enabled: (step === 'licence' || (step === 'review' && needsLicence)) && Boolean(me),
  });
  const licenceReady =
    licenceTrip !== null &&
    licenceQ.data !== undefined &&
    evaluateDriverLicenceForTrip(licenceQ.data, licenceTrip) === DRIVER_LICENCE_TRIP_GATE.OK;

  /*
   * Bằng vừa hợp lệ cho CHUYẾN NÀY (máy đọc xong ngay tại bước) ⇒ tự sang màn Xem lại: không bắt
   * khách bấm "Tiếp tục" cho một bước đã xong. Không có vòng lặp: màn Xem lại không quay về đâu.
   *
   * Đổi bước NGAY TRONG render (mẫu "điều chỉnh state theo dữ liệu" của React) chứ không trong
   * effect — effect là thêm một vòng render hiện bước bằng lái đã xong. Effect chỉ còn hiện một lời
   * báo ngắn, để bước bằng lái không biến mất im lặng.
   */
  const [licenceAdvances, setLicenceAdvances] = useState(0);
  if (step === 'licence' && licenceReady && !licenceQ.isFetching) {
    setStep('review');
    setLicenceAdvances((n) => n + 1);
  }
  useEffect(() => {
    if (licenceAdvances > 0) void message.success(t('licence.verified'));
  }, [licenceAdvances, message, t]);

  /*
   * Kiểm khung giờ còn trống (preview — chốt thật là constraint DB lúc duyệt, ADR 0006). Mutation
   * chỉ lo LỜI BÁO; việc đi tiếp nằm ở `checkTripAndContinue`, nơi chờ được kết quả — lượt tự
   * chạy khi mở hộp cần biết lúc nào lượt kiểm đã xong hẳn.
   */
  const availabilityM = useMutation({
    mutationFn: () => {
      const v = getValues();
      return checkAvailability({
        vehicleId,
        pickupAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
        returnAt: v.returnAt ? appWallClockToIso(v.returnAt) : '',
      });
    },
    onSuccess: (res) => {
      // KHÔNG nói xe "đã được đặt" và không hé lộ đơn của người khác — chỉ nói khung giờ bận.
      setTripIssue(res.available ? null : { message: t('time.unavailable'), retryable: false });
    },
    onError: (e) => setTripIssue({ message: errorMessage(e), retryable: true }),
  });

  /**
   * Điền sẵn ĐỊA CHỈ GIAO XE — chạy MỘT LẦN sau khi mount.
   *
   * Thứ tự ưu tiên, và mỗi bậc là một loại bằng chứng khác nhau về ý định của khách:
   *   1. **Địa chỉ lần trước** (`localStorage`) — chính họ đã gõ và xác nhận ghim. Điền cả cụm,
   *      kể cả toạ độ, để họ không phải ghim lại chỗ cũ.
   *   2. **Tỉnh của chính chiếc xe**, rồi tới tỉnh đang lọc — chỉ điền được mã tỉnh, và mã đó
   *      không hiện ra ô nào: nó chỉ là giá trị dự phòng khi bản đồ không quy được tỉnh từ địa
   *      điểm khách chọn (xem `RenterAddressBlock`).
   *
   * Địa chỉ điền lại ở bậc 1 có kèm toạ độ, tức là đã XÁC NHẬN — `ConfirmedPlaceField` nhận nó
   * làm mốc ngay khi giá trị về (khối "nhận mốc từ bên ngoài"), nên cú blur đầu tiên không xoá
   * mất thứ vừa được điền hộ.
   *
   * Trong effect chứ không trong `defaultValues`: `localStorage` không tồn tại trên server, nên
   * đọc nó lúc render sẽ cho hai kết quả khác nhau giữa HTML server dựng và lần render đầu ở
   * client (cùng bẫy mà `rental-range-memory` đã ghi).
   *
   * `shouldDirty: false`: đây là GỢI Ý, không phải thao tác của người dùng. Đánh dấu form bẩn ở
   * đây sẽ làm mọi cảnh báo "còn thay đổi chưa lưu" bật lên khi khách mới chỉ mở hộp thoại.
   */
  const deliveryPrefilled = useRef(false);
  useEffect(() => {
    if (deliveryPrefilled.current) return;
    deliveryPrefilled.current = true;
    // Bản nháp (ADR 0060) và địa chỉ khách vừa xác nhận ở thẻ đặt xe (`prefill`) đều là địa chỉ
    // cho CHÍNH chuyến này — mới hơn mọi thứ nhớ từ lần đặt trước, nên không đè.
    if (restoredDraft || prefillDelivery) return;

    const remembered = readDeliveryAddress();
    if (remembered) {
      setValue('deliveryProvinceCode', remembered.provinceCode, { shouldDirty: false });
      setValue('deliveryWardCode', remembered.wardCode, { shouldDirty: false });
      setValue('deliveryAddressLine', remembered.addressLine, { shouldDirty: false });
      setValue('deliveryPlaceId', remembered.placeId, { shouldDirty: false });
      setValue('deliveryLatitude', remembered.latitude, { shouldDirty: false });
      setValue('deliveryLongitude', remembered.longitude, { shouldDirty: false });
      setValue('deliveryLocationSource', remembered.locationSource, { shouldDirty: false });
    }
    // Chạy một lần cho vòng đời của flow; `setValue` ổn định theo RHF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Mã tỉnh DỰ PHÒNG — điền khi hồ sơ xe đã về và ô vẫn còn trống.
   *
   * Tách khỏi effect trên vì nó phụ thuộc một thứ đến MUỘN: mở hộp thoại từ lưới kết quả thì
   * `listing` còn đang tải, nên một effect chạy-một-lần-lúc-mount sẽ chốt `null` và ô tỉnh vĩnh
   * viễn rỗng. Điều kiện "còn trống" đọc qua `getValues` trong thân effect, nên nó không bao giờ
   * đè lên tỉnh mà địa điểm khách chọn vừa ghi vào.
   */
  useEffect(() => {
    if (!vehicleProvinceCode) return;
    for (const name of ['deliveryProvinceCode', 'pickupProvinceCode'] as const) {
      if (!getValues(name)) setValue(name, vehicleProvinceCode, { shouldDirty: false });
    }
  }, [vehicleProvinceCode, getValues, setValue]);

  const submitM = useMutation({
    mutationFn: () => {
      const v = getValues();
      const withDriver = v.serviceType === SERVICE_TYPE.WITH_DRIVER;
      return submitBookingRequest({
        vehicleId,
        // KHÔNG có liên hệ: server đọc họ tên + SĐT đã xác minh từ tài khoản (ADR 0060).
        serviceType: v.serviceType,
        /*
         * Dài hạn KHÔNG gửi lịch: chỉ gói + nguyện vọng. Khoảng "trong 7 ngày tới" do server
         * tính từ lúc nhận yêu cầu, client không khai (ADR 0011).
         */
        ...(v.serviceType === SERVICE_TYPE.LONG_TERM
          ? {
              longTermPackageMonths: v.longTermPackageMonths ?? undefined,
              pickupPreference: v.pickupPreference,
              ...(v.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && v.requestedPickupDate
                ? { requestedPickupDate: v.requestedPickupDate.format('YYYY-MM-DD') }
                : {}),
            }
          : {
              pickupAt: v.pickupAt ? appWallClockToIso(v.pickupAt) : '',
              returnAt: v.returnAt ? appWallClockToIso(v.returnAt) : '',
            }),
        // Có tài xế: lộ trình + địa chỉ đón (+ điểm đến khi liên tỉnh); backend validate lại.
        ...(withDriver
          ? {
              routeType: v.routeType,
              /*
               * Chuỗi hiển thị do SERVER ghép từ các mảnh dưới — client không gửi lên.
               *
               * Mã tỉnh/xã chỉ gửi khi CÓ GIÁ TRỊ. DTO bên API khai `@IsOptional()` kèm
               * `@Length(2,2)`/`@Length(5,5)`, mà `@IsOptional` chỉ bỏ qua `null`/`undefined` —
               * một chuỗi RỖNG vẫn đi vào `@Length` và bật lỗi 400. Luồng này để mã xã rỗng theo
               * thiết kế (khách không được hỏi xã/phường), nên nếu gửi thẳng thì mọi yêu cầu có
               * địa chỉ đều bị từ chối.
               */
              ...(v.pickupProvinceCode ? { pickupProvinceCode: v.pickupProvinceCode } : {}),
              ...(v.pickupWardCode ? { pickupWardCode: v.pickupWardCode } : {}),
              pickupAddressLine: v.pickupAddressLine.trim(),
              ...(v.pickupPlaceId ? { pickupPlaceId: v.pickupPlaceId } : {}),
              ...(v.pickupLatitude != null && v.pickupLongitude != null
                ? { pickupLatitude: v.pickupLatitude, pickupLongitude: v.pickupLongitude }
                : {}),
              ...(v.routeType !== ROUTE_TYPE.IN_CITY && v.destination.trim()
                ? { destination: v.destination.trim() }
                : {}),
            }
          : {}),
        ...(!withDriver && v.pickupMethod === PICKUP_METHOD.DELIVERY
          ? {
              deliveryRequested: true,
              // Chuỗi rỗng KHÔNG được gửi — xem lý do ở khối địa chỉ đón phía trên.
              ...(v.deliveryProvinceCode ? { deliveryProvinceCode: v.deliveryProvinceCode } : {}),
              ...(v.deliveryWardCode ? { deliveryWardCode: v.deliveryWardCode } : {}),
              deliveryAddressLine: v.deliveryAddressLine.trim(),
              ...(v.deliveryPlaceId ? { deliveryPlaceId: v.deliveryPlaceId } : {}),
              ...(v.deliveryLatitude != null && v.deliveryLongitude != null
                ? {
                    deliveryLatitude: v.deliveryLatitude,
                    deliveryLongitude: v.deliveryLongitude,
                  }
                : {}),
            }
          : {}),
        ...(v.acceptedTerms && agreementCoversHostTerms ? { acceptedTerms: true } : {}),
        ...(v.vehicleProtectionSelected ? { vehicleProtectionSelected: true } : {}),
        ...(v.personalAccidentSelected ? { personalAccidentSelected: true } : {}),
        // Lời nhắn chỉ gửi khi có chữ — server cũng cắt khoảng trắng, đây là để payload sạch.
        ...(v.note.trim() ? { note: v.note.trim() } : {}),
        ...(v.customerName?.trim() ? { customerName: v.customerName.trim() } : {}),
        ...(v.customerPhone?.trim() ? { customerPhone: v.customerPhone.trim() } : {}),
        /*
         * Gửi CHUỖI MÃ, không gửi số giảm: server đánh giá lại và giữ lượt ở cửa kiểm thứ hai
         * (ADR 0046 điều 7). Một client gửi lên "giảm 5.000.000đ" thì không có gì phản đối nó.
         */
        ...(promo.appliedCode ? { promoCode: promo.appliedCode } : {}),
      });
    },
    onSuccess: async (receipt) => {
      // Đã gửi — bản nháp (nếu còn) không được mở lại hộp ở lần ghé trang sau.
      clearBookingDraft();
      setReceipt(receipt);
      /*
       * Nhớ địa chỉ giao xe CHỈ khi đã gửi thành công.
       *
       * Ghi lúc đang gõ dở sẽ đóng dấu một địa chỉ chưa hoàn chỉnh lên mọi lần đặt sau; ghi khi
       * gửi hỏng thì nhớ đúng cái địa chỉ vừa bị từ chối.
       */
      const v = getValues();
      if (v.pickupMethod === PICKUP_METHOD.DELIVERY && v.deliveryProvinceCode) {
        rememberDeliveryAddress({
          provinceCode: v.deliveryProvinceCode,
          wardCode: v.deliveryWardCode,
          addressLine: v.deliveryAddressLine,
          latitude: v.deliveryLatitude,
          longitude: v.deliveryLongitude,
          placeId: v.deliveryPlaceId,
          locationSource: v.deliveryLocationSource,
        });
      }
      // Chuyến mới phải hiện ngay ở "Chuyến của tôi", huy hiệu và số chuyến chưa khép của `/auth/me`.
      await queryClient.invalidateQueries();
      /*
       * Chuyến được NHẬN NGAY (xe "Đặt ngay") ⇒ khách sang thẳng TRANG THANH TOÁN của chuyến
       * (`/payment/:id`): chuyển khoản VietQR và ví điện tử ở cùng một chỗ, đồng hồ đang chạy, và
       * đó cũng là trang cổng quay về. Một màn QR trong hộp thoại thì mất khi lỡ tay đóng, và không
       * có chỗ cho các kênh trả khác.
       */
      if (receipt.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && receipt.id) {
        onClose();
        router.push(paymentPath.trip(receipt.id));
        return;
      }
      setStep('done');
    },
    onError: (e) => {
      const code = getErrorCode(e);
      if (code === API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE) {
        setDuplicate(true);
        return;
      }
      if (code === API_ERROR_CODE.SHOP_ACCOUNT_CANNOT_BOOK) {
        setBlocked('shopAccount');
        return;
      }
      if (code === API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE) {
        setBlocked('ownVehicle');
        return;
      }
      if (code === API_ERROR_CODE.HOLD_LIMIT_REACHED) {
        setSubmitHitHoldLimit(true);
        void queryClient.invalidateQueries({ queryKey: queryKeys.trips.unpaidHolds() });
        return;
      }
      /*
       * MÃ KHUYẾN MÃI bị SERVER từ chối ở cửa gửi (ADR 0046) — mã vừa hết lượt, hoặc điều kiện
       * vừa đổi. `rejectByServer` bỏ mã và bật dòng cảnh báo trong ô áp mã; lượt gửi KHÔNG đi
       * tiếp, và khách bấm lại với con số đã cập nhật.
       *
       * Không hiện thêm một lỗi chung ở đây: giao diện đã nói đúng chỗ (ngay cạnh ô mã), và một
       * alert thứ hai chỉ làm người ta đi tìm hai vấn đề khác nhau.
       */
      if (promo.rejectByServer(e)) {
        void quoteQ.refetch();
        setStepError(null);
        return;
      }
      /*
       * Phiên vừa hết hạn giữa chừng ⇒ mời đăng nhập lại ngay tại đây, GIỮ NGUYÊN mọi thứ đã nhập;
       * đăng nhập xong luồng tự kiểm lại rồi về màn Xem lại để khách bấm gửi lại.
       */
      if (isUnauthenticated(e)) {
        setStep('check');
        setStepError(null);
        setAgreementMissing(false);
        requestSignIn();
        return;
      }
      /*
       * Server nói SĐT của tài khoản chưa xác minh trong khi `/auth/me` đang giữ bản cũ. Làm mới
       * nó và mở hộp xác minh số ngay trên hộp này; xác minh xong lượt gửi tự đi tiếp. Lỗi vẫn
       * hiện để khách bấm "Để sau" còn biết vì sao chưa gửi được.
       */
      if (code === API_ERROR_CODE.PHONE_NOT_VERIFIED) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
        askAccountPhone();
        setStepError(errorMessage(e));
        return;
      }
      /*
       * Cổng BẰNG LÁI ở server (ADR 0057) nói "chưa" trong khi giao diện tưởng là "được" — bằng
       * vừa hết hạn, vừa bị thay. Lùi về bước bằng lái với dữ liệu MỚI, giữ nguyên mọi thứ khách
       * đã nhập.
       */
      if (isDriverLicenceGateErrorCode(code)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.driverLicence.overview });
        setStepError(null);
        setStep('licence');
        return;
      }
      setStepError(errorMessage(e));
    },
  });

  const submitting = submitM.isPending;

  // Đẩy trạng thái "đang gửi" ra vỏ để nó khoá Esc/bấm nền trong lúc request đang bay.
  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);

  /*
   * Chạm trần giữ chỗ — chỉ chặn khi còn đang ĐIỀN form: màn "đã gửi" của một yêu cầu vừa thành công
   * không được bị thay bằng lời nhắc chỉ vì lượt đọc lại sau đó thấy đủ trần. Có dữ liệu thì tin dữ
   * liệu (trả xong là mở lại); chưa có (khách chưa có phiên) thì tin câu trả lời của server.
   */
  const holdLimitBlocked =
    step !== 'done' && (unpaidHolds.data ? unpaidHolds.data.limitReached : submitHitHoldLimit);

  /**
   * Lượt kiểm khi mở dừng lại ở một LỜI BÁO (mời đăng nhập, chuyến không đi tiếp được) — một thẻ
   * vài dòng, nên vỏ thu về hộp `md` như các lời báo khác. Vòng chờ vẫn ở khung lớn: nó sắp nhường
   * chỗ cho màn Xem lại.
   */
  const checkNotice = step === 'check' && !preparing && (awaitingAuth || tripIssue !== null);
  const result: RequestBookingResult | null =
    step === 'done' && receipt
      ? 'sent'
      : duplicate || blocked !== null || holdLimitBlocked || checkNotice
        ? 'notice'
        : null;
  useEffect(() => {
    onResultChange?.(result);
  }, [result, onResultChange]);

  /*
   * Hộp còn mở hay không. Lượt kiểm khi mở có nhiều chặng chờ mạng (kiểm khung giờ, soát bằng lái),
   * và khách có thể đóng hộp giữa chừng — nhất là ở lượt TỰ ĐI TIẾP khi mở, lúc họ chỉ thấy một vòng
   * chờ. Chạy tiếp sau khi hộp đã đóng là giữ bản nháp + bật hộp đăng nhập trên một trang khách vừa
   * bỏ đi, rồi `RequestBookingButton` mở lại hộp sau khi họ đăng nhập. Mỗi chặng sau `await` hỏi
   * cờ này trước khi đổi bước hay mời đăng nhập.
   */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Chuyến đã qua lượt kiểm. Chưa đăng nhập ⇒ giữ bản nháp + mời đăng nhập (ADR 0060). Đã đăng nhập
   * ⇒ đi tiếp tới bằng lái / Xem lại — kể cả khi chưa có SĐT đã xác minh: số được hỏi ở nút GỬI
   * (ADR 0071), sau khi khách đã xem hết chuyến, giá và điền liên hệ.
   */
  async function afterTripStep() {
    if (!alive.current) return;
    if (!me) {
      requestSignIn();
      return;
    }
    await continueToReview();
  }

  /**
   * Mở hộp xác minh SĐT của vỏ site, điền sẵn SĐT liên hệ khách vừa gõ ở màn Xem lại (tài khoản
   * Google/Facebook chưa có số nào khác). Xác minh xong ⇒ lượt gửi đi tiếp; "Để sau" ⇒ ở lại.
   */
  function askAccountPhone() {
    promptAccountPhone?.({
      phone: getValues('customerPhone'),
      onVerified: () => setSubmitAfterPhone(true),
    });
  }

  /**
   * Mời đăng nhập / đăng ký NGAY trên hộp này, giữ nguyên thứ khách đã nhập.
   *
   * Chỉ hiện LỜI MỜI — hộp đăng nhập mở khi khách bấm "Đăng nhập" (`openSignIn`), để không chồng
   * hai hộp lên nhau. Bản nháp ghi ngay từ đây: nút Google/Facebook rời trang ngay khi bấm, và lúc
   * đó không còn lượt render nào để ghi kịp. Không có yêu cầu nào được gửi, không có phiên khách
   * vãng lai nào được cấp ở bước này.
   */
  function requestSignIn() {
    /*
     * Mã đang áp, hoặc mã CÒN CHỜ đánh giá (của thẻ đặt xe / bản nháp) — mất nó ở đây là âm thầm bỏ
     * mã của khách, đúng thứ ADR 0046 điều 7 cấm.
     */
    const pendingPromo = promo.appliedCode ?? promoToEvaluate.current;
    saveBookingDraft(vehicleId, {
      values: getValues(),
      rentalMode,
      promoCode: pendingPromo,
    });
    promoToEvaluate.current = pendingPromo;
    setAwaitingAuth(true);
    setSignInRequestedAt(Date.now());
  }

  /** Nút "Đăng nhập" của lời mời — ghi lại bản nháp (mã có thể vừa đổi) rồi mở hộp đăng nhập. */
  function openSignIn() {
    requestSignIn();
    authModal.open({ mode: AUTH_MODE.LOGIN, context: AUTH_CONTEXT.BOOKING });
  }

  /*
   * QUAY LẠI SAU ĐĂNG NHẬP — đang chờ đăng nhập mà phiên đã có ⇒ đi tiếp đúng từ chỗ dừng: kiểm
   * lại dữ liệu + khung giờ (có thể đã có người khác giữ trong lúc họ đăng nhập), rồi bằng lái, rồi
   * Xem lại. Không TỰ GỬI gì — khách vẫn tự bấm "Gửi yêu cầu", nên đăng nhập
   * lại hay quay về sau Google/Facebook không bao giờ sinh thêm một yêu cầu.
   *
   * Tài khoản chưa có SĐT đã xác minh (vừa vào bằng Google/Facebook) cũng đi tiếp: số được hỏi ở
   * nút GỬI (ADR 0071).
   *
   * Đổi state NGAY TRONG render (cùng mẫu với bước bằng lái ở trên) để mỗi lượt đăng nhập kích
   * đúng MỘT lần đi tiếp; effect chỉ chạy phần bất đồng bộ.
   */
  const [resumeTick, setResumeTick] = useState(0);
  if (awaitingAuth && me && meQuery.dataUpdatedAt > signInRequestedAt) {
    setAwaitingAuth(false);
    setStepError(null);
    setTripIssue(null);
    setResumeTick((n) => n + 1);
  }
  /*
   * Gửi tiếp sau khi xác minh SĐT — chờ `/auth/me` làm mới mang số đã xác minh, không thì
   * `submitRequest` lại thấy bản cũ và hỏi số lần nữa.
   */
  const [submitTick, setSubmitTick] = useState(0);
  if (submitAfterPhone && me?.phoneVerified) {
    setSubmitAfterPhone(false);
    setSubmitTick((n) => n + 1);
  }

  /**
   * Thuê tự lái/dài hạn thì soát bằng lái cho CHÍNH chuyến này trước màn Xem lại — đã hợp lệ
   * thì khách không thấy bước bằng lái bao giờ. Đọc mới từ server (không dùng cache): khách có
   * thể vừa nộp bằng ở một tab khác.
   */
  async function continueToReview() {
    if (!needsLicence || !licenceTrip) {
      setStep('review');
      return;
    }
    try {
      const overview = await queryClient.fetchQuery({
        queryKey: queryKeys.driverLicence.overview,
        queryFn: fetchDriverLicenceOverview,
        staleTime: 0,
      });
      if (!alive.current) return;
      const gate = evaluateDriverLicenceForTrip(overview, licenceTrip);
      setStep(gate === DRIVER_LICENCE_TRIP_GATE.OK ? 'review' : 'licence');
    } catch (error) {
      if (!alive.current) return;
      // Phiên vừa mất: mời đăng nhập lại thay vì để khách bấm "Thử lại" vào một lỗi 401 mãi mãi.
      if (isUnauthenticated(error)) {
        requestSignIn();
        return;
      }
      // Lỗi khác: bộ xác thực tự hiện lỗi tải + nút Thử lại.
      setStep('licence');
    }
  }

  /**
   * Lượt KIỂM chuyến thẻ đặt xe đưa sang — kiểm dữ liệu, kiểm khung giờ còn trống, rồi mới quyết
   * định mời đăng nhập hay đi tiếp tới bằng lái / Xem lại. Không đổi state nào trước lượt `await`
   * đầu tiên — nên lượt tự chạy khi mở và lượt quay lại sau đăng nhập (các effect bên dưới) gọi
   * thẳng được mà không thành một vòng render xếp tầng.
   *
   * Trả câu lỗi khi DỮ LIỆU chuyến không hợp lệ (nơi gọi đưa vào `reportInvalidTrip`), `null` khi
   * đã đi tiếp hoặc lời báo đã do lượt kiểm khung giờ nói.
   */
  async function checkTripAndContinue(): Promise<string | null> {
    const fields: Array<keyof RequestFormValues> = isLongTerm
      ? ['longTermPackageMonths', 'pickupPreference', 'requestedPickupDate']
      : ['pickupAt', 'returnAt'];
    /*
     * Địa chỉ giao/đón cũng là một phần của chuyến — schema tự bỏ qua trường không liên quan. Cặp
     * TOẠ ĐỘ có mặt ở đây cùng phần chữ để luật của schema về chúng (nếu có) được áp ở đúng cửa này.
     */
    fields.push(
      'deliveryAddressLine',
      'deliveryLatitude',
      'deliveryLongitude',
      'pickupAddressLine',
      'pickupLatitude',
      'pickupLongitude',
      'destination',
    );

    const valid = await trigger(fields);
    if (!alive.current) return null;
    if (!valid) {
      /*
       * Không có ô nào ở đây để gạch đỏ — chuyến được chọn ở thẻ đặt xe. Nói câu lỗi ĐẦU TIÊN của
       * schema (cùng câu mà ô ở thẻ sẽ nói) và mời khách chọn lại ở đó.
       */
      const reason = fields.map((name) => getFieldState(name).error?.message).find(Boolean);
      return reason ?? t('check.invalid');
    }

    /*
     * Dài hạn chưa có khung giờ cụ thể để kiểm lịch: khách mới nêu nguyện vọng, gian hàng chốt
     * ngày giờ khi duyệt và constraint DB mới là chỗ chặn trùng lịch (ADR 0006).
     */
    if (isLongTerm) {
      await afterTripStep();
      return null;
    }
    // Lỗi mạng/API đã được `onError` của mutation nói ra — ở đây chỉ dừng, không đi tiếp.
    const result = await availabilityM.mutateAsync().catch(() => null);
    if (result?.available && alive.current) await afterTripStep();
    return null;
  }

  // Phần bất đồng bộ của lượt QUAY LẠI SAU ĐĂNG NHẬP (xem `resumeTick` ở trên) — đặt sau
  // `checkTripAndContinue` vì effect đọc nó.
  useEffect(() => {
    if (resumeTick === 0) return;
    clearBookingDraft();
    // Lời đồng ý điều khoản là của MỘT người — người vừa đăng nhập tự tick lại ở bước Xác nhận.
    setValue('acceptedTerms', false);
    void checkTripAndContinue().then(reportInvalidTrip);
    // Chỉ chạy cho MỖI lượt quay lại mới; `checkTripAndContinue` đọc form qua `trigger`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeTick]);

  /*
   * TỰ ĐI TIẾP KHI MỞ — thẻ đặt xe chỉ mở hộp khi chuyến đã đủ, nên hộp chạy ngay lượt kiểm: kiểm dữ
   * liệu, kiểm khung giờ, mời đăng nhập nếu chưa có phiên, soát bằng lái. Không bao giờ GỬI gì
   * (ADR 0060) — khách vẫn tự bấm ở màn Xem lại.
   *
   * Chờ hai thứ trước khi chạy: hồ sơ xe (loại xe quyết định bằng lái nào hợp lệ) và `/auth/me`
   * (chạy khi phiên còn đang nạp là mời một người ĐÃ đăng nhập đăng nhập lại). Bản nháp chờ đăng
   * nhập có đường đi tiếp riêng (`resumeTick`) nên không chạy chồng lên nó.
   *
   * Trong lúc chạy, hộp hiện trạng thái chờ.
   */
  const autoContinueStarted = useRef(false);
  const listingSettled = listing !== null || listingQ.isError;
  const meSettled = !meQuery.isPending;
  useEffect(() => {
    if (!preparing || autoContinueStarted.current || !listingSettled || !meSettled) return;
    autoContinueStarted.current = true;
    void checkTripAndContinue()
      .then(reportInvalidTrip)
      .finally(() => setPreparing(false));
    // Chạy MỘT lần trong vòng đời của hộp; `checkTripAndContinue` đọc form qua `trigger`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparing, listingSettled, meSettled]);

  /** Chạy lại lượt kiểm sau một lỗi MẠNG (`tripIssue.retryable`) — chuyến giữ nguyên. */
  function retryCheck() {
    setTripIssue(null);
    setPreparing(true);
    void checkTripAndContinue()
      .then(reportInvalidTrip)
      .finally(() => setPreparing(false));
  }

  /**
   * Khoá gửi ĐỒNG BỘ. `submitting` (= `isPending`) chỉ đổi ở lượt render SAU — TanStack Query báo
   * cho component qua một nhịp hẹn giờ — nên hai cú bấm trong cùng một nhịp đều thấy `false` và
   * cùng gửi. Index chống trùng ở DB vẫn là chốt cuối; khoá này để khách không nhận một lỗi
   * "đã gửi trùng" cho chính cú bấm đúp của mình.
   */
  const submitLock = useRef(false);
  /**
   * Khách bấm gửi mà chưa tick đồng ý. Câu nhắc chỉ hiện khi ô VẪN chưa tick (`watchedAccepted`) —
   * tick xong là câu tự biến mất, không cần một effect dọn lỗi.
   */
  const [agreementMissing, setAgreementMissing] = useState(false);
  async function submitRequest() {
    if (submitLock.current || submitting) return;
    setStepError(null);
    /*
     * Ô đồng ý của màn Xem lại (design v2) là BẮT BUỘC cho mọi chuyến; khi chủ xe có điều khoản
     * riêng, CÙNG ô đó phủ luôn điều khoản ấy (`bookingCheckHost`) và server kiểm lại khi xe bắt
     * buộc (`RENTAL_TERMS_ACCEPTANCE_REQUIRED`).
     */
    if (!getValues('acceptedTerms')) {
      setAgreementMissing(true);
      return;
    }
    // Khoá TRƯỚC lượt chờ kiểm lời nhắn — cú bấm thứ hai trong lúc chờ không được lọt qua.
    submitLock.current = true;
    // Lời nhắn + liên hệ người thuê (họ tên, SĐT) — lỗi thì báo dưới ô, không gửi.
    if (!(await trigger(['note', 'customerName', 'customerPhone']))) {
      submitLock.current = false;
      return;
    }
    /*
     * Tài khoản chưa có SĐT đã xác minh (ADR 0071) — hỏi NGAY đây, sau khi mọi ô đã hợp lệ: khách
     * đã xem hết chuyến, giá và vừa gõ SĐT liên hệ. Ngoài vỏ site khách (không có hộp) thì gửi luôn,
     * server trả `PHONE_NOT_VERIFIED`.
     */
    if (me && !me.phoneVerified && promptAccountPhone) {
      submitLock.current = false;
      askAccountPhone();
      return;
    }
    submitM.mutate(undefined, {
      onSettled: () => {
        submitLock.current = false;
      },
    });
  }

  // Lượt gửi tiếp sau khi xác minh SĐT (xem `submitTick`) — vẫn qua đủ các phép kiểm của nút gửi.
  useEffect(() => {
    if (submitTick > 0) void submitRequest();
    // Chỉ chạy cho MỖI lượt xác minh mới; `submitRequest` đọc form qua `getValues`/`trigger`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitTick]);

  const summaryPanel = (
    <VehicleSummaryPanel
      listing={listing}
      fallbackName={vehicleName}
      fallbackImageUrl={vehicleImageUrl}
      loading={listingQ.isLoading}
      // Panel nói giá của ĐÚNG dịch vụ/gói khách đang chọn, không phải giá tự lái mặc định.
      serviceType={watchedService}
      packageMonths={watchedPackage}
      compactOnMobile
    />
  );

  const hasRange = Boolean(watchedPickup && watchedReturn);
  /** Đã chọn đủ để server báo giá được chưa. */
  const hasPriceSelection = isLongTerm ? watchedPackage != null : hasRange;

  const priceProps = {
    listing,
    serviceType: watchedService,
    routeType: watchedRoute,
    quote: quoteWithPromo,
    quoteLoading: quoteQ.isLoading,
    hasSelection: hasPriceSelection,
    isDelivery,
    // Màn Xem lại có hai thẻ tiền riêng — không có bảng thu/mở.
    expanded: false,
  };
  /*
   * Cọc thế chấp khi nhận xe là ĐIỀU KIỆN nhận xe, không phải một khoản trả cho XePrime — ở màn
   * Xem lại nó nằm trong thẻ "Giấy tờ & điều kiện nhận xe", thẻ tiền bên phải không nhắc lại.
   * Cùng mô hình với thẻ tiền (`useCustomerCostView`) nên hình thức + số tiền không lệch nhau.
   */
  const { deposit: pickupDeposit } = useCustomerCostView({
    listing,
    breakdown: hasPriceSelection ? (quoteWithPromo?.breakdown ?? null) : null,
    isDelivery,
  });

  /** Ô áp mã khuyến mãi — trong thẻ chi phí của màn Xem lại. */
  const promoField = (
    <PromoCodeField
      trip={promoTrip}
      appliedCode={promo.appliedCode}
      applied={promo.applied}
      checking={promo.checking}
      reason={promo.reason}
      unavailable={promoUnavailable}
      droppedCode={promo.droppedCode}
      onApply={promo.apply}
      onRemove={promo.remove}
    />
  );

  /** Ngày trả DỰ KIẾN của gói khi khách đã chọn ngày nhận cụ thể — giờ chốt khi gian hàng duyệt. */
  const expectedReturnDate =
    watchedPackage != null && watchedRequestedDate
      ? longTermReturnFromWallClock(watchedRequestedDate, watchedPackage)
      : null;

  /*
   * Chuyến này có khoản thu trước (tiền giữ chỗ) không — đọc từ báo giá SERVER (ADR 0044 điều 4).
   * Luật "chưa có báo giá thì coi như có" nằm ở `hasHoldStage`, dùng chung với màn chuyến chờ duyệt.
   */
  const quoteHasHold = quoteQ.data?.breakdown.fees?.holdAmount != null;
  const hasHoldStage = hasHoldStageOf(quoteQ.data?.breakdown);
  /*
   * Chuyện xảy ra sau khi gửi — "Đặt ngay" do server xem trước (`quote.autoAccept`), không suy theo
   * dịch vụ. Đặt ngay mà KHÔNG có tiền giữ chỗ (có tài xế, gian hàng tắt thu cọc…) thì đơn ra đời
   * ngay lúc nhận (ADR 0044 điều 4) — không có bước thanh toán nào để hứa.
   */
  const nextStep: BookingReviewNextStep = quoteQ.data?.autoAccept?.eligible
    ? quoteHasHold
      ? 'instantHold'
      : 'instantConfirmed'
    : quoteHasHold
      ? 'hold'
      : 'general';

  /*
   * --- Tài khoản không đặt xe được: chiếm trọn hộp thoại, có lối đi tiếp --------------------
   *
   * Hai lối, và chúng là hai VIỆC KHÁC NHAU:
   *   • "Dùng tài khoản khác"  — đăng xuất rồi quay lại chính trang xe này. Câu chữ phải nói rõ
   *     "số điện thoại KHÁC", vì `users.phone` là unique: đăng xuất rồi đặt lại bằng chính số
   *     của mình sẽ bị chặn lần thứ hai và người dùng không hiểu tại sao.
   *   • "Quản lý gian hàng"    — họ vào nhầm vai; đưa họ về đúng khu làm việc.
   *
   * Ca `ownVehicle` KHÔNG mời đổi tài khoản: đổi xong vẫn không phải điều họ muốn làm.
   */
  if (blocked) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ExclamationOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t(`blocked.${blocked}.title`)}</h3>
          <p className={styles.doneText}>{t(`blocked.${blocked}.body`)}</p>
          <div className={styles.doneActions}>
            {blocked === 'shopAccount' ? (
              <Button
                type="primary"
                size="large"
                block
                onClick={() => {
                  onClose();
                  router.push(ROUTES.MANAGE.ROOT);
                }}
              >
                {t('blocked.shopAccount.manage')}
              </Button>
            ) : null}
            <Button size="large" block onClick={onClose}>
              {t('blocked.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * --- Đã giữ đủ số chuyến chưa thanh toán: nhắc trả, không cho đặt thêm ----------------------
   *
   * Việc cần làm thuộc về KHÁCH — trả tiền hoặc huỷ bớt — nên màn này đưa họ tới đúng việc đó:
   * danh sách chuyến đang giữ (gấp nhất trước) với một nút trả cho từng chuyến, rồi lối sang
   * "Chuyến của tôi" nơi có cả nút huỷ. Không phải một dòng lỗi cạnh nút gửi: khách cần biết vì sao
   * và làm gì, một câu lỗi không nói được hai điều đó.
   */
  if (holdLimitBlocked) {
    const limitData = unpaidHolds.data;
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ClockCircleOutlined />
          </span>
          <h3 className={styles.doneTitle}>
            {limitData
              ? tTrips('unpaid.limitTitle', { limit: limitData.limit })
              : tTrips('unpaid.limitTitleFallback')}
          </h3>
          <p className={styles.doneText}>
            {limitData
              ? tTrips('unpaid.limitBodyBooking', { limit: limitData.limit })
              : tTrips('unpaid.limitBodyFallback')}
          </p>
          {limitData && limitData.items.length > 0 ? (
            <div className={styles.holdLimitList}>
              <UnpaidHoldList items={limitData.items} onNavigate={onClose} />
            </div>
          ) : null}
          <div className={cx(styles.doneActions, styles.doneActionsRow, styles.doneActionsPair)}>
            <Button
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              {tTrips('unpaid.viewTrips')}
            </Button>
            <Button size="large" block onClick={onClose}>
              {t('blocked.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Trạng thái trùng lặp: chiếm trọn thân hộp thoại, có hai lối đi tiếp ------------------
  if (duplicate) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ExclamationOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t('duplicate.title')}</h3>
          <p className={styles.doneText}>{t('duplicate.body')}</p>
          <div className={styles.doneActions}>
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              {t('duplicate.viewTrips')}
            </Button>
            <Button size="large" block onClick={onClose}>
              {t('duplicate.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /** Chuyến đang chọn — MỘT bản cho màn Xem lại và hộp "Đã gửi yêu cầu" (`BookingTripCard`). */
  const tripSummary: BookingTrip = {
    serviceType: watchedService,
    routeType: watchedRoute,
    rentalMode,
    pickupAt: watchedPickup ?? null,
    returnAt: watchedReturn ?? null,
    packageMonths: watchedPackage ?? null,
    pickupPreference: watchedPreference,
    requestedPickupDate: watchedRequestedDate ?? null,
    expectedReturnDate,
    isDelivery,
    deliveryAddress: deliveryAddressPreview ?? null,
    driverPickupAddress: pickupAddressPreview ?? null,
    destination: getValues('destination')?.trim() || null,
  };

  // --- Đã gửi xong (Figma `19759:22026`): kết quả, không phải một bước biểu mẫu ----------------
  if (step === 'done' && receipt) {
    /*
     * Màn này chỉ còn cho yêu cầu KHÔNG cần trả tiền giữ chỗ ngay: chuyến được nhận ngay mà có tiền
     * giữ chỗ đã sang trang thanh toán `/payment/:id` từ `onSuccess`.
     */
    return (
      <BookingSuccessStep
        vehicleId={vehicleId}
        listing={listing}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleThumbUrl}
        trip={tripSummary}
        receipt={receipt}
        breakdown={quoteWithPromo?.breakdown ?? null}
        onClose={onClose}
      />
    );
  }

  // --- Đang kiểm chuyến thẻ đặt xe đưa sang — chờ ------------------------------------------
  if (preparing) {
    return (
      <div className={styles.preparing} role="status" aria-live="polite">
        <Spin size="large" />
        <p className={styles.preparingText}>{t('preparing')}</p>
      </div>
    );
  }

  // --- Màn Xem lại (Figma `19727:55409`) — chiếm trọn thân hộp thoại, hai cột riêng ---------
  if (step === 'review') {
    return (
      <BookingReviewStep
        listing={listing}
        vehicleName={vehicleName}
        vehicleImageUrl={vehicleThumbUrl}
        trip={tripSummary}
        /*
          Quãng đường + phí giao DỰ KIẾN nhắc lại ở lần soát cuối: con số này KHÔNG nằm trong tổng
          (ADR 0018, chủ xe chốt lúc duyệt), nên nếu nó biến mất ở đây thì khách gửi mà không còn
          thấy khoản duy nhất có thể phát sinh thêm — hay cảnh báo "ngoài phạm vi".
        */
        deliveryEstimate={
          isDelivery ? <DeliveryEstimate pending={deliveryPending} result={delivery} /> : null
        }
        renter={me ?? null}
        control={control}
        licence={{ required: needsLicence, current: licenceQ.data?.verified ?? null }}
        hostTerms={
          activeTerms
            ? { text: activeTerms.termsText ?? null, documents: activeTerms.requiredDocuments }
            : null
        }
        deposit={pickupDeposit}
        agreementCoversHostTerms={agreementCoversHostTerms}
        journey={<BookingJourney current="request" hasHoldStage={hasHoldStage} />}
        costs={
          <>
            <BookingPriceSummary {...priceProps} variant="review" promoSlot={promoField} />
            {/*
              Đặt sát giờ ⇒ hạn thanh toán ngắn, có thể không có huỷ miễn phí — nói TRƯỚC khi gửi
              (ADR 0032 điều 5 · ADR 0064). Dài hạn chưa có giờ nhận nên không ước được.
            */}
            {watchedService === SERVICE_TYPE.LONG_TERM ? null : (
              <NearPickupHoldNotice
                pickupAt={watchedPickup}
                fees={quoteWithPromo?.breakdown.fees}
              />
            )}
          </>
        }
        nextStep={nextStep}
        agreementMissing={agreementMissing && !watchedAccepted}
        stepError={stepError}
        submitting={submitting}
        onSubmit={() => void submitRequest()}
      />
    );
  }

  // --- Bằng lái chưa hợp lệ cho chuyến (ADR 0057) — trước màn Xem lại ---------------------
  if (step === 'licence' && licenceTrip) {
    return (
      <div className={styles.layout}>
        <div className={styles.left}>{summaryPanel}</div>

        <div className={styles.right}>
          {/* Bằng lái nằm TRƯỚC màn Xem lại, nhưng không phải ai cũng qua nó — không có chặng riêng. */}
          <BookingJourney current="request" hasHoldStage={hasHoldStage} />

          <section className={styles.stepBody}>
            <h3 className={styles.otpTitle}>{t('licence.title')}</h3>
            <DriverLicenceVerifier trip={licenceTrip} />
            {stepError ? (
              <Alert type="error" showIcon title={stepError} className={styles.err} role="alert" />
            ) : null}
          </section>

          <div className={styles.dock}>
            <footer className={styles.footer}>
              <Button onClick={onClose}>{t('actions.cancel')}</Button>
              {/* Chỉ mở khi bằng đã hợp lệ CHO CHUYẾN NÀY — cùng phép soát với cổng ở server. */}
              <Button type="primary" disabled={!licenceReady} onClick={() => setStep('review')}>
                {t('actions.continue')}
              </Button>
            </footer>
          </div>
        </div>
      </div>
    );
  }

  /*
   * --- Chưa có phiên: lời mời đăng nhập ---------------------------------------------------
   *
   * Chuyến đã được giữ vào bản nháp (`requestSignIn`). Hộp đăng nhập chỉ mở khi khách bấm
   * "Đăng nhập"; đóng nó mà chưa vào thì vẫn bấm mở lại được.
   */
  if (awaitingAuth) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={styles.doneBadge} aria-hidden>
            <UserOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t('check.signInTitle')}</h3>
          <p className={styles.doneText}>{t('check.signInBody')}</p>
          <div className={styles.doneActions}>
            <Button type="primary" size="large" block onClick={openSignIn}>
              {t('check.signIn')}
            </Button>
            <Button size="large" block onClick={onClose}>
              {t('actions.cancel')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * --- Chuyến không đi tiếp được (khung giờ bận, dữ liệu không hợp lệ, lỗi mạng) ---------
   *
   * Hộp không có ô nào để sửa: chuyến là của thẻ đặt xe. "Chọn lại" đóng hộp để khách sửa ở đó;
   * lỗi MẠNG thì có thêm "Thử lại" vì chuyến không có gì sai.
   */
  if (tripIssue) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ExclamationOutlined />
          </span>
          <h3 className={styles.doneTitle}>{t('check.issueTitle')}</h3>
          <p className={styles.doneText} role="alert">
            {tripIssue.message}
          </p>
          <div className={styles.doneActions}>
            {tripIssue.retryable ? (
              <Button type="primary" size="large" block onClick={retryCheck}>
                {t('check.retry')}
              </Button>
            ) : null}
            <Button
              type={tripIssue.retryable ? 'default' : 'primary'}
              size="large"
              block
              onClick={onClose}
            >
              {t('check.chooseAgain')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Giữa hai chặng của lượt kiểm (vd vừa đăng nhập xong, đang kiểm lại) — vẫn là vòng chờ.
  return (
    <div className={styles.preparing} role="status" aria-live="polite">
      <Spin size="large" />
      <p className={styles.preparingText}>{t('preparing')}</p>
    </div>
  );
}
