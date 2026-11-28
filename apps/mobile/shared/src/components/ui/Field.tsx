import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Text, XStack } from 'tamagui';
import { useFieldFeedback } from '@/components/motion/use-field-feedback';
import { useTranslations } from 'use-intl';
import { IS_PARTNER_APP } from '@/lib/app-kind';
import { InfoHint, TextWithHint } from './InfoHint';
import { useColors } from '@/theme/ThemeProvider';
import {
  buttonHeight,
  fieldFontSize,
  fontWeight,
  iconSize,
  radius,
  sizing,
  space,
  typeScale,
} from '@/theme/tokens';

/**
 * Khe nhãn ↔ khung theo bộ ô hiện hành. MỌI ô (gõ, số, tiền, ngày, chọn) đọc từ đây để một form
 * trộn nhiều loại ô vẫn đều nhịp - trước 26/11/2026 ô số/tiền/ngày còn dùng khe cũ.
 */
export function useFieldGap(): number {
  return useFieldAppearance() === 'v2' ? FIELD_V2.labelGap : space.xs;
}

/**
 * Cỡ chữ + chiều cao của `TextInput` MỘT dòng theo bộ ô hiện hành - một nguồn cho `TextField`,
 * `TextControl`, `NumberControl`, `MoneyControl`. Người dùng báo 26/11/2026 ô Odo/Chi phí cao
 * hơn ô bên cạnh (48 so với 44) vì hai ô đó chưa đọc bộ `v2`.
 */
export function useSingleLineInputMetrics(): { fontSize: number; minHeight: number } {
  return useFieldAppearance() === 'v2'
    ? { fontSize: FIELD_V2.valueFontSize, minHeight: FIELD_V2.height - 2 }
    : { fontSize: fieldFontSize.value, minHeight: sizing.touchTarget };
}

/** Gợi ý dài hơn mức này thì gọn vào dấu ⓘ. */
const HINT_INLINE_MAX = 60;

/**
 * Hình dạng của bộ ô nhập (nhãn + khung + chữ trong ô):
 * - `default` - bộ ô chung của app (nhãn 12 đậm, khung bo 10, viền `border`, cao 48).
 * - `v2` - "_Select input base" của Figma Partner-XePrime (`24464:24574` · `24464:24953`): nhãn
 *   14/20 đậm vừa màu `text/gray/medium`, khung bo 12 viền `stroke/gray-low300`, đệm ngang 14,
 *   chữ 14, biểu tượng 20, placeholder `text/gray/very-low`.
 *
 * Đi qua CONTEXT chứ không qua prop: một form bọc `<FieldAppearanceProvider value="v2">` là mọi ô
 * bên trong (kể cả ô nằm sâu trong `AddressFields`, `VerifiedPhoneField`) đổi theo, không phải
 * luồn một prop qua từng tầng. Màn không bọc giữ nguyên bộ ô chung.
 */
export type FieldAppearance = 'default' | 'v2';

/*
 * MẶC ĐỊNH là `v2` cho MỌI ô của cả hai app (người dùng 25/11/2026: "bắt buộc mọi input theo style
 * này"). `default` chỉ còn để một màn chủ động bọc `<FieldAppearanceProvider value="default">`.
 */
const FieldAppearanceContext = createContext<FieldAppearance>('v2');

export const FieldAppearanceProvider = FieldAppearanceContext.Provider;

export function useFieldAppearance(): FieldAppearance {
  return useContext(FieldAppearanceContext);
}

/**
 * Số đo của bộ ô `v2`. Khung cao 44 (= nút `md`) thay vì 40 của bản vẽ: nút "Gửi mã OTP" đứng
 * cạnh ô SĐT phải bằng đúng chiều cao ô, và 44 là sàn chạm của nút.
 */
export const FIELD_V2 = {
  /** Khe nhãn ↔ khung (Figma 6). */
  labelGap: 6,
  /** Dòng của nhãn 14/20. */
  labelLineHeight: typeScale.body.lineHeight,
  /** Đệm ngang trong khung. */
  padX: 14,
  height: buttonHeight.md,
  icon: iconSize.lg,
  /** Cỡ chữ của NHÃN (Figma `14px/Medium`). */
  fontSize: typeScale.body.fontSize,
  /**
   * Chữ GÕ VÀO / giá trị đã chọn / placeholder trong khung - Figma component gốc "Input - Select"
   * (`1111:1232`, `16px/Regular`). Một số cho MỌI ô v2 (TextField, SelectControl…): người dùng báo
   * chữ trong ô nhỏ hơn Figma 20/11/2026 khi ô gõ đang 14 còn ô chọn 16.
   */
  valueFontSize: typeScale.body.fontSize,
  /**
   * Ô CHỌN / ô NGÀY (dropdown, "Thời gian") - Figma tab Lịch sử của hồ sơ khách `24494:25402`: chữ giá trị và
   * placeholder `14px/Regular` (nhỏ hơn 16 của ô gõ), icon 20 ở mép phải, nền trắng viền `stroke/gray-low300`.
   */
  selectFontSize: typeScale.body.fontSize,
} as const;

