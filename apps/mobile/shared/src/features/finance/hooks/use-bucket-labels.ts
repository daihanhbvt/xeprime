import { useMemo } from 'react';
import { FINANCE_GRANULARITY, type FinanceGranularity } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';

/**
 * Hai cách gọi tên một mốc trên biểu đồ xu hướng: nhãn TRỤC và tiêu đề THẺ CHI TIẾT.
 *
 * Web dùng chung một chuỗi cho cả hai (`Tháng 9 năm 2026` ở trục lẫn ở tooltip) vì trục ngang của
 * nó rộng 430px và `recharts` chỉ việc bỏ bớt mốc cho tới khi chữ vừa. Trên màn 390dp, một dải chỉ
 * còn vài chục dp và bản đầy đủ bị cắt thành `Tháng…` — nhãn mất luôn phần nói ra nó là tháng nào.
 *
 * Nên app tách đôi: trục dùng bản NGẮN (`09/2026`, `08/09`), còn thẻ chi tiết — chỗ người dùng
 * chạm vào để đọc kỹ — giữ đúng chuỗi đầy đủ của web. Không dữ liệu nào mất, chỉ đổi chỗ hiển thị.
 *
 * Cùng một cặp hàm cho màn Tổng quan và cho khối nhúng ở hồ sơ xe/khách: hai bản chép tay sẽ trôi
 * khỏi nhau ngay lần đầu một bên đổi định dạng.
 */
export function useBucketLabels(granularity: FinanceGranularity): {
  /** Nhãn trục X — ngắn nhất có thể mà vẫn đọc ra mốc nào. */
  labelOf: (bucket: string) => string;
  /** Tiêu đề thẻ chi tiết — chuỗi đầy đủ, đúng như web. */
  titleOf: (bucket: string) => string;
} {
  const fmt = useAppFormat();

  return useMemo(() => {
    /* Trưa UTC: mốc là một NGÀY lịch, lấy giữa ngày thì lệch múi giờ nào cũng không nhảy sang tháng khác. */
    const asDate = (bucket: string) => new Date(`${bucket}T12:00:00Z`);

    return granularity === FINANCE_GRANULARITY.MONTH
      ? {
          labelOf: (bucket: string) => fmt.monthYearShort(asDate(bucket)),
          titleOf: (bucket: string) => fmt.monthYear(asDate(bucket)),
        }
      : {
          labelOf: (bucket: string) => fmt.dayMonth(bucket),
          titleOf: (bucket: string) => fmt.dateKey(bucket),
        };
  }, [granularity, fmt]);
}
