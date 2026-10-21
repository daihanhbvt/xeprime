'use client';

import { InsuranceCertificatesPanel } from '@/features/admin-insurance/components/InsuranceCertificatesPanel';

/**
 * Hàng đợi BẢO HIỂM trong màn Tài chính — ADR 0032 điều 4 · ADR 0064.
 *
 * Từ 21/10/2026 đây là CÙNG một bảng với tab "Chứng nhận" của màn Bảo hiểm
 * (`features/admin-insurance`): lọc trạng thái (kể cả đã cấp), tìm theo mã đơn / số GCN, mở
 * panel làm việc có payload đối tác, thử lại và thu hồi. Hai lối vào, một hàng đợi — để không có
 * hai bản của cùng một luật "khi nào được thử lại / thu hồi".
 */
export function InsuranceQueue() {
  return <InsuranceCertificatesPanel />;
}
