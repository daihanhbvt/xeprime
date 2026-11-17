import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { useAppStyles } from '@/theme/styles';

/**
 * Cổng (portal) cho tấm trượt: mọi `BottomSheet` mặc định vẽ vào MỘT lớp phủ gắn ở gốc app, trên
 * navigator, thanh tab và header - không qua `Modal` của React Native nữa.
 *
 * Vì sao: cửa sổ `Modal` của Android (edge-to-edge, Expo 54) dừng TRÊN vùng thanh điều hướng -
 * `navigationBarTranslucent` không có tác dụng - nên mọi tấm trượt cao hụt ~52dp so với mép dưới
 * và lộ trang bên dưới (chưa phủ mờ) ở dải đó (đo uiautomator, Pixel 7, 16/11/2026). Lớp phủ trong
 * cửa sổ chính thì phủ đúng tới mép màn hình (bằng chứng: `presentation="overlay"` của menu "Vận hành").
 *
 * Không dùng `Portal` của Tamagui: trên native nó chỉ giữ được context khi có `react-native-teleport`
 * (không cài); bản dự phòng là đúng cơ chế host JS này, kèm thêm một tầng z-index - không được gì hơn.
 *
 * ⚠️ Nội dung tấm trượt dựng ở HOST, nên chỉ thấy context của các provider BAO NGOÀI host (theme,
 * i18n, query, toast, safe area, phiên, chat, huy hiệu, navigation container). Context dựng giữa
 * gốc và màn (cột nội dung, tab bar inset, ScrollReveal của màn, ngữ cảnh tìm kiếm, `NavigationContext`
 * của màn) KHÔNG đi theo: component nào trong tấm cần chúng thì nơi gọi đọc ở NGOÀI tấm rồi truyền
 * vào bằng prop. `useRouter()` vẫn chạy; `useNavigation()` trả navigator gốc.
 */

interface SheetEntry {
  id: string;
  /** Độ sâu lồng: tấm mở từ BÊN TRONG một tấm khác có level lớn hơn ⇒ luôn vẽ trên tấm cha. */
  level: number;
  /** Thứ tự mở - cùng level thì tấm mở sau nằm trên. */
  seq: number;
  node: ReactNode;
}

export interface SheetPortalStore {
  upsert: (id: string, level: number, node: ReactNode) => void;
  remove: (id: string) => void;
  /** Tấm này có đang nằm trên cùng không - nút Back của Android chỉ đóng tấm trên cùng. */
  isTop: (id: string) => boolean;
  subscribe: (listener: () => void) => () => void;
  getEntries: () => readonly SheetEntry[];
}

function byStackOrder(a: SheetEntry, b: SheetEntry): number {
  return a.level - b.level || a.seq - b.seq;
}

function createSheetPortalStore(): SheetPortalStore {
  let entries: SheetEntry[] = [];
  let seq = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    upsert(id, level, node) {
      const index = entries.findIndex((entry) => entry.id === id);
      if (index < 0) {
        seq += 1;
        entries = [...entries, { id, level, seq, node }].sort(byStackOrder);
      } else {
        const prev = entries[index]!;
        if (prev.node === node && prev.level === level) return;
        const next = entries.slice();
        next[index] = { ...prev, level, node };
        entries = prev.level === level ? next : next.sort(byStackOrder);
      }
      emit();
    },
    remove(id) {
      if (!entries.some((entry) => entry.id === id)) return;
      entries = entries.filter((entry) => entry.id !== id);
      emit();
    },
    isTop(id) {
      return entries.length > 0 && entries[entries.length - 1]!.id === id;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getEntries: () => entries,
  };
}

const SheetPortalContext = createContext<SheetPortalStore | null>(null);

/** Cấp độ lồng của tấm trượt đang dựng - host bọc mỗi tấm bằng `level + 1`. */
const SheetLevelContext = createContext(0);

/** `null` ⇒ không có host (test, màn lỗi gốc) - `BottomSheet` lùi về `Modal`. */
export function useSheetPortal(): SheetPortalStore | null {
  return useContext(SheetPortalContext);
}

export function useSheetLevel(): number {
  return useContext(SheetLevelContext);
}

/**
 * Bọc navigator gốc của app. Host vẽ SAU `children` nên nằm trên mọi màn, thanh tab và header.
 *
 * Đặt TRONG mọi provider mà nội dung tấm trượt cần (theme, i18n, query, toast, phiên…) - xem
 * docblock đầu file.
 */
export function SheetPortalProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSheetPortalStore);
  return (
    <SheetPortalContext.Provider value={store}>
      {children}
      <SheetHost store={store} />
    </SheetPortalContext.Provider>
  );
}

function SheetHost({ store }: { store: SheetPortalStore }) {
  const appStyles = useAppStyles();
  const entries = useSyncExternalStore(store.subscribe, store.getEntries, store.getEntries);

  return (
    /*
     * Phủ trọn cửa sổ chính (tới mép dưới, sau thanh điều hướng). `box-none`: chỉ tấm bắt chạm.
     * Khung LUÔN mount (rỗng thì không chặn gì) để tấm vừa đóng còn chỗ chạy hiệu ứng trượt ra -
     * gỡ cả khung cùng tấm cuối cùng là cắt ngang animation `exiting`.
     */
    <View
      style={appStyles.overlayFill}
      pointerEvents="box-none"
      accessibilityViewIsModal={entries.length > 0}
    >
      {entries.map((entry) => (
        <SheetLevelContext.Provider key={entry.id} value={entry.level + 1}>
          {entry.node}
        </SheetLevelContext.Provider>
      ))}
    </View>
  );
}
