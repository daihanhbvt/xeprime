import { useCallback, useMemo } from 'react';
import {
  useIsFetching,
  useMutation,
  useQuery,
  useQueryClient,
  type Query,
} from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  customerFiltersToParams,
  customersApi,
  type CreateCustomerNoteInput,
  type CreateTenantCustomerInput,
  type CustomerDocument,
  type CustomerFilters,
  type UpdateCustomerRiskInput,
  type UpdateTenantCustomerInput,
  type VerifyCustomerDocumentInput,
} from '../api';
import { isPreviewableImage } from '../constants';

/**
 * Số khách mỗi trang.
 *
 * 10 chứ không phải 20 (mặc định của contract): `LIST_TUNING` — cửa sổ dựng dùng chung của mọi
 * danh sách trong app — được đặt QUANH một trang 10 mục (`initialNumToRender: 6`,
 * `maxToRenderPerBatch: 6`, `windowSize: 7`). Kéo 20 thẻ về một trang là mỗi lần đổi trang phải
 * dựng gấp đôi số view trong cùng một nhịp, và đó là thứ người dùng cảm thấy là giật.
 */
export const CUSTOMERS_PAGE_SIZE = 10;

/**
 * Bao lâu thì coi một URL ký xem trước là CŨ.
 *
 * 90 giây, ngắn hơn hạn 120 giây server ký vào URL (`DOWNLOAD_URL_TTL_SECONDS`): quay lại tab
 * Giấy tờ phải gặp một link CÒN SỐNG, không phải một lưới ô ảnh vỡ. Đặt bằng đúng hạn kia là hẹn
 * nhau ở đúng cái mép — vài giây đi đường là đủ để link chết trước khi ảnh tải xong.
 */
const PREVIEW_URL_STALE_MS = 90_000;

/**
 * MỘT trang sổ khách. Lọc, sắp xếp và cắt trang đều ở SERVER — không có chỗ nào kéo cả sổ về rồi
 * lọc tại chỗ.
 *
 * PHÂN TRANG chứ không cuộn vô hạn, hai lý do:
 *
 *  1. **Web phân trang**, và sổ khách là bề mặt người ta tra cứu chứ không lướt — "khách này ở
 *     trang mấy" là câu hỏi có nghĩa, còn với cuộn vô hạn thì không.
 *  2. `ManageListShell` chỉ THU khối đầu trang khi biết danh sách có gì để cuộn, và nó biết điều
 *     đó qua `meta`. Cuộn vô hạn không có `meta` để đưa lên, nên bộ lọc dính cứng trên màn.
 *
 * Giữ dữ liệu trang cũ khi ĐỔI TRANG, bỏ khi đổi bộ lọc — xem `keepPageData`.
 */
export function useCustomersPage(filters: CustomerFilters, enabled = true) {
  const withLimit = { ...filters, limit: CUSTOMERS_PAGE_SIZE };
  const params = customerFiltersToParams(withLimit);

  return useQuery({
    queryKey: queryKeys.customers.list(params),
    queryFn: () => customersApi.list(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof customersApi.list>>>(params),
    enabled,
  });
}

/**
 * Dải chỉ số đầu sổ khách. Nói về CẢ sổ, không phụ thuộc trang hay bộ lọc hiện tại.
 *
 * `enabled` gác bằng `customers.view` ở nơi gọi — thiếu quyền thì không request nào rời máy.
 */
export function useCustomerSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.summary(),
    queryFn: () => customersApi.summary(),
    enabled,
  });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => customersApi.detail(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Lịch sử thuê — phân trang SERVER với `limit` 10, ĐÚNG con số web dùng.
 *
 * `enabled` phải mang `bookings.view`: endpoint đòi CẢ HAI quyền và trả 403 khi thiếu, nên gọi
 * nó mà không có quyền chỉ tạo ra một lỗi đỏ vô nghĩa trong tab.
 */
export function useCustomerBookings(id: string | null, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.bookings(id ?? '', page),
    queryFn: () => customersApi.bookings(id as string, page),
    // Khoá đã ôm cả id khách lẫn số trang, nên `prev` chỉ có thể là trang trước CỦA CÙNG khách —
    // giữ nó lại để đổi trang không nháy về khung xương (y như web).
    placeholderData: (prev) => prev,
    enabled: Boolean(id) && enabled,
  });
}

