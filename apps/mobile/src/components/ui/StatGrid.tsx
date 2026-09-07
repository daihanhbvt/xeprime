import { Ionicons } from '@expo/vector-icons';
import { Fragment } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { IconName } from './Chip';

/**
 * Sàn co chữ của ô số.
 *
 * `adjustsFontSizeToFit` không có sàn thì một khoản nợ mười chữ số bị bóp xuống cỡ không đọc nổi.
 * 0.8 giữ chữ ở tối thiểu ~13px — vẫn là cỡ đọc được, và tới ngưỡng đó thì nó cắt bằng "…".
 */
const MIN_FONT_SCALE = 0.8;

export interface StatCell {
  /** Khoá React — dùng luôn khoá message của nhãn, đừng lấy chỉ số mảng. */
  key: string;
  icon: IconName;
  /**
   * Chữ đi kèm con số.
   *
   * Ở biến thể `grid` nó LUÔN một dòng, nên phải đủ ngắn để vừa một ô (~145dp ở màn 390dp):
   * nhãn kiểu "Cần lưu ý / từ chối phục vụ" của web sẽ bị cắt. Nơi gọi đưa bản rút gọn vào đây
   * và bản đầy đủ vào {@link StatCell.fullLabel} — rút gọn để VỪA KHUNG, không phải để bớt nghĩa.
   *
   * Ở biến thể `list` thì không có ràng buộc đó: nhãn chiếm trọn bề ngang còn lại nên đưa thẳng
   * chuỗi đầy đủ của web vào đây.
   */
  label: string;
  /**
   * Nhãn đầy đủ — tên khả truy cập của cả ô, đọc kèm con số. Bỏ trống thì dùng `label`.
   *
   * Đây là chỗ giữ nguyên chuỗi web hiện, để bản rút gọn không lấy mất thông tin của người dùng
   * trình đọc màn hình.
   */
  fullLabel?: string;
  value: string;
  /** Màu HÌNH — LUÔN có, vì hình là thứ phân loại con số trước khi mắt kịp đọc nhãn. */
  tone: string;
  /**
   * Nền huy hiệu tròn quanh hình — bản NHẠT của {@link StatCell.tone}. Chỉ biến thể `list` dùng.
   *
   * Bỏ trống thì huy hiệu dùng nền chìm trung tính. Ở biến thể `grid` hình đứng trần cạnh con số
   * nên trường này bị bỏ qua — một huy hiệu tròn trong ô rộng 145dp là ăn mất chỗ của chính con số.
   */
  surface?: string;
  /** Màu CHỮ SỐ — chỉ đặt khi con số đang cần chú ý. Tô đỏ một số 0 là báo động giả. */
  valueTone?: string;
}

/**
 * Bảng chỉ số: MỘT mặt phẳng chia ô bằng đường kẻ mảnh, không phải N khối rời.
 *
 * Rút ra khỏi `CustomerSummaryBar` khi hồ sơ khách cần đúng dải này lần thứ hai. Hai lần dựng
 * tay là hai lần chọn lại padding, cỡ chữ và cách kẻ — và dải chỉ số ở sổ khách với dải ở hồ sơ
 * khách sẽ hết giống nhau dù chúng nói cùng một loại thông tin.
 *
 * Vì sao kẻ chia chứ không phải các khối rời: các khối nền xám thì mỗi khối cao một kiểu tuỳ độ
 * dài nội dung và cả cụm đọc ra như những mảnh rời. Một mặt phẳng có kẻ chia thì ô ăn theo chiều
 * cao của HÀNG, mép luôn thẳng — và nhãn một dòng ({@link StatCell.label}) giữ cho các hàng cao
 * bằng nhau ngay cả trước khi kẻ chia làm việc của nó.
 *
 * **Số đứng trước, nhãn xuống dưới**, và mỗi ô có một HÌNH dẫn — nhìn thoáng qua thì các con số
 * chỉ là những chữ số giống nhau, hình phân loại chúng trước khi mắt kịp đọc nhãn.
 *
 * Không có vỏ (viền/bo góc/bóng): nơi gọi tự bọc. Sổ khách bọc bằng một khung phẳng sát mép màn,
 * hồ sơ khách bọc bằng `<Card padded={false}>` — cùng bảng số, hai bối cảnh.
 *
 * Hàng cuối thiếu ô thì ô còn lại chiếm trọn bề ngang. Đó là hành vi ĐÚNG, không phải lỗ hổng:
 * chèn một ô rỗng cho đủ lưới là vẽ ra một cột trống mà người đọc sẽ đi tìm nội dung của nó.
 */
