import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  customerRevenueParams,
  debtFiltersToParams,
  debtsApi,
  financeApi,
  financeByCategoryParams,
  financeCategoriesApi,
  financeRangeParams,
  financeSeriesParams,
  receiptFiltersToParams,
  receiptSummaryParams,
  receiptsApi,
  vehicleProfitParams,
  type CreateCategoryInput,
  type CreateReceiptInput,
  type DebtFilters,
  type FinanceOverviewFilters,
  type FinancePeriodFilters,
  type FinanceScope,
  type ReceiptFilters,
} from '../api';

/**
 * Toàn bộ truy vấn của tuyến TIỀN trên app native — bản gương của
 * `apps/web/src/features/finance/hooks/*`.
 *
 * `scope` thu hẹp về MỘT xe hoặc MỘT khách — cùng hook, cùng endpoint, cùng phép tính với màn
 * Tổng quan doanh thu. Nhờ vậy con số ở hồ sơ một thực thể không thể lệch dòng của nó trong bảng
 * tổng quan: hai bề mặt là cùng một câu truy vấn khác nhau đúng một mệnh đề lọc.
 *
 * Gác quyền `finance.view` ở NƠI GỌI — gọi khi thiếu quyền chỉ tạo ra một 403 vô nghĩa.
 */

export function useFinanceSummary(
  filters: FinancePeriodFilters,
  scope: FinanceScope | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.summary(financeRangeParams(filters, scope)),
    queryFn: () => financeApi.summary(filters, scope),
    enabled,
  });
}

export function useFinanceSeries(
  filters: FinancePeriodFilters,
  scope: FinanceScope | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.series(financeSeriesParams(filters, scope)),
    queryFn: () => financeApi.series(filters, scope),
    enabled,
  });
}

/** Cơ cấu một CHIỀU tiền — gọi hai lần (thu và chi) để hai khối tải song song, không nối đuôi. */
export function useFinanceByCategory(
  filters: FinancePeriodFilters,
  type: string,
  scope?: FinanceScope,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.finance.byCategory(financeByCategoryParams(filters, type, scope)),
    queryFn: () => financeApi.byCategory(filters, type, scope),
    enabled,
  });
}

/**
 * Hai bảng xếp hạng có phân trang và sắp xếp RIÊNG.
 *
 * `placeholderData` giữ trang đang đọc trong lúc trang mới về — bảng nháy về skeleton ở mỗi cú
 * bấm trang là thứ khiến người dùng mất chỗ.
 */