/**
 * Gợi ý DÀI của một ô đứng cạnh NHÃN dưới dạng dấu ⓘ (người dùng 25/11/2026, mọi tấm trượt/hộp thoại):
 * "Số điện thoại ⓘ" - chạm mở tấm đọc đủ. Gợi ý ngắn vẫn hiện thẳng dưới ô. Mỗi ô gọi CẢ HAI hàm:
 * `inLabelHint` cho nhãn, `belowHint` cho `FieldMessage` - để một gợi ý không hiện hai lần.
 */
export function inLabelHint(hint: string | undefined, force = false): string | undefined {
  /*
   * App Partner: MỌI ghi chú của ô (khoá vì xe đang trên chợ, chọn theo mẫu xe, gợi ý…) thành ⓘ cạnh
   * nhãn, không còn dòng dưới ô - đúng ngôn ngữ Figma Partner (người dùng 27/11/2026, màn sửa xe).
   */
  return hint && (force || IS_PARTNER_APP || hint.length > HINT_INLINE_MAX) ? hint : undefined;
}

/** `force` PHẢI trùng với `inLabelHint` của cùng ô - ép gợi ý lên nhãn thì dưới ô không lặp lại. */
export function belowHint(hint: string | undefined, force = false): string | undefined {
  return inLabelHint(hint, force) ? undefined : hint;
}

export function FieldLabel({
  label,
  required = false,
  publishRequired = false,
  hint,
}: {
  label: string;
  required?: boolean;
  /** Gợi ý dài hiện thành ⓘ ngay sau nhãn - truyền `inLabelHint(hint)`. */
  hint?: string | undefined;
  /**
   * Dấu `●` "cần bổ sung trước khi gửi duyệt công khai" — KHÁC hẳn `*` bắt buộc-để-lưu.
   *
   * Hai giai đoạn, hai dấu (`PublishRequiredMark` bên web): xe lưu được vào kho nội bộ mà chưa
   * có biển số hay ảnh đại diện, nhưng không lên chợ được nếu thiếu. Gộp chúng thành một `*` đỏ
   * là nói dối ở cả hai chiều — chặn người dùng lưu một bản nháp, hoặc để họ bấm gửi duyệt rồi
   * mới biết thiếu.
   *
   * Dấu tự nó không mang nghĩa với trình đọc màn hình nên phần chữ đi kèm mới là thứ đọc được.
   */
  publishRequired?: boolean;
}) {
  const colors = useColors();
  const tMark = useTranslations('Vehicles.completeness');
  const v2 = useFieldAppearance() === 'v2';

  /*
    Nhãn dùng màu CHỮ CHÍNH, không phải `textMuted`.

    Nhãn, chữ gợi ý và chữ trong ô mà cùng một tông mờ thì ba loại nội dung khác hẳn nhau đọc ra
    như một khối. Nhãn là thứ được quét đầu tiên khi dò form nên nó phải đậm nhất trong ba; chữ
    gợi ý ở `FieldMessage` mới là phần được phép mờ.
  */
  /*
    Dấu ⓘ LỒNG trong dòng chữ (`TextWithHint`, người dùng 28/11/2026): nhãn dài xuống dòng thì ⓘ
    vẫn đứng sát chữ cuối ("…có tài xế ⓘ"), không bị đẩy ra mép phải. Cỡ BẰNG chữ nhãn (25/11/2026).
  */
  return (
    <TextWithHint
      hint={hint}
      hintLabel={label}
      col={v2 ? colors.textMuted : colors.text}
      fos={v2 ? FIELD_V2.fontSize : fieldFontSize.label}
      {...(v2 ? { lh: FIELD_V2.labelLineHeight } : {})}
      fow={v2 ? fontWeight.medium : fontWeight.semibold}
    >
      {label}
      {required ? <Text col={colors.danger}> *</Text> : null}
      {publishRequired ? (
        <Text col={colors.warning} accessibilityLabel={tMark('publishRequiredSr')}>
          {' ●'}
        </Text>
      ) : null}
    </TextWithHint>
  );
}

