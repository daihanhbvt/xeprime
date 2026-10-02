/**
 * Chạy một promise mà KHÔNG chờ, nhưng vẫn nuốt lỗi có kiểm soát.
 *
 * `void somePromise()` KHÔNG bắt lỗi — nó chỉ vứt giá trị trả về đi. Promise vẫn reject, và
 * React Native in ra `Uncaught (in promise) id:N` không kèm ngữ cảnh nào: không tên hàm, không
 * stack, không biết màn nào. Với các thao tác BÊN LỀ (ghi Keychain, xoá lựa chọn đã nhớ) thì
 * hỏng là chuyện chấp nhận được — mất một tuỳ chọn, không mất phiên — nhưng nó phải hỏng thành
 * một dòng log đọc được, chứ không phải một cảnh báo đỏ giữa luồng đăng nhập.
 *
 * CHỈ dùng cho việc bên lề. Thao tác mà người dùng đang chờ kết quả thì phải `await` và có
 * trạng thái lỗi thật trên màn hình.
 */
export function fireAndForget(run: () => Promise<unknown>, context: string): void {
  run().catch((error: unknown) => {
    if (__DEV__) console.warn(`[${context}] bỏ qua lỗi phụ:`, error);
  });
}
