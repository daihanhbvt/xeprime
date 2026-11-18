import { createContext, useContext } from 'react';

/**
 * Máy đang đọc ảnh cà vẹt (wizard thêm xe, 18/11/2026). CHỈ các ô sẽ được điền từ cà vẹt đọc cờ
 * này để khoá + báo "đang đọc": biển số, màu sơn và bộ ô cà vẹt (tên chủ xe, số khung, số máy). Các ô khác (hãng,
 * mẫu xe, giá…) vẫn thao tác được bình thường.
 */
export const RegistrationBusyContext = createContext(false);

export function useRegistrationBusy(): boolean {
  return useContext(RegistrationBusyContext);
}
