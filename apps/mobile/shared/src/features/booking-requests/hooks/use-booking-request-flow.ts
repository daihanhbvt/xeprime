import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  addDateKeyDays,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  SERVICE_TYPE,
  vnDateKey,
} from '@xeprime/types';
import { STALE_TIME } from '@xeprime/api-client';
import {
  buildBusyDayIndex,
  isDriverLicenceGateErrorCode,
  type BusyDayIndex,
} from '@xeprime/domain';
import { getErrorCode } from '@/lib/api-client';
import { queryKeys } from '@/queries/query-keys';
import {
  bookingRequestsApi,
  BUSY_DAYS_LOOKAHEAD,
  publicQuote,
  deliveryDistance,
  type BookingRequestReceipt,
  type CreateBookingRequestInput,
  type PublicQuote,
  type PublicQuoteParams,
} from '../api';

/**
 * Các bước của luồng gửi yêu cầu — cùng tên với web (`trip → licence → review → done`).
 *
 * Không còn bước OTP (ADR 0060): gửi yêu cầu cần TÀI KHOẢN KHÁCH đã đăng nhập có SĐT đã xác minh.
 *
 * `licence` (ADR 0057) chỉ có ở thuê tự lái/dài hạn khi bằng lái của tài khoản CHƯA hợp lệ cho
 * chuyến này — bằng đã hợp lệ thì khách không bao giờ thấy bước đó.
 */
export const REQUEST_STEP = {
  TRIP: 'trip',
  LICENCE: 'licence',
  REVIEW: 'review',
  DONE: 'done',
} as const;

export type RequestStep = (typeof REQUEST_STEP)[keyof typeof REQUEST_STEP];

/**
 * Lịch bận của một xe, nạp SẴN cho cả cửa sổ tra cứu.
 *
 * Một request cho cả năm thay vì một request mỗi lần lật tháng: kết quả THƯA (chỉ ngày bận) nên
 * xe rảnh trả mảng rỗng, và khách lật tháng không phải chờ lịch tô lại.
 *
 * Cửa sổ bị SERVER kẹp trần — bảng tra dựng từ `days` trong kết quả chứ không từ khoảng vừa
 * gửi, nên lịch không bao giờ tô một khoảng rộng hơn khoảng thật sự được trả lời.
 *
 * **Cửa sổ LÙI MỘT NGÀY so với hôm nay theo giờ VN**, y hệt `busyWindow` của web. Hai lý do, và
 * cả hai đều đã gây lỗi thật:
 *
 *  1. Lưới lịch tháng luôn hiện vài ngày của tháng TRƯỚC ở hàng đầu. Hỏi từ đúng hôm nay thì
 *     ngày hôm qua không có trong kết quả, và một ngày kín lịch nằm ở đó hiện ra **trắng trơn** —
 *     không phải lỗi vẽ, mà là không có dữ liệu để vẽ.
 *  2. `dayjs()` đọc lịch của MÁY. Máy ở múi giờ âm đang là "hôm qua" so với ngày nghiệp vụ, nên
 *     `vnDateKey` mới là mốc đúng — giờ hiển thị của sản phẩm luôn là `Asia/Ho_Chi_Minh`.
 */
export function useVehicleBusyDays(vehicleId: string, enabled: boolean): BusyDayIndex {
  return useVehicleBusyDaysState(vehicleId, enabled).busyDays;
}

/**
 * Như `useVehicleBusyDays` kèm cờ đang tải — luồng gửi yêu cầu truyền nó vào tấm chọn giờ
 * (`busyLoading`, như web `RequestBookingFlow` truyền `busyDaysQ.isLoading`).
 */
export function useVehicleBusyDaysState(
  vehicleId: string,
  enabled: boolean,
): { busyDays: BusyDayIndex; busyLoading: boolean } {
  const from = addDateKeyDays(vnDateKey(new Date()), -1);
  const to = addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD);

  const query = useQuery({
    queryKey: queryKeys.bookingRequests.busyDays(vehicleId, from, to),
    queryFn: () => bookingRequestsApi.busyDays(vehicleId, from, to),
    enabled: enabled && Boolean(vehicleId),
    staleTime: STALE_TIME.STANDARD,
  });

  const busyDays = useMemo(() => buildBusyDayIndex(query.data?.days), [query.data]);
  return { busyDays, busyLoading: query.isLoading };
}

/**
 * Báo giá SERVER cho khoảng/gói đang chọn — cùng nguồn tính giá với luồng duyệt của shop.
 *
 * `params === null` = chưa đủ dữ liệu để hỏi giá (chưa chọn thời gian, chưa chọn gói). Lúc đó
 * màn hình hiện giá NIÊM YẾT theo đơn vị làm preview; con số CHỐT luôn phải là của endpoint này.
 */
