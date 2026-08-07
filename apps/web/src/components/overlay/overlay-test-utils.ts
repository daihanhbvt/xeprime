/**
 * Tiện ích dùng chung cho test của `ResponsiveDialog` / `DetailDrawer`.
 *
 * Repo không cài `@testing-library/jest-dom`, nên tên khả truy cập phải tự tính thay vì
 * dùng `toHaveAccessibleName`. Chỉ phủ hai cơ chế mà AntD thực sự sinh ra: `aria-label`
 * và `aria-labelledby` — đủ cho overlay, và không giả vờ là bản cài đặt accname đầy đủ.
 */
export function accessibleName(element: HTMLElement): string | null {
  const label = element.getAttribute('aria-label');
  if (label) return label;

  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) return null;

  const text = labelledBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();

  return text.length > 0 ? text : null;
}

/** Phần tử bọc nội dung của Drawer — nơi AntD đặt `width`/`height`/`max-height` thật. */
export function drawerWrapper(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ant-drawer-content-wrapper');
}
