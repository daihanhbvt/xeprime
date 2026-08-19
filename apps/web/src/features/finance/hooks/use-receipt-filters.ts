'use client';

import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { ReceiptFilters } from '../types';

/**
 * Filter danh sách phiếu ở URL searchParams (ADR 0004). Đổi filter tự về trang 1.
 *
 * **Hook đầu tiên dời sang `useUrlFilters` ở Wave 1C-C** — chọn nó làm bằng chứng vì hành vi
 * trước và sau **giống hệt nhau**, nên 30 test đặc tả của `/manage/receipts` (Batch 1C-A) là
 * cổng gác đủ chặt.
 *
 * `page=0` / `page=-1` trả `undefined` qua `positiveIntParam`: trang không tồn tại thì coi như
 * không có — không có URL hợp lệ nào sinh ra giá trị đó.
 *
 * KHÔNG chọn `use-marketplace-filters` làm bằng chứng dù nó có test sẵn: marketplace mã hoá mảng
 * bằng CSV và boolean bằng `1` (facet), khác hẳn quy ước của lọc bảng quản lý.
 *
 * `bookingId`/`vehicleId`/`tenantCustomerId` không có ô trên thanh lọc — chúng đến từ đường dẫn
 * của chi tiết đơn / hồ sơ xe / sổ khách, nhưng vẫn phải đọc được từ URL để link đó chia sẻ được.
 */
export function useReceiptFilters() {
  return useUrlFilters<ReceiptFilters>((sp) => ({
    type: sp.get('type') ?? undefined,
    status: sp.get('status') ?? undefined,
    categoryId: sp.get('categoryId') ?? undefined,
    source: sp.get('source') ?? undefined,
    paymentMethod: sp.get('paymentMethod') ?? undefined,
    bookingId: sp.get('bookingId') ?? undefined,
    vehicleId: sp.get('vehicleId') ?? undefined,
    tenantCustomerId: sp.get('tenantCustomerId') ?? undefined,
    q: sp.get('q') ?? undefined,
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
  }));
}

/**
 * Có filter nào đang bật không — quyết định bảng hiện "chưa có phiếu nào" (thật sự rỗng) hay
 * "không có phiếu khớp bộ lọc" (lọc quá tay).
 *
 * Đếm ĐỦ mọi filter. Bản trước chỉ đếm `type`/`status`, nên lọc theo ngày ra rỗng lại báo "chưa
 * có phiếu thu/chi nào" — người dùng đóng luôn màn hình vì tưởng chưa nhập gì.
 */
export const RECEIPT_FILTER_KEYS = [
  'type',
  'status',
  'categoryId',
  'source',
  'paymentMethod',
  'bookingId',
  'vehicleId',
  'tenantCustomerId',
  'q',
  'from',
  'to',
] as const satisfies readonly (keyof ReceiptFilters)[];

export function hasReceiptFilters(filters: ReceiptFilters): boolean {
  return RECEIPT_FILTER_KEYS.some((key) => Boolean(filters[key]));
}

/** Patch xoá sạch mọi filter (giữ `limit`, về trang 1 do `useUrlFilters` tự lo). */
export function clearedReceiptFilters(): Partial<ReceiptFilters> {
  return Object.fromEntries(RECEIPT_FILTER_KEYS.map((key) => [key, undefined]));
}
