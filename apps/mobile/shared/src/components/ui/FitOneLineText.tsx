import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'tamagui';

type TextProps = ComponentProps<typeof Text>;

/** Chừa một chút để làm tròn điểm ảnh không đẩy chữ xuống dòng / cắt mất ký tự cuối. */
const FIT_SAFETY = 0.98;
/** Bề rộng của bản đo ẩn - đủ rộng để câu không bao giờ xuống dòng khi đo. */
const MEASURE_WIDTH = 4000;

/**
 * Chữ MỘT dòng vừa KHÍT bề ngang khung - cho tiêu đề mà Figma vẽ `whitespace-nowrap`.
 *
 * Không dùng `adjustsFontSizeToFit`: trên Android nó co theo NẤC, thường co quá tay, nên chữ nhỏ hơn
 * cần thiết và phần thừa dồn hết về một bên (hai lề trông lệch - người dùng báo 20/11/2026). Ở đây đo
 * bề rộng TỰ NHIÊN của câu bằng một bản sao ẩn, rồi đặt cỡ chữ = cỡ gốc × (khung / câu): đủ chỗ thì
 * giữ nguyên cỡ gốc, thiếu chỗ thì nhỏ đúng bằng mức cần. Dòng cao giữ nguyên để bố cục không nhảy.
 */
export function FitOneLineText({
  children,
  fontSize,
  lineHeight,
  minScale = 0.7,
  accessibilityRole,
  ...textProps
}: Omit<TextProps, 'fos' | 'fontSize' | 'lh' | 'lineHeight' | 'numberOfLines' | 'children'> & {
  /**
   * Nội dung. Dạng HÀM nhận cỡ chữ đang dùng - cho đoạn `Text` lồng (link, chữ nhấn) khai lại đúng
   * cỡ, vì `Text` lồng của Tamagui không chắc kế thừa cỡ chữ của cha.
   */
  children: ReactNode | ((fontSize: number) => ReactNode);
  fontSize: number;
  lineHeight: number;
  /** Sàn co chữ - thấp hơn thì chấp nhận cắt "…" thay vì chữ không đọc nổi. */
  minScale?: number;
}) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const scale =
    boxWidth > 0 && naturalWidth > 0
      ? Math.max(minScale, Math.min(1, (boxWidth * FIT_SAFETY) / naturalWidth))
      : 1;

  return (
    <View style={styles.box} onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}>
      <Text
        {...textProps}
        {...(accessibilityRole ? { accessibilityRole } : {})}
        fos={fontSize * scale}
        lh={lineHeight}
        numberOfLines={1}
      >
        {typeof children === 'function' ? children(fontSize * scale) : children}
      </Text>
      {/* Bản đo: vô hình, không chạm, trình đọc màn hình bỏ qua. */}
      <View
        style={styles.measure}
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text
          {...textProps}
          fos={fontSize}
          lh={lineHeight}
          onTextLayout={(event) => {
            const widest = event.nativeEvent.lines.reduce((max, line) => Math.max(max, line.width), 0);
            if (widest > 0 && Math.abs(widest - naturalWidth) > 0.5) setNaturalWidth(widest);
          }}
        >
          {typeof children === 'function' ? children(fontSize) : children}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignSelf: 'stretch', overflow: 'hidden' },
  measure: { left: 0, opacity: 0, position: 'absolute', top: 0, width: MEASURE_WIDTH },
});
