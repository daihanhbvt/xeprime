import { createContext, useContext, type ReactNode } from 'react';
import { TextInput, type ScrollView } from 'react-native';
import { space } from '@/theme/tokens';

/** Khoảng thở giữa đáy ô đang gõ và mép trên bàn phím. */
export const KEYBOARD_GAP = space.md;

/**
 * Kéo ô ĐANG GÕ ra khỏi vùng bàn phím che, trong `scroller`.
 *
 * Đo bằng toạ độ CỬA SỔ cho cả hai đầu (ô nhập và mép bàn phím) — cùng một hệ quy chiếu, nên
 * không phải bù chiều cao thanh trên như phép tính nội-dung-tương-đối của `ScrollView`.
 */
export function revealFocusedInput(
  scroller: ScrollView | null,
  scrollY: number,
  keyboardTop: number,
): void {
  const input = TextInput.State.currentlyFocusedInput();
  if (!input || !scroller) return;

  input.measureInWindow((_x, y, _width, height) => {
    const overlap = y + height + KEYBOARD_GAP - keyboardTop;
    /*
     * Không chồng lấn thì không cuộn — gồm luôn trường hợp ô đang gõ thuộc một tấm trượt mở đè
     * lên màn: tấm trượt tự nâng nội dung của nó, ở đây không có gì để làm.
     */
    if (overlap <= 0) return;
    scroller.scrollTo({ y: scrollY + overlap, animated: true });
  });
}

/**
 * Vùng cuộn đang bao ô nhập tự giới thiệu hàm "kéo ô đang gõ vào tầm nhìn" xuống cho các ô.
 *
 * Vì sao cần: `Screen`/`BottomSheet` chỉ kéo ô vào tầm nhìn khi nhận sự kiện `keyboardDidShow`.
 * Chuyển tiêu điểm từ ô này sang ô khác trong lúc bàn phím ĐANG mở thì hệ điều hành không bắn
 * sự kiện đó nữa (Android không bắn, iOS chỉ bắn khi hình dạng bàn phím đổi) — nên ô cuối form,
 * thứ người dùng chạm sau khi đã gõ ô trên, nằm im dưới bàn phím. Đó là lỗi "ô gần cuối màn bị
 * bàn phím che" lặp đi lặp lại.
 *
 * Mặc định là hàm rỗng: ô nhập nằm ngoài mọi vùng cuộn (thanh soạn tin cố định) không có gì để
 * cuộn, và không màn nào phải nhớ bọc thêm provider.
 */
const FocusRevealContext = createContext<() => void>(() => {});

export function FocusRevealProvider({
  reveal,
  children,
}: {
  reveal: () => void;
  children: ReactNode;
}) {
  return <FocusRevealContext.Provider value={reveal}>{children}</FocusRevealContext.Provider>;
}

/** Gọi trong `onFocus` của MỌI ô nhập dùng chung. */
export function useRevealOnFocus(): () => void {
  return useContext(FocusRevealContext);
}
