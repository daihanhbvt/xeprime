import { logger } from '@/lib/logger';

/**
 * Xếp hàng các hộp thoại XIN QUYỀN của hệ điều hành — mỗi lần đúng một cái.
 *
 * Android và iOS đều chỉ vẽ được một hộp thoại quyền tại một thời điểm. Hai lời xin bắn cùng lúc
 * thì cái sau bị hệ điều hành trả về "từ chối" ngay lập tức mà không hỏi ai — một quyền bị mất
 * vĩnh viễn (người dùng phải vào Cài đặt mới bật lại được) vì một lỗi tranh chấp, và không có dòng
 * lỗi nào ở bất kỳ đâu.
 *
 * Trang chủ chạm đúng vào cảnh đó: nó xin quyền VỊ TRÍ để đoán tỉnh, và ngay sau khi đăng nhập
 * xong nó cũng là nơi xin quyền THÔNG BÁO. Nên cả hai đi qua đây.
 *
 * Một lời xin hỏng không được phép chặn hàng: `finally` luôn nhả lượt.
 */
let tail: Promise<unknown> = Promise.resolve();

export function requestPermissionExclusively<T>(label: string, task: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    logger.debug('[permission] bắt đầu', { label });
    try {
      return await task();
    } finally {
      logger.debug('[permission] xong', { label });
    }
  });

  // Nuốt lỗi ở BẢN SAO dùng làm đuôi hàng, không phải ở cái trả cho người gọi: người gọi vẫn phải
  // thấy lỗi của chính họ, còn hàng đợi thì không được chết theo.
  tail = run.catch(() => undefined);
  return run;
}