export function usePublicQuote(vehicleId: string, params: PublicQuoteParams | null) {
  return useQuery<PublicQuote>({
    queryKey: queryKeys.marketplace.quote(vehicleId, (params ?? {}) as Record<string, string>),
    queryFn: () => publicQuote(vehicleId, params as PublicQuoteParams),
    enabled: Boolean(vehicleId) && params !== null,
  });
}

/**
 * Báo giá đã ÁP MÃ khuyến mãi — nguồn duy nhất cho mọi con số trong bảng giá (ADR 0046), bản
 * native của `useQuoteWithPromo` web (#212). Thay CẢ `fees` bằng bảng phí của endpoint xem trước
 * mã, không ghép từng số (lỗi 24/09/2026). Không có mã ⇒ báo giá gốc.
 */
export function useQuoteWithPromo(
  quote: PublicQuote | null | undefined,
  promoFees: PublicQuote['breakdown']['fees'] | null | undefined,
): PublicQuote | null {
  return useMemo(() => {
    const q = quote ?? null;
    if (!q || !promoFees) return q;
    return { ...q, breakdown: { ...q.breakdown, fees: promoFees } };
  }, [quote, promoFees]);
}

/**
 * Khoảng cách + phí giao DỰ KIẾN cho một địa chỉ.
 *
 * Địa chỉ nằm TRONG khoá có chủ đích: mỗi địa chỉ là một câu trả lời riêng, và cache ở đây là
 * lớp chắn thứ hai (sau cache backend) cho hạn mức bản đồ — khách sửa qua sửa lại rồi quay về
 * địa chỉ cũ không tốn thêm lượt tra nào.
 *
 * Không `retry`: "không tra được" đến dưới dạng `status`, không phải lỗi, nên thử lại chỉ đốt
 * hạn mức cho cùng một câu trả lời.
 */
/**
 * `pin` = toạ độ khách ĐÃ XÁC NHẬN. Có nó thì server dùng thẳng và bỏ qua bước tra địa chỉ —
 * vừa rẻ hơn một request có tính tiền, vừa cho con số khớp đúng điểm khách đang nhìn (ADR 0035).
 */
export function useDeliveryDistance(
  vehicleId: string,
  address: string,
  pin?: { lat: number; lng: number } | null,
  /**
   * Đã đủ điều kiện để HỎI chưa — do nơi gọi quyết định, vì ngưỡng độ dài địa chỉ là luật của
   * màn hình chứ không phải của hook (web đặt nó ở `deliveryAskable`).
   */
  askable = true,
) {
  const key = pin ? `${pin.lat},${pin.lng}` : address;
  return useQuery({
    queryKey: queryKeys.marketplace.deliveryDistance(vehicleId, key),
    queryFn: () => deliveryDistance(vehicleId, address, pin ?? null),
    enabled: askable && Boolean(vehicleId) && (pin != null || address.trim().length > 0),
    retry: false,
    staleTime: STALE_TIME.REFERENCE,
  });
}

/**
 * Vì sao yêu cầu thuê bị chặn — nhánh KẾT THÚC riêng, không phải một lỗi đỏ (ADR 0038 điều 6).
 *
 * Chỉ biết được bằng cách THỬ GỬI: không endpoint đọc nào trả cờ này, vì cổng nằm ở lượt gửi —
 * điểm hội tụ danh tính (tài khoản của phiên) — mốc duy nhất mà server biết chắc "người gửi
 * này là ai". Đó cũng là lý do giao diện KHÔNG ẩn nút đặt xe: ẩn nút không phải kiểm soát quyền,
 * và ẩn đi thì chủ gian hàng bấm mãi không được mà không bao giờ biết vì sao.
 */
export const BOOKING_BLOCKED = {
  SHOP_ACCOUNT: 'shopAccount',
  OWN_VEHICLE: 'ownVehicle',
} as const;

export type BookingBlocked = (typeof BOOKING_BLOCKED)[keyof typeof BOOKING_BLOCKED];

/** Phiếu gửi cho biết chuyến vừa được hệ thống NHẬN và đang chờ tiền giữ chỗ (ADR 0044). */
export function isAwaitingHoldReceipt(
  receipt: { status?: string | null; id?: string | null } | null | undefined,
): receipt is { status: string; id: string } {
  return receipt?.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && Boolean(receipt.id);
}

/**
 * Màn chặn "đã giữ đủ trần" chỉ hiện khi khách còn đang ĐIỀN form.
 *
 * - Màn "đã gửi" (`DONE`) không bị thay chỉ vì lượt đọc lại sau đó thấy đủ trần.
 * - Chuyến vừa được NHẬN NGAY (`awaiting_hold`) ⇒ màn đang rời sang thanh toán: lượt đọc lại
 *   `unpaidHolds` (chạy TRƯỚC lúc điều hướng) đã đếm cả chính chuyến này; nếu nó là chỗ cuối thì
 *   `limitReached` bật và màn chặn sẽ chớp lên trước khi đi.
 *
 * Có dữ liệu lời nhắc thì tin dữ liệu; chưa có thì tin lỗi server của lượt gửi.
 */
