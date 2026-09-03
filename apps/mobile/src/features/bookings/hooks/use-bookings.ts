import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  bookingFiltersToParams,
  bookingsApi,
  driversApi,
  vehicleFiltersToParams,
  vehiclesApi,
  type AssignableWindow,
  type BookingDetail,
  type BookingFilters,
  type CheckConflictInput,
  type CreateBookingInput,
  type TransitionBookingInput,
  type UpdateBookingInput,
  type UpdateDeliveryFeeInput,
} from '../api';

/**
 * MỘT trang đơn thuê. Lọc, sắp xếp và cắt trang đều ở SERVER.
 *
 * Khoá CÓ `page`: mỗi trang là một mục cache riêng, nên quay lại trang vừa xem là hiện ngay
 * không gọi lại mạng — đúng thứ người dùng mong khi bấm qua lại giữa các trang của một bảng.
 *
 * Giữ dữ liệu cũ khi ĐỔI TRANG — thiếu nó thì mỗi cú bấm số làm danh sách trắng một nhịp rồi
 * mới có nội dung, và chiều cao nhảy theo. Nhưng KHÔNG giữ khi đổi bộ lọc: xem `keepPageData`.
 */
export function useBookingsPage(filters: BookingFilters) {
  const params = bookingFiltersToParams(filters);

  return useQuery({
    queryKey: queryKeys.bookings.list(params),
    queryFn: () => bookingsApi.list(filters),
    placeholderData: keepPageData<Awaited<ReturnType<typeof bookingsApi.list>>>(params),
  });
}

export function useBooking(id: string) {
  return useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () => bookingsApi.detail(id),
    enabled: Boolean(id),
  });
}

/**
 * Làm mới mọi bề mặt mà một thay đổi trên đơn đụng tới.
 *
 * Bốn nhánh, không phải một: đơn (chính nó), lịch (đơn chiếm/nhả chỗ xe — ADR 0006), quyết toán
 * (phụ phí và cọc treo trên cùng đơn), và bàn giao (trạng thái đơn quyết định chiều nào mở được).
 * Bỏ sót nhánh nào là màn đó còn hiển thị dữ liệu của trạng thái vừa bị thay.
 */
function invalidateBookingSurfaces(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.settlement(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.handovers(id) });
}

/**
 * Đổi trạng thái đơn — CHỈ dùng cho hai quyết định bấm tay: huỷ đơn và khách không đến.
 *
 * `active`/`completed` không bao giờ đi qua đây: chúng là HỆ QUẢ của một lần xác nhận bàn giao
 * thật (có giờ giao/nhận + số KM). Một lối tắt ở đây xoá đúng ranh giới đó.
 */
export function useTransitionBooking(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: TransitionBookingInput) => bookingsApi.transition(id, body),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), booking);
      invalidateBookingSurfaces(queryClient, id);
    },
  });
}

/** Chốt phí giao nhận sau khi hai bên đã thoả thuận NGOÀI ứng dụng — server tính lại tổng tiền. */
export function useUpdateDeliveryFee(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateDeliveryFeeInput) => bookingsApi.updateDeliveryFee(id, body),
    onSuccess: (booking: BookingDetail) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), booking);
      invalidateBookingSurfaces(queryClient, id);
    },
  });
}

/** Gán/bỏ gán tài xế. `driverId: null` là bỏ gán TƯỜNG MINH, không phải "bỏ trống". */
export function useAssignDriver(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (driverId: string | null) => bookingsApi.assignDriver(id, driverId),
    onSuccess: (booking: BookingDetail) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), booking);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
    },
  });
}

/**
 * Tài xế gán được cho MỘT khung giờ.
 *
 * Cửa sổ nằm trong khoá vì đổi cửa sổ là đổi câu trả lời — không phải cùng một kết quả cắt nhỏ.
 * `excludeBookingId` trừ chính đơn đang sửa ra, nếu không tài xế đã gán tự báo là đang bận.
 */
export function useAssignableDrivers(window: AssignableWindow, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.drivers.assignable(window),
    queryFn: () => driversApi.assignable(window),
    enabled,
  });
}

/**
 * Tạo đơn tay tại quầy (BKG-06).
 *
 * Invalidate cả `bookings` lẫn `calendar`: đơn mới CHIẾM CHỖ lịch xe ngay khi tạo (ADR 0006),
 * nên mọi lưới lịch đang mở phải biết.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateBookingInput) => bookingsApi.create(body),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(booking.id), booking);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    },
  });
}

/**
 * Kiểm trùng lịch — **PREVIEW cho UX, không phải lớp bảo vệ** (ADR 0006).
 *
 * Lớp chặn thật là exclusion constraint `EXCLUDE USING gist` lúc ghi. Kết quả "còn trống" ở đây
 * chỉ đúng tại thời điểm hỏi; ai đó có thể đặt trước trong lúc nhân viên đang gõ tên khách, và
 * chính bước tạo đơn sẽ báo lại. Dùng `useMutation` chứ không `useQuery` đúng vì lý do đó — nó
 * là một câu hỏi tại một thời điểm, không phải một dữ liệu để cache.
 */
export function useCheckConflict() {
  return useMutation({
    mutationFn: (body: CheckConflictInput) => bookingsApi.checkConflict(body),
  });
}

/** Bộ chọn hiện một tấm trượt, không phải cả trang — 30 dòng là quá đủ để tìm rồi bấm. */
const VEHICLE_PICKER_LIMIT = 30;

/**
 * Đội xe cho bộ chọn khi tạo đơn.
 *
 * Tìm ở SERVER (`q`); không kéo cả kho về rồi lọc tại chỗ — seed demo đã có gian hàng 40 xe,
 * và một gian hàng thật có thể vài trăm.
 */
export function useVehiclePicker(search: string, enabled: boolean) {
  const filters = { ...(search ? { q: search } : {}), limit: VEHICLE_PICKER_LIMIT };

  return useQuery({
    queryKey: queryKeys.vehicles.list(vehicleFiltersToParams(filters)),
    queryFn: () => vehiclesApi.list(filters),
    enabled,
  });
}

/**
 * Sửa một đơn đã tạo.
 *
 * `PATCH` chỉ đổi trường CÓ MẶT trong body — nơi gọi phải bỏ hẳn trường không muốn động tới,
 * đừng gửi `null` hay `"0"` cho nó.
 *
 * Đổi thời gian là đổi khoảng chiếm lịch, nên invalidate cả `calendar` — exclusion constraint ở
 * DB là nơi chốt, và nếu khoảng mới đụng đơn khác thì chính lệnh này trả lỗi.
 */
export function useUpdateBooking(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateBookingInput) => bookingsApi.update(id, body),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(id), booking);
      invalidateBookingSurfaces(queryClient, id);
    },
  });
}
