/**
 * Bao lâu dữ liệu đã tải còn được coi là MỚI — `staleTime` của TanStack Query.
 *
 * Là hằng dùng chung chứ không phải con số ở mỗi hook, vì `5 * 60_000` viết tại chỗ nói được
 * "5 phút" nhưng không nói được **vì sao query này đáng 5 phút mà query kia chỉ đáng 1** — ba cái
 * tên dưới đây đặt tên cho quyết định đó. Và web với app native phải trả lời câu hỏi đó GIỐNG
 * NHAU: hai bên tự gõ số thì lệch nhau ở lần chỉnh đầu tiên, mà không test nào bắt được.
 *
 * Đây là `staleTime`, KHÔNG phải `refetchInterval`. Hai thứ khác hẳn nhau: cái này nói "đọc lại
 * khi có ai đó cần", cái kia nói "cứ thế mà gọi dù không ai nhìn".
 */
export const STALE_TIME = {
  /**
   * Dữ liệu giao dịch — đơn, lịch, thanh toán. Đổi vì hành động của người khác, và hiện sai thì
   * người dùng ra quyết định sai. Đây cũng là mặc định của `QueryClient`.
   */
  TRANSACTIONAL: 30_000,

  /**
   * Danh sách và hồ sơ đọc nhiều, đổi chậm — hồ sơ phiên, danh sách xe, kết quả tìm kiếm.
   * Một phút đủ để chuyển tab qua lại mà không bắn thêm request nào.
   */
  STANDARD: 60_000,

  /**
   * Dữ liệu tra cứu gần như bất động — danh mục, tỉnh thành, gói dịch vụ, bản chụp hợp đồng đã
   * ký. Đọc lại thường xuyên chỉ tốn sóng ở bãi xe.
   */
  REFERENCE: 5 * 60_000,
} as const;
