import { Ionicons } from '@expo/vector-icons';
import { Fragment, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { Divider } from './DataRow';
import { DetailChevron } from './DetailArrow';
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
   * Nền NHẠT dẫn xuất từ {@link StatCell.tone} — huy hiệu tròn ở biến thể `list`, và cả dải nền
   * của hàng tổng ({@link StatGrid} `total`).
   *
   * Bỏ trống thì dùng nền chìm trung tính. Ở biến thể `grid` hình đứng trần cạnh con số nên
   * trường này bị bỏ qua — một huy hiệu tròn trong ô rộng 145dp là ăn mất chỗ của chính con số.
   */
  surface?: string;
  /**
   * Màu CHỮ SỐ — chỉ đặt khi con số đang CẦN CHÚ Ý (lỗ, còn nợ). Tô đỏ một số 0 là báo động giả.
   *
   * Đừng chép lại {@link StatCell.tone} vào đây. Hình đã mang màu phân loại rồi; tô con số cùng
   * màu đó nữa là cùng một thông tin nói hai lần, và khi mọi ô đều được tô thì màu hết còn nghĩa
   * "để ý cái này" — một dải bốn ô xanh-đỏ-xanh-đỏ chỉ còn là một dải sặc sỡ.
   */
  valueTone?: string;
  /**
   * Dòng CHÚ THÍCH dưới nhãn — phần con số không tự nói được ("7 đơn", "Biên 76,6%").
   *
   * Cả hai biến thể đều vẽ nó, luôn nằm dưới NHÃN chứ không dưới con số: nó giải thích cái nhãn
   * ("Chi phí — trong đó bao nhiêu chưa gắn xe"), và treo nó dưới cột số bên phải thì nó đọc
   * thành một con số thứ hai.
   *
   * Truyền MẢNG khi có nhiều mẩu độc lập — mỗi mẩu một dòng. Nối chúng bằng dấu ` · ` thì hai
   * số tiền dính vào nhau thành một dòng dài phải dò mới tách ra được ("Tiền mặt 40.000.000 ₫ ·
   * Chuyển khoản 56.500.000 ₫"); mỗi dòng một khoản thì mắt bắt được ngay cả hai.
   */
  hint?: string | readonly string[];
  /**
   * Mở tập dữ liệu SINH RA con số này.
   *
   * Có `onPress` thì ô thành một nút và mọc mũi tên `>`. Đây là điều kiện để một thẻ tổng không
   * nói dối: bấm vào "Doanh thu" phải mở đúng những phiếu đã cộng nên nó — thẻ nào không dẫn đi
   * đâu được thì cứ để trống, một thẻ bấm được mà không có đích còn tệ hơn một thẻ chỉ để đọc.
   */
  onPress?: () => void;
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
 *
 * Ngoại lệ duy nhất là khi ô lẻ đó là một cái TỔNG: nó chưa bao giờ thuộc về lưới, và một con số
 * nở hết bề ngang ở hàng cuối trông đúng như một lưới hụt ô. Đưa nó vào `total`.
 */
export function StatGrid({
  cells,
  columns = 2,
  variant = 'grid',
  total,
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
  /**
   * Hàng TỔNG đóng đáy bảng — con số mà các ô phía trên cộng/trừ ra ("Lợi nhuận" = doanh thu −
   * chi phí, "Cân đối" = tiền vào − tiền ra).
   *
   * Vì sao không để nó là ô cuối trong lưới: ba ô ở lưới hai cột thì ô thứ ba rơi xuống một hàng
   * riêng và nở hết bề ngang — con số dạt về nửa trái, nửa phải bỏ trống, đọc ra như một lưới bị
   * vỡ chứ không ra một kết quả. Nó còn nói SAI về quan hệ: một cái tổng đứng ngang hàng, cùng cỡ
   * chữ, với chính hai thành phần sinh ra nó.
   *
   * Hàng tổng phân biệt với các dòng trên bằng một VẠCH đậm hơn, nhãn ăn mực đen và cột hình để
   * trần — **không** bằng cỡ chữ. Xem {@link TotalRow}.
   */
  total?: StatCell;
}) {
  if (cells.length === 0 && !total) return null;

  /*
   * Bảng có ÍT NHẤT MỘT dòng dẫn đi đâu đó thì mọi dòng đều chừa sẵn chỗ cho mũi tên — kể cả
   * dòng không bấm được.
   *
   * Thiếu chỗ chừa này thì con số ở dòng có mũi tên bị đẩy vào trong đúng bằng bề rộng mũi tên,
   * còn dòng tổng (không dẫn đi đâu) thì chạm sát mép phải: hai cột số lệch nhau một quãng vừa
   * đủ để mắt thấy sai mà không gọi được tên. Cả lý do dùng dạng dòng sổ là để cột số thẳng một
   * mép — lệch ở đây là hỏng đúng thứ mình đi tìm.
   */
  const chevronSlot = cells.some((cell) => cell.onPress) || Boolean(total?.onPress);

  const rows: StatCell[][] = [];
  if (variant === 'grid') {
    for (let i = 0; i < cells.length; i += columns) rows.push(cells.slice(i, i + columns));
  }

  return (
    <YStack>
      {variant === 'list'
        ? cells.map((cell, index) => (
            <Fragment key={cell.key}>
              {index > 0 ? <HRule /> : null}
              <ListRow cell={cell} chevronSlot={chevronSlot} />
            </Fragment>
          ))
        : rows.map((row, rowIndex) => (
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
      {total ? (
        <>
          {cells.length > 0 ? <TotalRule /> : null}
          <TotalRow cell={total} chevronSlot={chevronSlot} />
        </>
      ) : null}
    </YStack>
  );
}

/**
 * Một ô: hình + giá trị ở hàng trên, nhãn xuống dưới, chú thích (nếu có) dưới cùng.
 *
 * `minWidth={0}` là thứ giữ ô không nở theo nội dung — thiếu nó, một số tiền dài đẩy ô bên cạnh
 * co lại và hai cột hết bằng nhau.
 *
 * Ô có `onPress` thì cả ô là vùng chạm và mọc mũi tên `>` cạnh nhãn — mũi tên đứng ở HÀNG NHÃN
 * chứ không hàng số, vì hàng số đã dùng `adjustsFontSizeToFit` và thêm một phần tử vào đó sẽ
 * bóp con số nhỏ đi ở mọi ô, kể cả ô không bấm được.
 */
function Cell({ cell }: { cell: StatCell }) {
  const body = (
    <YStack
      f={1}
      minWidth={0}
      px={space.md}
      py={space.sm}
      gap={2}
      accessible
      accessibilityRole={cell.onPress ? 'button' : undefined}
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
      <XStack ai="center" gap={space.xs}>
        <Text f={1} minWidth={0} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
          {cell.label}
        </Text>
        {cell.onPress ? <DetailChevron /> : null}
      </XStack>
      {/*
        Mỗi mẩu chú thích một DÒNG — cùng `hintLines` với biến thể danh sách.

        Đổ thẳng `cell.hint` vào một `<Text>` thì một mảng bị React Native nối liền KHÔNG dấu
        cách: "Tiền mặt 40.000.000 ₫Chuyển khoản 56.500.000 ₫". Hai kiểu dữ liệu cho cùng một
        trường thì cả hai biến thể phải đọc nó qua cùng một hàm.
      */}
      {hintLines(cell.hint).map((line) => (
        <Text key={line} col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
          {line}
        </Text>
      ))}
    </YStack>
  );

  if (!cell.onPress) return body;

  return (
    <Pressable
      onPress={cell.onPress}
      style={({ pressed }) => [pressableCell, pressed ? { opacity: 0.7 } : null]}
    >
      {body}
    </Pressable>
  );
}

/** Ô bấm được vẫn phải co giãn như ô thường — `Pressable` không kế thừa `f={1}` của con nó. */
const pressableCell = { flex: 1, minWidth: 0 } as const;

/** Đường kính huy hiệu tròn dẫn đầu một hàng ở biến thể `list`. */
const BADGE_SIZE = 32;

/** Chú thích về dạng MẢNG DÒNG — một chuỗi là một dòng, vắng mặt là không dòng nào. */
function hintLines(hint: StatCell['hint']): readonly string[] {
  if (hint === undefined) return [];
  return typeof hint === 'string' ? [hint] : hint;
}

/**
 * Nền của một hàng đang bị nhấn — SÁNG lên, không mờ đi.
 *
 * Mờ cả hàng là cách một cái nút phản hồi; một hàng trong danh sách thì phản hồi bằng nền, vì
 * thứ người dùng cần thấy là "tôi đang chạm vào ĐÚNG hàng này", không phải "hàng này đang tắt".
 */
const pressedRow = { backgroundColor: colors.surfaceMuted } as const;

/**
 * Một hàng của biến thể `list`: huy hiệu tròn · nhãn đầy đủ (+ chú thích) · con số căn phải.
 *
 * Nhãn `f={1}` còn con số `flexShrink={0}`: khi hết chỗ thì NHÃN xuống dòng, con số không bao
 * giờ bị cắt. Một số tiền cụt là con số SAI, còn một nhãn hai dòng thì chỉ là cao thêm một chút.
 *
 * Con số căn phải để cả cột số thẳng hàng — mắt dò dọc theo mép phải nhanh hơn nhiều so với dò
 * những con số bắt đầu ở bảy vị trí khác nhau.
 */
function ListRow({ cell, chevronSlot }: { cell: StatCell; chevronSlot: boolean }) {
  const body = (
    <YStack
      px={space.md}
      py={space.sm}
      gap={2}
      accessible
      accessibilityRole={cell.onPress ? 'button' : undefined}
      accessibilityLabel={`${cell.fullLabel ?? cell.label}: ${cell.value}`}
    >
      <XStack ai="center" gap={space.sm}>
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

        {chevronSlot ? (
          <YStack w={iconSize.sm} ai="center">
            {cell.onPress ? <DetailChevron /> : null}
          </YStack>
        ) : null}
      </XStack>

      {/*
        Chú thích chiếm TRỌN bề ngang còn lại, thụt vào bằng đúng cột huy hiệu.

        Nhét nó vào cột nhãn — chung hàng với con số — thì nó chỉ còn khoảng 150dp: "Tiền mặt
        40.000.000 ₫ · Chuyển khoản 56.500.000 ₫" bị cắt bằng "…" và người đọc mất hẳn phần
        chia theo phương thức. Một dòng riêng thì nó có gần gấp đôi chỗ.
      */}
      {hintLines(cell.hint).map((line) => (
        <Text
          key={line}
          paddingLeft={BADGE_SIZE + space.sm}
          col={colors.placeholder}
          fos={fontSize.label}
          numberOfLines={2}
        >
          {line}
        </Text>
      ))}
    </YStack>
  );

  if (!cell.onPress) return body;

  return (
    <Pressable onPress={cell.onPress} style={({ pressed }) => (pressed ? pressedRow : null)}>
      {body}
    </Pressable>
  );
}

/**
 * Hàng TỔNG của bảng — dạng DÒNG SỔ, cùng cột và cùng bậc chữ với {@link ListRow}.
 *
 * Ba thứ tách nó khỏi các dòng trên, không cái nào là cỡ chữ: một vạch ĐẬM hơn kẻ chia thường
 * ({@link TotalRule}), nhãn ăn mực đen + đậm thay vì mờ, và cột hình chỉ còn cái hình trần —
 * không huy hiệu, vì tổng không phải một chuỗi dữ liệu để mà gắn màu. Cho nó riêng một bậc chữ
 * là thêm bậc thứ ba vào một cái thẻ chỉ có hai loại chữ (số và nhãn), và cả thẻ đọc ra như chữ
 * lúc to lúc nhỏ.
 *
 * Hình vẫn chiếm đúng bề rộng huy hiệu để NHÃN của nó thẳng cột với nhãn các dòng trên — lệch
 * một cột ở dòng cuối là thứ mắt bắt được ngay, kể cả khi không gọi được tên.
 */
function TotalRow({ cell, chevronSlot }: { cell: StatCell; chevronSlot: boolean }) {
  const body = (
    <YStack
      px={space.md}
      py={space.sm}
      gap={2}
      {...(cell.surface ? { bg: cell.surface } : {})}
      accessible
      accessibilityRole={cell.onPress ? 'button' : undefined}
      accessibilityLabel={`${cell.fullLabel ?? cell.label}: ${cell.value}`}
    >
      <XStack ai="center" gap={space.sm}>
      <YStack w={BADGE_SIZE} ai="center">
        <Ionicons name={cell.icon} size={iconSize.sm} color={cell.tone} />
      </YStack>

      <Text
        f={1}
        minWidth={0}
        col={colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        numberOfLines={2}
      >
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

        {chevronSlot ? (
          <YStack w={iconSize.sm} ai="center">
            {cell.onPress ? <DetailChevron /> : null}
          </YStack>
        ) : null}
      </XStack>

      {/*
        Chú thích chiếm TRỌN bề ngang còn lại, thụt vào bằng đúng cột huy hiệu.

        Nhét nó vào cột nhãn — chung hàng với con số — thì nó chỉ còn khoảng 150dp: "Tiền mặt
        40.000.000 ₫ · Chuyển khoản 56.500.000 ₫" bị cắt bằng "…" và người đọc mất hẳn phần
        chia theo phương thức. Một dòng riêng thì nó có gần gấp đôi chỗ.
      */}
      {hintLines(cell.hint).map((line) => (
        <Text
          key={line}
          paddingLeft={BADGE_SIZE + space.sm}
          col={colors.placeholder}
          fos={fontSize.label}
          numberOfLines={2}
        >
          {line}
        </Text>
      ))}
    </YStack>
  );

  if (!cell.onPress) return body;

  return (
    <Pressable onPress={cell.onPress} style={({ pressed }) => (pressed ? pressedRow : null)}>
      {body}
    </Pressable>
  );
}

/**
 * Vạch trên hàng tổng — `border` chứ không `borderSubtle`.
 *
 * Cùng một sắc độ với kẻ chia giữa các dòng thì hàng tổng chỉ là dòng thứ tư. Đậm hơn một bậc là
 * quy ước kế toán cũ hơn cả màn hình: gạch một đường trước khi cộng.
 */
function TotalRule() {
  return <YStack h={1} bg={colors.border} />;
}

/**
 * Chân của một thẻ chỉ số: một vạch mảnh, rồi dải nền chìm.
 *
 * Chỗ của thứ NÓI VỀ các con số bên trên — câu "đã loại tiền cọc ra khỏi cả hai vế", hay một chỉ
 * số phụ kiểu "12 phiếu đã duyệt". Nền chìm tách chữ-để-đọc khỏi cột số-để-dò mà không phải thêm
 * một đường kẻ thứ hai, và nó đóng đáy thẻ nên thẻ có chỗ kết thúc thay vì cụt lửng.
 *
 * Nằm ở `components/ui/` vì hai màn tài chính đã cần đúng dải này: dựng tay lần thứ hai là lần
 * thứ hai chọn lại đệm, cỡ chữ và màu nền — và hai cái chân thẻ sẽ hết giống nhau.
 *
 * Đặt NGOÀI `<StatGrid>`, bên trong `<Card padded={false}>`: bảng số không sở hữu cái chân thẻ,
 * nó chỉ đứng ngay trên.
 */
export function StatCardFooter({ children }: { children: ReactNode }) {
  return (
    <>
      <Divider />
      <YStack px={space.md} py={space.sm} bg={colors.surfaceMuted}>
        {children}
      </YStack>
    </>
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
