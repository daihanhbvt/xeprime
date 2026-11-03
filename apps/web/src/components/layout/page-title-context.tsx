'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const TitleContext = createContext<string | null>(null);
const SetTitleContext = createContext<((title: string | null) => void) | null>(null);

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
  return (
    <SetTitleContext.Provider value={setTitle}>
      <TitleContext.Provider value={title}>{children}</TitleContext.Provider>
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