export function useCustomerNotes(id: string | null, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.notes(id ?? '', page),
    queryFn: () => customersApi.notes(id as string, page),
    placeholderData: (prev) => prev,
    enabled: Boolean(id) && enabled,
  });
}

export function useCustomerDocuments(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.documents(id ?? ''),
    queryFn: () => customersApi.documents(id as string),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * Kéo-xuống-làm-mới cho MÀN DANH SÁCH: trang khách **và** dải chỉ số đầu trang.
 *
 * Không dùng `query.refetch()` của riêng danh sách. Dải chỉ số là một truy vấn khác
 * (`customers.summary`), nên kéo xuống mà chỉ gọi `refetch` của danh sách thì bốn con số ở đầu
 * trang vẫn là số của lần mở màn — mà đó đúng là thứ người ta kéo xuống để xem có đổi không.
 *
 * `useIsFetching` đếm CẢ HAI, nên vòng xoay tắt khi thứ cuối cùng về chứ không phải thứ đầu tiên.
 */
/**
 * Truy vấn ĐÃ CÓ dữ liệu và đang tải lại — tức một cú làm mới thật, không phải lần nạp đầu.
 *
 * `useIsFetching` đếm cả lần nạp đầu, mà lần đó màn đã có khung xương của riêng nó: đếm luôn thì
 * vòng xoay kéo-xuống nằm chồng lên khung xương, hai chỉ báo cho cùng một việc. Ở hồ sơ khách còn
 * tệ hơn — mở một tab chưa nạp bao giờ cũng làm cả màn "đang làm mới".
 *
 * Chỉ dùng để ĐẾM. Lệnh `invalidateQueries` vẫn quét theo phạm vi đầy đủ, nếu không một truy vấn
 * đang lỗi (chưa có dữ liệu) sẽ không bao giờ được làm mới lại.
 */
function isRefetch(query: Query): boolean {
  return query.state.data !== undefined;
}

export function useCustomerListRefresh() {
  const queryClient = useQueryClient();

  // Chỉ hai nhánh của màn này. Hồ sơ chi tiết đang nằm trong cache không liên quan tới cú kéo.
  const inScope = useCallback(
    (query: Query) => query.queryKey[1] === 'list' || query.queryKey[1] === 'summary',
    [],
  );

  const refreshing =
    useIsFetching({
      queryKey: queryKeys.customers.all,
      predicate: (query) => inScope(query) && isRefetch(query),
    }) > 0;

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.customers.all,
      predicate: inScope,
    });
  }, [queryClient, inScope]);

  return { refreshing, onRefresh };
}

/**
 * Một truy vấn có thuộc về ĐÚNG khách này không — dùng cho cú kéo-xuống ở màn hồ sơ.
 *
 * Hai cách khoá khác nhau nên phải xét riêng:
 *  - nhánh `customers`: id nằm THẲNG trong khoá (`['customers','detail',id,…]`), nên mọi thứ
 *    của khách (lịch sử thuê, ghi chú, giấy tờ, URL ký xem trước) khớp bằng một phép `includes`;
 *  - nhánh tiền: id nằm TRONG object tham số (`['finance','summary',{ tenantCustomerId }]`),
 *    vì hai khối tiền của hồ sơ dùng chung endpoint báo cáo với màn Thu-Chi.
 *
 * Trả `false` cho mọi nhánh khác: kéo xuống ở hồ sơ khách không được làm mới cả app.
 */
function belongsToCustomer(queryKey: readonly unknown[], customerId: string): boolean {
  if (queryKey[0] === 'customers') return queryKey.includes(customerId);

  if (queryKey[0] === 'finance' || queryKey[0] === 'receipts') {
    return queryKey.some(
      (part) =>
        typeof part === 'object' &&
        part !== null &&
        (part as { tenantCustomerId?: unknown }).tenantCustomerId === customerId,
    );
  }

  return false;
}