export function StatGrid({
  cells,
  columns = 2,
  variant = 'grid',
}: {
  cells: readonly StatCell[];
  columns?: number;
  /**
   * `grid`: N ô mỗi hàng, số to đứng trên nhãn — dải chỉ số liếc một cái là xong (đầu sổ khách).
   *
   * `list`: mỗi chỉ số một hàng full width, nhãn ĐẦY ĐỦ bên trái, con số bên phải. Dùng khi
   * nhãn là cụm từ tiếng Việt dài ("Không nhận xe / trả muộn", "Đơn đang chạy / sắp tới"): ở
   * lưới hai cột chúng bị cắt bằng "…", và cắt tên một chỉ số là bỏ đi đúng phần nói ra nó đếm
   * cái gì. Đổi lại thì con số nhỏ hơn và khối cao hơn — đánh đổi đúng ở màn HỒ SƠ, nơi người
   * dùng đọc từng dòng chứ không liếc.
   */
  variant?: 'grid' | 'list';
}) {
  if (cells.length === 0) return null;

  if (variant === 'list') {
    return (
      <YStack>
        {cells.map((cell, index) => (
          <Fragment key={cell.key}>
            {index > 0 ? <HRule /> : null}
            <ListRow cell={cell} />
          </Fragment>
        ))}
      </YStack>
    );
  }

  const rows: StatCell[][] = [];
  for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));

  return (
    <YStack>
      {rows.map((row, rowIndex) => (
        <Fragment key={row[0]!.key}>
          {rowIndex > 0 ? <HRule /> : null}
          <XStack>
            {row.map((cell, cellIndex) => (
              <Fragment key={cell.key}>
                {cellIndex > 0 ? <VRule /> : null}
                <Cell cell={cell} />
              </Fragment>
            ))}
          </XStack>
        </Fragment>
      ))}
    </YStack>
  );
}

/**
 * Một ô: hình + giá trị ở hàng trên, nhãn xuống dưới, chú thích (nếu có) dưới cùng.
 *
 * `minWidth={0}` là thứ giữ ô không nở theo nội dung — thiếu nó, một số tiền dài đẩy ô bên cạnh
 * co lại và hai cột hết bằng nhau.
 */
function Cell({ cell }: { cell: StatCell }) {
  return (
    <YStack
      f={1}
      minWidth={0}
      px={space.md}
      py={space.sm}
      gap={2}
      accessible
      accessibilityLabel={`${cell.fullLabel ?? cell.label}: ${cell.value}`}
    >
      <XStack ai="center" gap={space.xs}>
        <Ionicons name={cell.icon} size={iconSize.sm} color={cell.tone} />
        <Text
          f={1}
          minWidth={0}
          col={cell.valueTone ?? colors.text}
          fos={fontSize.h4}
          fow={fontWeight.bold}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={MIN_FONT_SCALE}
        >
          {cell.value}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {cell.label}
      </Text>
    </YStack>
  );
}

/** Đường kính huy hiệu tròn dẫn đầu một hàng ở biến thể `list`. */
const BADGE_SIZE = 32;

/**
 * Một hàng của biến thể `list`: huy hiệu tròn · nhãn đầy đủ · con số căn phải.
 *
 * Nhãn `f={1}` còn con số `flexShrink={0}`: khi hết chỗ thì NHÃN xuống dòng, con số không bao
 * giờ bị cắt. Một số tiền cụt là con số SAI, còn một nhãn hai dòng thì chỉ là cao thêm một chút.
 *
 * Con số căn phải để cả cột số thẳng hàng — mắt dò dọc theo mép phải nhanh hơn nhiều so với dò
 * những con số bắt đầu ở bảy vị trí khác nhau.
 */
function ListRow({ cell }: { cell: StatCell }) {
  return (
    <XStack
      ai="center"
      gap={space.sm}
      px={space.md}
      py={space.sm}
      accessible
      accessibilityLabel={`${cell.fullLabel ?? cell.label}: ${cell.value}`}
    >
      <YStack
        w={BADGE_SIZE}
        h={BADGE_SIZE}
        br={radius.pill}
        bg={cell.surface ?? colors.surfaceMuted}
        bw={1}
        bc={cell.tone}
        ai="center"
        jc="center"
      >
        <Ionicons name={cell.icon} size={iconSize.sm} color={cell.tone} />
      </YStack>

      <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
        {cell.label}
      </Text>

      <Text
        flexShrink={0}
        col={cell.valueTone ?? colors.text}
        fos={fontSize.body}
        fow={fontWeight.bold}
        ta="right"
        numberOfLines={1}
      >
        {cell.value}
      </Text>
    </XStack>
  );
}

/** Kẻ ngang giữa hai hàng. */
function HRule() {
  return <YStack h={1} bg={colors.borderSubtle} />;
}

/** Kẻ dọc giữa hai ô — `alignSelf: stretch` để nó cao bằng hàng, không bằng nội dung ô nào. */
function VRule() {
  return <YStack w={1} bg={colors.borderSubtle} alignSelf="stretch" />;
}
