import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  addDateKeyDays,
  API_ERROR_CODE,
  isSameVnPhone,
  PHONE_VERIFICATION_PURPOSE,
  SERVICE_TYPE,
  vnDateKey,
} from '@xeprime/types';
import { STALE_TIME } from '@xeprime/api-client';
import { buildBusyDayIndex, type BusyDayIndex } from '@xeprime/domain';
import { getErrorCode } from '@/lib/api-client';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { adoptMobileSession } from '@/features/auth/api';
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

/** Bốn bước của luồng gửi yêu cầu — cùng tên với web (`trip → otp → review → done`). */
export const REQUEST_STEP = {
  TRIP: 'trip',
  OTP: 'otp',
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
  const from = addDateKeyDays(vnDateKey(new Date()), -1);
  const to = addDateKeyDays(from, BUSY_DAYS_LOOKAHEAD);

  const query = useQuery({
    queryKey: queryKeys.bookingRequests.busyDays(vehicleId, from, to),
    queryFn: () => bookingRequestsApi.busyDays(vehicleId, from, to),
    enabled: enabled && Boolean(vehicleId),
    staleTime: STALE_TIME.STANDARD,
  });

  return useMemo(() => buildBusyDayIndex(query.data?.days), [query.data]);
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
 * Khoảng cách + phí giao DỰ KIẾN cho một địa chỉ.
 *
 * Địa chỉ nằm TRONG khoá có chủ đích: mỗi địa chỉ là một câu trả lời riêng, và cache ở đây là
 * lớp chắn thứ hai (sau cache backend) cho hạn mức bản đồ — khách sửa qua sửa lại rồi quay về
 * địa chỉ cũ không tốn thêm lượt tra nào.
 *
 * Không `retry`: "không tra được" đến dưới dạng `status`, không phải lỗi, nên thử lại chỉ đốt
 * hạn mức cho cùng một câu trả lời.
 */
export function useDeliveryDistance(vehicleId: string, address: string) {
  return useQuery({
    queryKey: queryKeys.marketplace.deliveryDistance(vehicleId, address),
    queryFn: () => deliveryDistance(vehicleId, address),
    enabled: Boolean(vehicleId) && address.trim().length > 0,
    retry: false,
    staleTime: STALE_TIME.REFERENCE,
  });
}

export interface RequestFlowState {
  step: RequestStep;
  /** SĐT đang chờ nhập mã — giữ riêng để đổi SĐT ở bước Chuyến đi không làm hỏng bước OTP. */
  otpPhone: string;
  /** Yêu cầu trùng: nhánh RIÊNG, không phải lỗi đỏ. */
  duplicate: boolean;
  receipt: BookingRequestReceipt | null;
  error: string | null;
}

/**
 * Máy trạng thái của wizard gửi yêu cầu thuê (BKG-01).
 *
 * Tách khỏi component vì đây là phần dễ lệch với web nhất — thứ tự bước, điều kiện bỏ qua OTP,
 * và ba nhánh kết thúc (thành công / trùng yêu cầu / phiên hết hạn giữa chừng).
 *
 * **Bước OTP là CÓ ĐIỀU KIỆN.** Server bỏ qua OTP khi SĐT của tài khoản ĐANG ĐĂNG NHẬP trùng
 * và đã verify, nên UI phải nhảy thẳng sang `review` — hỏi lại là hỏi cùng một câu hai lần.
 */
export function useBookingRequestFlow(vehicleId: string) {
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();

  const [step, setStep] = useState<RequestStep>(REQUEST_STEP.TRIP);
  const [otpPhone, setOtpPhone] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [receipt, setReceipt] = useState<BookingRequestReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountPhone = me?.phone ?? null;
  /** Tên hiển thị của tài khoản — điền sẵn ô 'Họ và tên' đúng như web. */
  const accountName = me?.displayName ?? null;
  const accountPhoneVerified = Boolean(me?.phoneVerified && accountPhone);

  /** SĐT này đã được hệ thống xác thực cho chính tài khoản đang đăng nhập chưa. */
  const phoneMatchesAccount = useCallback(
    (phone: string) => accountPhoneVerified && isSameVnPhone(phone, accountPhone),
    [accountPhone, accountPhoneVerified],
  );

  const availability = useMutation({
    mutationFn: (input: { pickupAt: string; returnAt: string }) =>
      bookingRequestsApi.checkAvailability({ vehicleId, ...input }),
  });

  const submit = useMutation({
    mutationFn: (body: Omit<CreateBookingRequestInput, 'vehicleId'>) =>
      bookingRequestsApi.submit({ vehicleId, ...body }),
    onSuccess: async (result) => {
      /*
       * Khách vãng lai vừa được tạo tài khoản từ SĐT đã xác thực: response mang thẳng cặp token.
       * Không nạp thì phiên rơi vào hư không và người vừa đặt xe xong bị coi như chưa đăng nhập.
       * Nạp qua ĐÚNG đường kho token đang dùng — không có đường lưu token thứ hai (ADR 0017).
       */
      if (result.session) await adoptMobileSession(result.session);

      setReceipt(result);
      // Vừa có thể được cấp phiên mới → làm mới toàn bộ cache để cả app biết.
      await queryClient.invalidateQueries();
      setStep(REQUEST_STEP.DONE);
    },
  });

  const reset = useCallback(() => {
    setStep(REQUEST_STEP.TRIP);
    setOtpPhone('');
    setDuplicate(false);
    setReceipt(null);
    setError(null);
    availability.reset();
    submit.reset();
  }, [availability, submit]);

  return {
    state: { step, otpPhone, duplicate, receipt, error } satisfies RequestFlowState,
    accountPhone,
    accountName,
    accountPhoneVerified,
    phoneMatchesAccount,
    availability,
    submit,
    setStep,
    setOtpPhone,
    setDuplicate,
    setError,
    reset,
    /** Mã lỗi "SĐT chưa xác thực" — nơi gọi lùi về bước OTP và GIỮ NGUYÊN dữ liệu đã nhập. */
    isPhoneUnverified: (e: unknown) => getErrorCode(e) === API_ERROR_CODE.PHONE_NOT_VERIFIED,
    isDuplicate: (e: unknown) => getErrorCode(e) === API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE,
    otpPurpose: PHONE_VERIFICATION_PURPOSE.BOOKING,
    isLongTerm: (serviceType: string) => serviceType === SERVICE_TYPE.LONG_TERM,
  };
}