/**
 * Kéo-xuống-làm-mới cho MỘT HỒ SƠ — cả năm khu, không riêng khu đang mở.
 *
 * Hồ sơ đọc từ sáu nguồn: chính khách, lịch sử thuê, ghi chú, giấy tờ, và hai khối tiền. Làm mới
 * mỗi `useCustomer` thì ba thẻ tiền ở đầu hồ sơ đổi số còn tab "Tiền" vẫn hiện phiếu cũ — mà ở
 * quầy thì tiền là thứ đổi liên tục: ai đó vừa thu nốt khoản còn nợ ngay lúc màn này đang mở.
 *
 * Làm mới CẢ khu chưa mở là cố ý: các khu là tab, người dùng đổi tab ngay sau khi kéo, và một
 * tab hiện số cũ ngay sau cú làm mới là thứ không giải thích được.
 */
export function useCustomerDetailRefresh(customerId: string) {
  const queryClient = useQueryClient();

  const inScope = useCallback(
    (query: Query) => belongsToCustomer(query.queryKey, customerId),
    [customerId],
  );

  const refreshing =
    useIsFetching({ predicate: (query) => inScope(query) && isRefetch(query) }) > 0;

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ predicate: inScope });
  }, [queryClient, inScope]);

  return { refreshing, onRefresh };
}

/**
 * Làm mới MỌI bề mặt của sổ khách sau một mutation.
 *
 * Một hàm, một danh sách key — đừng để mỗi màn tự nhớ phải invalidate những gì. Danh sách / dải
 * chỉ số / hồ sơ luôn phải đổi cùng lúc: một hồ sơ vừa bị lưu trữ mà vẫn nằm trong danh sách
 * "đang hoạt động" là bug người dùng nhìn thấy ngay.
 */
export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  }, [queryClient]);
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (body: CreateTenantCustomerInput) => customersApi.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTenantCustomerInput }) =>
      customersApi.update(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomerRisk() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomerRiskInput }) =>
      customersApi.updateRisk(id, body),
    onSuccess: invalidate,
  });
}

export function useSetCustomerArchived() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? customersApi.archive(id) : customersApi.restore(id),
    onSuccess: invalidate,
  });
}

export function useAddCustomerNote() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateCustomerNoteInput }) =>
      customersApi.addNote(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomerNote() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, noteId }: { id: string; noteId: string }) =>
      customersApi.deleteNote(id, noteId),
    onSuccess: invalidate,
  });
}

export function useVerifyCustomerDocument() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({
      id,
      documentId,
      input,
    }: {
      id: string;
      documentId: string;
      input: VerifyCustomerDocumentInput;
    }) => customersApi.verifyDocument(id, documentId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomerDocument() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, documentId }: { id: string; documentId: string }) =>
      customersApi.deleteDocument(id, documentId),
    onSuccess: invalidate,
  });
}

/**
 * URL ký để hiện ẢNH THU NHỎ của giấy tờ — một query cho cả danh sách, không phải N query rời.
 *
 * Vì sao nạp sẵn thay vì đợi bấm: nhận ra CCCD/GPLX bằng mắt là việc chính của tab này, và một
 * lưới ô xám không nói được gì. Đánh đổi đã cân nhắc: mỗi URL phát ra là một dòng `audit_logs`.
 * Chỉ chạy khi người dùng có `customers.documents.view_files`; thiếu quyền thì KHÔNG request nào
 * rời khỏi máy.
 *
 * Một ảnh hỏng KHÔNG kéo cả lưới về trạng thái lỗi — ô đó rơi về icon loại tệp.
 *
 * `staleTime` ngắn hơn hạn của URL ký để quay lại tab là có link còn sống, không phải ô ảnh vỡ.
 */
export function useCustomerDocumentPreviews(
  customerId: string | null,
  documents: readonly CustomerDocument[],
  enabled: boolean,
) {
  const ids = useMemo(
    () => documents.filter((doc) => isPreviewableImage(doc.mimeType)).map((doc) => doc.id),
    [documents],
  );

  return useQuery({
    queryKey: queryKeys.customers.documentPreviews(customerId ?? '', ids),
    queryFn: async () => {
      const tickets = await Promise.all(
        ids.map(async (documentId) => {
          try {
            const ticket = await customersApi.documentDownload(customerId as string, documentId);
            return [documentId, ticket.downloadUrl] as const;
          } catch {
            return [documentId, null] as const;
          }
        }),
      );
      return Object.fromEntries(tickets) as Record<string, string | null>;
    },
    enabled: Boolean(customerId) && enabled && ids.length > 0,
    staleTime: PREVIEW_URL_STALE_MS,
  });
}
