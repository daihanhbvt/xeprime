'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Mắt xích CHA giữa mục menu và trang đang xem — vd "Danh sách xe › Chi tiết xe › Chỉnh sửa". */
export interface PageParentCrumb {
  label: string;
  href: string;
}

const TitleContext = createContext<string | null>(null);
const SetTitleContext = createContext<((title: string | null) => void) | null>(null);
const ParentContext = createContext<PageParentCrumb | null>(null);
const SetParentContext = createContext<((parent: PageParentCrumb | null) => void) | null>(null);

/**
 * Tiêu đề của trang đang mở, để breadcrumb của header site partner có mắt xích cuối ("… › Yêu cầu
 * đặt xe › Toyota Vios 51A-123.45") mà không phải dựng sổ tra route → tiêu đề thứ hai.
 *
 * Nguồn là CHÍNH `<h1>` của trang: `ManagePageHeader` — nơi duy nhất sinh `<h1>` ở khu quản lý —
 * đăng ký tiêu đề khi nó là chữ. Tiêu đề là node phức tạp thì không đăng ký; breadcrumb dừng ở mục
 * menu, thà thiếu một mắt xích còn hơn bịa ra một tên.
 *
 * Hai context tách nhau (giá trị · hàm đặt) để trang đăng ký tiêu đề không render lại vì chính lần
 * đăng ký đó. Ngoài provider (site quản trị) đăng ký là no-op.
 */
export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const [parent, setParent] = useState<PageParentCrumb | null>(null);
  return (
    <SetTitleContext.Provider value={setTitle}>
      <SetParentContext.Provider value={setParent}>
        <TitleContext.Provider value={title}>
          <ParentContext.Provider value={parent}>{children}</ParentContext.Provider>
        </TitleContext.Provider>
      </SetParentContext.Provider>
    </SetTitleContext.Provider>
  );
}

export function usePageTitle(): string | null {
  return useContext(TitleContext);
}

export function useRegisterPageTitle(title: string | null): void {
  const setTitle = useContext(SetTitleContext);
  useEffect(() => {
    if (!setTitle) return undefined;
    setTitle(title);
    return () => setTitle(null);
  }, [setTitle, title]);
}

export function usePageParent(): PageParentCrumb | null {
  return useContext(ParentContext);
}

/** Trang con của một trang chi tiết (vd màn sửa của một xe) khai mắt xích cha của nó. */
export function useRegisterPageParent(parent: PageParentCrumb | null): void {
  const setParent = useContext(SetParentContext);
  const label = parent?.label ?? null;
  const href = parent?.href ?? null;
  useEffect(() => {
    if (!setParent) return undefined;
    setParent(label && href ? { label, href } : null);
    return () => setParent(null);
  }, [setParent, label, href]);
}