export function useVehicleProfit(filters: FinanceOverviewFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.byVehicle(vehicleProfitParams(filters)),
    queryFn: () => financeApi.byVehicle(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useCustomerRevenue(filters: FinanceOverviewFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.finance.byCustomer(customerRevenueParams(filters)),
    queryFn: () => financeApi.byCustomer(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * Danh sách phiếu thu/chi — phân trang server-side.
 *
 * Giữ dữ liệu cũ khi ĐỔI TRANG, KHÔNG giữ khi đổi bộ lọc (`keepPageData`). `(prev) => prev` giữ
 * cho mọi thay đổi khoá, và ở màn này nó ra hai hậu quả: sổ hiện phiếu của bộ lọc CŨ dưới dải
 * viên đã sáng ở kỳ MỚI — hiện sai, không phải hiện chậm — và vì không có gì trên màn nhúc nhích
 * trong lúc chờ mạng, bấm một viên kỳ đọc ra như màn hình bị đơ. Rơi về khung xương thì người
 * dùng thấy phản hồi ngay ở khung hình kế tiếp.
 */
export function useReceipts(filters: ReceiptFilters, enabled = true) {
  const params = receiptFiltersToParams(filters);

  return useQuery({
    queryKey: queryKeys.receipts.list(params),
    queryFn: () => receiptsApi.list(filters),
    placeholderData: keepPageData<Awaited<ReturnType<typeof receiptsApi.list>>>(params),
    enabled,
  });
}

/**
 * Thẻ tổng của ĐÚNG bộ lọc đang xem.
 *
 * Khoá đã bỏ `page`/`limit` (xem `receiptSummaryParams`), nên sang trang KHÔNG gọi lại; nhưng
 * lần đổi bộ lọc kế tiếp vẫn giữ số cũ trong lúc tải thay vì nhảy về 0 ₫ rồi nhảy lại.
 */
export function useReceiptSummary(filters: ReceiptFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.receipts.summary(receiptSummaryParams(filters)),
    queryFn: () => receiptsApi.summary(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Chi tiết một phiếu — chỉ gọi khi tấm trượt thật sự mở (`id` null = không fetch). */
export function useReceiptDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.receipts.detail(id ?? ''),
    queryFn: () => receiptsApi.detail(id!),
    enabled: enabled && Boolean(id),
  });
}

/** Danh mục thu/chi dùng được cho tenant (hệ thống + riêng). `type` lọc income/expense. */
export function useFinanceCategories(type?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.receipts.categories({ type: type ?? null }),
    queryFn: () => financeCategoriesApi.list(type),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/**
 * Đơn gợi ý cho ô "Liên kết đơn thuê".
 *
 * Chỉ chạy khi form đang mở (`enabled`) — danh sách này không có giá trị gì cho tới lúc người
 * dùng bắt đầu tạo phiếu, và nó chạm bảng `bookings`.
 */
export function useReceiptBookingOptions(q: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.receipts.bookingOptions({ q: q.trim() || null }),
    queryFn: () => receiptsApi.bookingOptions(q),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * Xe gợi ý cho ô "Liên kết xe".
 *
 * `includeId` là xe đang chọn sẵn (mở form từ hồ sơ xe). Nó đi vào query key chứ không lọc ở
 * client: đổi xe đang chọn là đổi tập kết quả server phải trả, nên hai lần gọi khác `includeId`
 * không được dùng chung một ô cache.
 */
export function useReceiptVehicleOptions(q: string, enabled: boolean, includeId?: string | null) {
  return useQuery({
    queryKey: queryKeys.receipts.vehicleOptions({
      q: q.trim() || null,
      includeId: includeId || null,
    }),
    queryFn: () => receiptsApi.vehicleOptions(q, includeId),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/** Danh sách công nợ — phân trang server-side, tính động từ `bookings`. */
export function useDebts(filters: DebtFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.debts.list(debtFiltersToParams(filters)),
    queryFn: () => debtsApi.list(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

/**
 * Sau mỗi thay đổi phiếu, làm mới MỌI nhánh đọc lại chính những phiếu đó.
 *
 * `finance` nằm trong danh sách vì duyệt/huỷ một phiếu đổi ngay `/finance/summary`,
 * `/finance/series` và hai bảng theo xe/khách — thiếu nó thì màn Tổng quan doanh thu giữ số cũ
 * cho tới khi cache tự hết hạn, tức người vừa duyệt phiếu nhìn thấy một con số họ biết chắc là
 * sai. `debts` vì một phiếu thu gắn đơn làm giảm công nợ của đơn đó; `customers` vì ba ô tiền ở
 * hồ sơ khách đọc cùng dữ liệu.
 */
function invalidateAfterReceipt(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.debts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
}

export function useCreateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReceiptInput) => receiptsApi.create(body),
    onSuccess: () => invalidateAfterReceipt(queryClient),
  });
}

export function useApproveReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => receiptsApi.approve(id),
    onSuccess: () => invalidateAfterReceipt(queryClient),
  });
}

export function useCancelReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => receiptsApi.cancel(id, reason),
    onSuccess: () => invalidateAfterReceipt(queryClient),
  });
}

/**
 * Thêm / xoá danh mục.
 *
 * Làm mới CẢ nhánh `receipts` chứ không riêng khoá danh mục: tên danh mục hiện trên thẻ phiếu và
 * trong ô lọc, nên một danh mục vừa xoá mà danh sách vẫn gọi tên nó là sổ nói dối.
 */
function invalidateCategories(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryInput) => financeCategoriesApi.create(body),
    onSuccess: () => invalidateCategories(queryClient),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => financeCategoriesApi.remove(id),
    onSuccess: () => invalidateCategories(queryClient),
  });
}
