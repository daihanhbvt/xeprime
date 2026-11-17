import type { ReactNode } from 'react';
import { PageTopBar } from '@/components/layout/PageTopBar';
import { ManageShellNotices } from './ManageShellNotices';

/**
 * Thanh trên của một màn CON trong khu quản lý (người dùng chốt 13/11/2026, Figma "Header MB" của
 * "Rental Request - MB"): tiêu đề màn + nút icon của màn, KHÔNG logo / tin nhắn / chuông / avatar —
 * những thứ đó là của màn gốc Tổng quan (`ManageHeader`).
 *
 * Giữ hai dải thường trực của khu quản lý (`ManageShellNotices`: gian hàng tạm khoá, gói hết hạn chỉ
 * xem) như `ManageHeader` — đổi thanh không được làm mất cảnh báo.
 *
 * `onBack` có ⇒ biến thể màn chi tiết (← + tiêu đề).
 */
export function ManagePageHeader({
  title,
  actions,
  onBack,
  subtitle,
  below,
}: {
  title: string;
  subtitle?: ReactNode;
  below?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <>
      <PageTopBar title={title} actions={actions} onBack={onBack} subtitle={subtitle} below={below} />
      <ManageShellNotices />
    </>
  );
}
