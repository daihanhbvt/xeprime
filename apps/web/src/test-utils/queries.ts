import { within } from '@testing-library/react';

/**
 * Tìm NÚT / LINK theo chữ hiển thị — thay cho `getByRole(role, { name })` khi tên truy cập của
 * phần tử chính là chữ đó và điều đang kiểm không phải ngữ nghĩa role.
 *
 * Phép role tính khả kiến (`getComputedStyle` cho từng tổ tiên) và accessible name cho MỌI phần
 * tử khớp role. Trang dựng cây AntD thật chèn 250–560KB CSS-in-JS vào jsdom, và mỗi lần
 * `getComputedStyle` dò lại toàn bộ chỗ CSS đó: một truy vấn trên cả trang tốn 2–8s ở máy dev,
 * khoảng gấp năm trên CI — đủ chạm `testTimeout` (đo 07/10/2026: `TripOpsView`, `FinanceView`,
 * `vehicle-detail-page`). Tìm theo chữ rồi leo lên phần tử điều khiển chỉ mất vài mili-giây.
 *
 * Khác `getByRole`: phép theo chữ KHÔNG loại phần tử bị CSS ẩn — truyền `container` hẹp (bảng,
 * hộp thoại) khi trang có bản sao ẩn của cùng chữ. Khi chính ROLE là điều cần kiểm (tablist,
 * roving tabindex…), giữ `getByRole`; nút chỉ-icon thì tìm bằng `getByLabelText`.
 */
function controlsByText(
  selector: 'button' | 'a',
  text: string | RegExp,
  container: HTMLElement,
): HTMLElement[] {
  const controls = within(container)
    .queryAllByText(text)
    .map((node) => node.closest<HTMLElement>(selector))
    .filter((control): control is HTMLElement => control !== null);
  return [...new Set(controls)];
}

export function getAllButtonsByText(
  text: string | RegExp,
  container: HTMLElement = document.body,
): HTMLButtonElement[] {
  const buttons = controlsByText('button', text, container);
  if (buttons.length === 0) throw new Error(`Không có nút nào mang chữ ${String(text)}`);
  return buttons as HTMLButtonElement[];
}

export function queryButtonByText(
  text: string | RegExp,
  container: HTMLElement = document.body,
): HTMLButtonElement | null {
  const buttons = controlsByText('button', text, container);
  if (buttons.length > 1) throw new Error(`Có ${buttons.length} nút mang chữ ${String(text)}`);
  return (buttons[0] as HTMLButtonElement | undefined) ?? null;
}

export function getButtonByText(
  text: string | RegExp,
  container: HTMLElement = document.body,
): HTMLButtonElement {
  const button = queryButtonByText(text, container);
  if (!button) throw new Error(`Không có nút nào mang chữ ${String(text)}`);
  return button;
}

export function queryLinkByText(
  text: string | RegExp,
  container: HTMLElement = document.body,
): HTMLAnchorElement | null {
  const links = controlsByText('a', text, container);
  if (links.length > 1) throw new Error(`Có ${links.length} link mang chữ ${String(text)}`);
  return (links[0] as HTMLAnchorElement | undefined) ?? null;
}

export function getLinkByText(
  text: string | RegExp,
  container: HTMLElement = document.body,
): HTMLAnchorElement {
  const link = queryLinkByText(text, container);
  if (!link) throw new Error(`Không có link nào mang chữ ${String(text)}`);
  return link;
}
