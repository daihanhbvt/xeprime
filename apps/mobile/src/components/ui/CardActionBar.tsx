import { Fragment, useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';
import { Divider } from './DataRow';
import { estimateTextWidth } from './text-fit';
import type { IconName } from './Chip';

/**
 * Sắc thái của một thao tác — MÀU nói KẾT QUẢ, không phải mức độ quan trọng.
 *
 * `accent` (mặc định) là thao tác dẫn đi hoặc mở một tấm nhập liệu: vàng thương hiệu, và cả hàng
 * cùng một màu thì không ô nào giành mắt của ô nào.
 *
 * `success` dành riêng cho thao tác ĐÓNG một việc lại (hoàn tất bảo dưỡng) và `danger` cho thao
 * tác phá đi (huỷ lịch). Hai màu này chỉ có nghĩa khi chúng HIẾM — tô thêm ô thứ ba là hàng
 * thao tác thành một dải sặc sỡ và người dùng hết phân biệt được đâu là nút không lùi lại được.
 */
type ActionTone = 'accent' | 'success' | 'danger';

const TONE: Readonly<Record<ActionTone, string>> = {
  accent: colors.primaryActive,
  success: colors.success,
  danger: colors.danger,
};

export interface CardAction {
  /** Khoá React — dùng tên thao tác, đừng lấy chỉ số mảng. */
  readonly key: string;
  readonly label: string;
  readonly icon: IconName;
  readonly tone?: ActionTone;
  /**
   * Ô vẫn HIỆN nhưng mờ và không bấm được — luật nghiệp vụ chặn, hoặc một thao tác khác của
   * chính bản ghi này đang chạy.
   *
   * Khoá thay vì ẩn vì nơi gọi còn phải nói LÝ DO ngay dưới thanh, mà một ô biến mất thì không
   * còn gì cho lý do đó bám vào. Cả hai đều chỉ là trải nghiệm — guard backend mới là lớp chặn
   * thật (CLAUDE.md §6).
   */
  readonly disabled?: boolean;
  /** CHÍNH thao tác này đang chạy — hình đổi thành con quay, nhãn giữ nguyên để biết đang chờ ai. */
  readonly loading?: boolean;
  readonly onPress: () => void;
}

/**
 * Trần số ô còn xếp được HÌNH CẠNH CHỮ.
 *
 * Ba ô trên thẻ 358pt cho mỗi ô ~119pt — thừa chỗ cho `⊙ Xem`. Ô thứ tư kéo xuống ~88pt, và một
 * nhãn như "Cập nhật ODO" (~72pt) cộng hình cộng khe hở là tràn; ở đó hình phải nhảy lên trên
 * chữ. Thanh cao thêm một chút, đổi lại không nhãn nào bị cắt.
 */
const INLINE_MAX = 3;

/** Phần bề rộng một ô KHÔNG dành cho nhãn ở kiểu hình-cạnh-chữ: đệm hai bên + hình + khe hở. */
const INLINE_CHROME = 2 * space.xs + iconSize.sm + space.xs;

/**
 * Nhãn có nằm trọn một dòng khi xếp hình CẠNH chữ không?
 *
 * Đếm ô là chưa đủ, vì thứ tràn không phải số ô mà là độ dài NHÃN — và nhãn đổi theo ngôn ngữ:
 * "Cập nhật ODO" vừa ba ô, còn "Update odometer" thì không, nên cùng một thẻ đọc được ở tiếng
 * Việt lại cắt cụt thành "Update odo…" ở tiếng Anh. Cắt đúng tên một thao tác là bỏ đi phần nói
 * ra nó làm gì, nên chỗ nào không đủ chỗ thì CẢ thanh chuyển sang kiểu xếp dọc (hình trên, nhãn
 * hai dòng) thay vì để một ô cụt.
 *
 * Bề rộng nhãn chỉ ÁNG CHỪNG ({@link estimateTextWidth}) — sai số không gây vỡ bố cục: đoán dư
 * thì thanh xếp dọc sớm hơn cần thiết, đoán hụt thì ô đó cắt bằng "…" đúng như trước.
 */
function labelsFitInline(actions: readonly CardAction[], barWidth: number): boolean {
  /* Lượt render đầu chưa đo được — dựng theo luật đếm, `onLayout` sửa lại ở khung ngay sau. */
  if (barWidth <= 0) return true;

  /* Trừ các kẻ dọc 1pt giữa hai ô trước khi chia đều. */
  const budget = (barWidth - (actions.length - 1)) / actions.length - INLINE_CHROME;

  return actions.every((action) => estimateTextWidth(action.label, fontSize.label, true) <= budget);
}

/**
 * Chân thẻ: một hàng thao tác PHẲNG, chia ô bằng kẻ dọc, chạy sát hai mép thẻ.
 *
 * Thay cho lưới nút có nền/viền mà các thẻ danh sách từng dùng. Ba, bốn viên nút tô nền trong một
 * thẻ vốn đã có nhãn trạng thái và một khối chỉ số là mảng màu thứ ba trên cùng một mặt phẳng —
 * mắt hết chỗ bám, và một danh sách cuộn dài đọc ra như một bảng nút. Bỏ nền đi thì thao tác vẫn
 * ở đúng chỗ đó và vẫn MỘT chạm, còn thẻ trở lại là thẻ.
 *
 * Hình nằm CẠNH chữ khi còn chỗ, TRÊN chữ khi không — xem {@link labelsFitInline}.
 *
 * Đặt NGOÀI phần thân có đệm của thẻ, bên trong `<Card padded={false}>`: kẻ chia phải chạm hai
 * mép thẻ, còn một đường kẻ thụt vào 16pt hai đầu đọc ra như vẽ hụt.
 */
export function CardActionBar({ actions }: { actions: readonly CardAction[] }) {
  const [width, setWidth] = useState(0);

  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    /* Làm tròn: `onLayout` trả số thực và một chênh lệch 0,3pt sẽ dựng lại cả cây con vô ích. */
    setWidth((current) => (Math.abs(current - next) < 1 ? current : Math.round(next)));
  }, []);

  if (actions.length === 0) return null;

  const inline = actions.length <= INLINE_MAX && labelsFitInline(actions, width);

  return (
    <YStack onLayout={measure}>
      <Divider />
      <XStack ai="stretch">
        {actions.map((action, index) => (
          <Fragment key={action.key}>
            {index > 0 ? <YStack w={1} bg={colors.borderSubtle} alignSelf="stretch" /> : null}
            <ActionCell action={action} inline={inline} />
          </Fragment>
        ))}
      </XStack>
    </YStack>
  );
}