export function isHoldLimitBlocked(input: {
  step: RequestStep;
  receipt: { status?: string | null; id?: string | null } | null | undefined;
  limitReached: boolean | undefined;
  submitHitHoldLimit: boolean;
}): boolean {
  if (input.step === REQUEST_STEP.DONE) return false;
  if (isAwaitingHoldReceipt(input.receipt)) return false;
  return input.limitReached ?? input.submitHitHoldLimit;
}

export interface RequestFlowState {
  step: RequestStep;
  /** Yêu cầu trùng: nhánh RIÊNG, không phải lỗi đỏ. */
  duplicate: boolean;
  /** Tài khoản này không đặt được xe này — nhánh RIÊNG, cũng không phải lỗi đỏ. */
  blocked: BookingBlocked | null;
  receipt: BookingRequestReceipt | null;
  error: string | null;
}

/**
 * Máy trạng thái của wizard gửi yêu cầu thuê (BKG-01).
 *
 * Tách khỏi component vì đây là phần dễ lệch với web nhất — thứ tự bước và các nhánh kết thúc
 * (thành công / trùng yêu cầu / bị chặn). Danh tính người thuê là của TÀI KHOẢN (ADR 0060).
 */
export function useBookingRequestFlow(vehicleId: string) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<RequestStep>(REQUEST_STEP.TRIP);
  const [duplicate, setDuplicate] = useState(false);
  const [blocked, setBlocked] = useState<BookingBlocked | null>(null);
  const [receipt, setReceipt] = useState<BookingRequestReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availability = useMutation({
    mutationFn: (input: { pickupAt: string; returnAt: string }) =>
      bookingRequestsApi.checkAvailability({ vehicleId, ...input }),
  });

  const submit = useMutation({
    mutationFn: (body: Omit<CreateBookingRequestInput, 'vehicleId'>) =>
      bookingRequestsApi.submit({ vehicleId, ...body }),
    onSuccess: async (result) => {
      setReceipt(result);
      // Chuyến mới phải hiện ngay ở "Chuyến của tôi", huy hiệu và số chuyến chưa khép của `/auth/me`.
      await queryClient.invalidateQueries();
      /*
       * Chuyến được NHẬN NGAY (xe "Đặt ngay") ⇒ màn gọi chuyển thẳng sang MÀN THANH TOÁN của chuyến
       * (web PR #183): không dựng bước "đã gửi" nào — nó nói "chưa giữ xe", sai ở chặng này.
       */
      if (isAwaitingHoldReceipt(result)) return;
      setStep(REQUEST_STEP.DONE);
    },
  });

  const reset = useCallback(() => {
    setStep(REQUEST_STEP.TRIP);
    setDuplicate(false);
    setBlocked(null);
    setReceipt(null);
    setError(null);
    availability.reset();
    submit.reset();
  }, [availability, submit]);

  return {
    state: { step, duplicate, blocked, receipt, error } satisfies RequestFlowState,
    availability,
    submit,
    setStep,
    setDuplicate,
    setBlocked,
    setError,
    reset,
    /**
     * Server nói SĐT của TÀI KHOẢN chưa xác minh (ADR 0060) — nơi gọi làm mới `/auth/me` để cổng
     * xác minh số của app hiện ra, rồi khách bấm gửi lại.
     */
    isPhoneUnverified: (e: unknown) => getErrorCode(e) === API_ERROR_CODE.PHONE_NOT_VERIFIED,
    /** Khách đã giữ đủ trần chuyến chưa trả — server từ chối mọi yêu cầu mới. */
    isHoldLimit: (e: unknown) => getErrorCode(e) === API_ERROR_CODE.HOLD_LIMIT_REACHED,
    isDuplicate: (e: unknown) => getErrorCode(e) === API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
    /**
     * Cổng BẰNG LÁI ở server (ADR 0057) nói "chưa" — nơi gọi lùi về bước bằng lái với dữ liệu MỚI,
     * giữ nguyên mọi thứ khách đã nhập.
     */
    isDriverLicenceGate: (e: unknown) => isDriverLicenceGateErrorCode(getErrorCode(e)),
    /**
     * Hai mã chặn đặt xe của ADR 0038 điều 6, trả về nhãn nhánh kết quả tương ứng.
     *
     * Đây là chuyện KẾ TOÁN chứ không phải sở thích sản phẩm: hai vai trên một booking khiến phí
     * dịch vụ thu từ chính người nhận tiền, và người duyệt là người gửi.
     */
    blockedReason: (e: unknown): BookingBlocked | null => {
      const code = getErrorCode(e);
      if (code === API_ERROR_CODE.SHOP_ACCOUNT_CANNOT_BOOK) return BOOKING_BLOCKED.SHOP_ACCOUNT;
      if (code === API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE) return BOOKING_BLOCKED.OWN_VEHICLE;
      return null;
    },
    isLongTerm: (serviceType: string) => serviceType === SERVICE_TYPE.LONG_TERM,
  };
}