export function FieldMessage({
  error,
  hint,
}: {
  error?: string | undefined;
  hint?: string | undefined;
}) {
  const colors = useColors();
  const tLabels = useTranslations('Common.labels');
  if (error) {
    return (
      // Chỉ chữ đỏ, KHÔNG icon (!) - người dùng chốt 26/11/2026, áp cho mọi lỗi ô nhập của app.
      <Text col={colors.danger} fos={fieldFontSize.message}>
        {error}
      </Text>
    );
  }
  if (hint) {
    // Gợi ý DÀI không chiếm chỗ dưới ô: gọn thành dấu ⓘ + "Ghi chú", chạm mở tấm trượt đọc đủ
    // (người dùng 17/11/2026). Gợi ý ngắn vẫn hiện thẳng.
    if (hint.length > HINT_INLINE_MAX) {
      return (
        <XStack ai="center" gap={space.xs}>
          <InfoHint content={hint} label={tLabels('note')} size={fieldFontSize.message} />
          <Text col={colors.textMuted} fos={fieldFontSize.message}>
            {tLabels('note')}
          </Text>
        </XStack>
      );
    }
    return (
      <Text col={colors.textMuted} fos={fieldFontSize.message}>
        {hint}
      </Text>
    );
  }
  return null;
}

/** Khung thấp của hàng lọc (Figma "Input - Select" min-h 40, bằng ô tìm `field`). */
const COMPACT_FIELD_HEIGHT = 40;

export function FieldShell({
  children,
  focused = false,
  invalid = false,
  disabled = false,
  align = 'center',
  compact = false,
  onPress,
  accessibilityRole,
  accessibilityLabel,
}: {
  children: ReactNode;
  focused?: boolean;
  invalid?: boolean;
  /**
   * Ô chỉ đọc — nền xám, viền nhạt.
   *
   * `editable={false}` của React Native chỉ CHẶN gõ chứ không đổi hình: ô khoá trông y hệt ô
   * nhập được, và người dùng chạm vào rồi tưởng bàn phím hỏng. Web có `disabled` của AntD lo
   * phần này; ở đây phải tự vẽ.
   */
  disabled?: boolean;
  align?: 'center' | 'flex-start';
  /** Khung thấp 40 (Figma "Input - Select" ở hàng lọc, cạnh ô tìm `field`). */
  compact?: boolean;
  onPress?: () => void;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const v2 = useFieldAppearance() === 'v2';
  const shellRadius = v2 ? radius.control : radius.md;
  const restColor = v2 ? colors.borderInput : colors.border;
  const active = invalid ? colors.danger : colors.primary;
  // Lắc khi vừa lỗi + viền đổi màu mượt: lớp viền phủ animate màu, khung trong giữ viền nghỉ.
  const feedback = useFieldFeedback({
    invalid,
    highlighted: focused || invalid,
    restColor,
    activeColor: active,
  });

  /*
   * Nền TRẮNG + viền thấy được — không phải một mảng xám.
   *
   * Bản đầu tô `surfaceMuted` cho cả ô. Trên một form dài, mười mảng xám xếp dọc làm cả màn
   * thành một khối xám điệp: mắt không tách được đâu là ô nhập, đâu là nền, và không ô nào nổi
   * lên khi được chọn. Nền trắng đẩy chữ người dùng gõ lên trước, còn ranh giới ô do VIỀN vẽ —
   * đúng cách `<Input>` của AntD làm bên web, nên hai bên cũng đọc giống nhau.
   *
   * Viền lúc nghỉ = `border` (`color-border` #e9eaeb) — đúng `colorBorder` mà theme AntD của web
   * (`apps/web/src/styles/theme.ts`) đặt cho `<Input>`/`<Select>`; bo `radius.md` = `borderRadius`
   * của AntD. Người dùng chốt 27/10/2026 đổi từ `borderInput` (đậm hơn) về đúng web.
   *
   * Ba trạng thái đọc được bằng MÀU VIỀN, không bằng độ dày: đổi `borderWidth` khi focus làm
   * nội dung nhảy 1px mỗi lần chạm vào ô.
   */
  return (
    <Animated.View style={feedback.shake}>
    <XStack
      ai={align}
      gap={space.sm}
      bg={disabled ? colors.surfaceMuted : colors.surface}
      br={shellRadius}
      bw={1}
      bc={restColor}
      px={v2 ? FIELD_V2.padX : space.sm}
      minHeight={compact ? COMPACT_FIELD_HEIGHT : v2 ? FIELD_V2.height : sizing.touchTarget}
      {...(onPress ? { onPress } : {})}
      {...(accessibilityRole ? { accessibilityRole } : {})}
      {...(accessibilityLabel ? { accessibilityLabel } : {})}
    >
      {children}
    </XStack>
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderWidth: 1, borderRadius: shellRadius }, feedback.border]}
    />
    </Animated.View>
  );
}