/**
 * Nền của ô đang bị nhấn — SÁNG lên, không mờ đi: thứ người dùng cần thấy là "tôi đang chạm đúng
 * ô này", không phải "ô này đang tắt". Cùng phản hồi với một hàng của `StatGrid`.
 */
const pressedCell = { flex: 1, backgroundColor: colors.surfaceMuted } as const;
const cell = { flex: 1 } as const;

function ActionCell({ action, inline }: { action: CardAction; inline: boolean }) {
  const loading = action.loading === true;
  const blocked = action.disabled === true || loading;

  /*
    Ô bị khoá dùng `textMuted`, KHÔNG `textDisabled`: cùng lý do với `Button` — trên nền thẻ trắng
    thì `textDisabled` mờ tới mức đọc ra là lỗi hiển thị chứ không phải "chưa dùng được".
  */
  const tone = blocked ? colors.textMuted : TONE[action.tone ?? 'accent'];

  /*
    Hình cạnh chữ giữ thanh đúng bằng ngưỡng chạm 48pt — thấp hơn kiểu hình-trên-chữ chừng 14pt,
    và trên một danh sách cuộn dài thì 14pt mỗi thẻ là gần một thẻ mỗi mười thẻ.

    Nhãn cho phép hai dòng ở kiểu XẾP DỌC: kiểu đó được chọn đúng vào lúc nhãn không nằm vừa một
    dòng, nên cắt bằng "…" ở đó là cắt mất chính thứ vừa khiến cả thanh phải đổi kiểu.
  */
  const Layout = inline ? XStack : YStack;

  return (
    <Pressable
      onPress={action.onPress}
      disabled={blocked}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      style={({ pressed }) => (pressed && !blocked ? pressedCell : cell)}
    >
      <Layout
        f={1}
        minWidth={0}
        ai="center"
        jc="center"
        gap={inline ? space.xs : 2}
        px={space.xs}
        py={space.xs}
        minHeight={sizing.touchTarget}
      >
        {loading ? (
          /*
            Hộp cố định ĐÚNG bằng ô hình. `ActivityIndicator size="small"` rộng 20pt nên tràn ra
            ngoài chừng 2pt mỗi bên — chấp nhận được; đổi bề rộng ô hình giữa hai trạng thái thì
            nhãn giật ngang đúng lúc người dùng đang nhìn nó.
          */
          <YStack w={iconSize.sm} h={iconSize.sm} ai="center" jc="center">
            <ActivityIndicator size="small" color={tone} />
          </YStack>
        ) : (
          <Ionicons name={action.icon} size={iconSize.sm} color={tone} />
        )}
        <Text
          col={tone}
          fos={fontSize.label}
          fow={fontWeight.semibold}
          ta="center"
          numberOfLines={inline ? 1 : 2}
        >
          {action.label}
        </Text>
      </Layout>
    </Pressable>
  );
}
