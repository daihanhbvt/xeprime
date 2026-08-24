// Bảng màu tạm của base. Khi có @xeprime/tokens (map từ AntD token của apps/web) thì
// file này chuyển thành lớp re-export, không sửa lại từng màn.
//
// CHỈ có palette sáng, nên `app.json` khoá `userInterfaceStyle: "light"`. Để "automatic"
// mà không có palette tối thì máy đang ở dark mode sẽ render chữ tối trên nền tối.
// Mở lại "automatic" cùng lúc với việc bổ sung palette tối, không sớm hơn.
export const colors = {
  background: '#f9fafb',
  surface: '#ffffff',
  border: '#e5e7eb',
  borderInput: '#d1d5db',
  text: '#111827',
  textMuted: '#6b7280',
  textLabel: '#374151',
  placeholder: '#9ca3af',
  primary: '#111827',
  onPrimary: '#ffffff',
  disabled: '#6b7280',
  danger: '#dc2626',
  dangerText: '#b91c1c',
  dangerSurface: '#fef2f2',
} as const;
