/** Tham số truy vấn của một danh sách — khoá cuối trong `queryKeys.*.list(params)`. */
type ListParams = Record<string, unknown>;

/**
 * Hai bộ tham số có giống nhau ở MỌI chiều trừ `page` không.
 *
 * So nông là đủ: `*FiltersToParams` luôn trả về một object phẳng gồm chuỗi/số, không lồng nhau.
 */
function sameExceptPage(a: ListParams, b: ListParams): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (key === 'page') continue;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * `placeholderData` giữ dữ liệu cũ **CHỈ khi đổi trang**, không giữ khi đổi bộ lọc.
 *
 * `keepPreviousData` của TanStack giữ kết quả cũ cho MỌI thay đổi khoá. Với phân trang thì đúng
 * (trang 3 và 4 là cùng một danh sách), nhưng với đổi tab/bộ lọc thì màn hiện **dữ liệu của tab
 * khác dưới tiêu đề tab mới** — hiện SAI, không phải hiện chậm.
 *
 * Hàm này phân biệt hai việc bằng cách so bộ tham số của truy vấn trước với bộ hiện tại: chỉ lệch
 * `page` thì giữ, lệch chiều nào khác thì trả `undefined` để màn rơi về khung xương ngay.
 */
export function keepPageData<TData>(params: ListParams) {
  /*
   * `previousQuery` khai theo HÌNH DẠNG cần dùng, không import `Query` của TanStack: kiểu đó
   * mang bốn tham số generic phải khớp đúng với truy vấn gọi nó, nên nhận nó ở đây biến một hàm
   * dùng chung thành thứ chỉ vừa một chỗ.
   */
  return (
    previousData: TData | undefined,
    previousQuery: { queryKey: readonly unknown[] } | undefined,
  ): TData | undefined => {
    if (previousData === undefined || previousQuery === undefined) return undefined;

    const previousParams = previousQuery.queryKey.at(-1);
    if (typeof previousParams !== 'object' || previousParams === null) return undefined;

    return sameExceptPage(previousParams as ListParams, params) ? previousData : undefined;
  };
}
