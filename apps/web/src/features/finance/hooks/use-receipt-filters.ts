'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { ReceiptFilters } from '../types';

/**
 * Filter danh sách phiếu ở URL searchParams (ADR 0004). Đổi filter tự về trang 1.
 *
 * **Hook đầu tiên dời sang `useUrlFilters` ở Wave 1C-C** — chọn nó làm bằng chứng vì hành vi
 * trước và sau **giống hệt nhau**, nên 30 test đặc tả của `/manage/receipts` (Batch 1C-A) là
 * cổng gác đủ chặt: trang chỉ gọi `setFilters` với `undefined` (nó tự quy `'all'` → `undefined`
 * trước khi gọi), nên nhánh xoá `'all'`/`false` của hook chung không đổi kết quả nào.
 *
 * Khác biệt duy nhất, có chủ đích: `page=0` / `page=-1` trước đây lọt qua thành `0`/`-1`, nay
 * `positiveIntParam` trả `undefined`. Trang không tồn tại thì coi như không có — không có URL
 * hợp lệ nào sinh ra giá trị đó.
 *
 * KHÔNG chọn `use-marketplace-filters` làm bằng chứng dù nó có test sẵn: marketplace mã hoá mảng
 * bằng CSV và boolean bằng `1` (facet), khác hẳn quy ước của lọc bảng quản lý. Ép nó vào hook
 * chung sẽ kéo ngữ nghĩa facet vào hợp đồng dùng cho 9 danh sách quản lý — đúng thứ chỉ thị
 * 1C-C cấm ("Do not merge marketplace facet filtering with management-table filtering").
 */
export function useReceiptFilters() {
  return useUrlFilters<ReceiptFilters>((sp) => ({
    type: sp.get('type') ?? undefined,
    status: sp.get('status') ?? undefined,
    categoryId: sp.get('categoryId') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}
