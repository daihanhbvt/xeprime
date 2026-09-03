import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

export function DataRow({
  label,
  hint,
  value,
  action,
  valueHint,
  tone = 'default',
  strong = false,
  block = false,
}: {
  label: string;
  /** Dòng phụ dưới NHÃN — giải thích nhãn nghĩa là gì. */
  hint?: string;
  value: string;
  /**
   * Nút nhỏ đứng NGAY CẠNH giá trị — "Sửa" của phí giao nhận chẳng hạn.
   *
   * Cạnh con số nó sửa, không dồn lên thanh hành động chung: người dùng nghĩ tới việc sửa khi
   * đang NHÌN con số, và một nút ở khối khác bắt họ nhớ giá trị cũ trong lúc đi tìm chỗ đổi.
   */
  action?: ReactNode;
  /**
   * Dòng phụ dưới GIÁ TRỊ — thuộc tính thứ hai của chính giá trị đó (biển số dưới tên xe).
   *
   * Tách hẳn khỏi `hint` vì hai thứ nằm hai cột và trả lời hai câu khác nhau. Nhét biển số vào
   * `hint` thì nó rơi xuống dưới chữ "Xe" — đọc thành "Xe / 59H1-865.65" ở cột trái và tên xe
   * đứng trơ một mình bên phải.
   */
  valueHint?: string;
  tone?: 'default' | 'muted' | 'discount' | 'danger' | 'price';
  strong?: boolean;
  block?: boolean;
}) {
  const valueColor =
    tone === 'price'
      ? colors.price
      : tone === 'discount'
        ? colors.discount
        : tone === 'danger'
          ? colors.danger
          : tone === 'muted'
            ? colors.textMuted
            : colors.text;

  const valueText = (
    <YStack gap={2} {...(block ? {} : { f: 7 })}>
      <XStack ai="center" gap={space.xs} jc={block ? 'flex-start' : 'flex-end'}>
        {/*
          `flexShrink` phải khai TƯỜNG MINH: trong React Native nó mặc định là 0, không phải 1
          như CSS. Thiếu nó thì một giá trị dài ("Chưa ghi nhận đã thu cọc") giữ nguyên bề rộng
          tự nhiên, tràn khỏi cột của nó và — vì cột căn phải — tràn NGƯỢC sang trái, đè lên
          chính cái nhãn của dòng.
        */}
        <Text
          col={valueColor}
          flexShrink={1}
          fos={strong ? fontSize.body : fontSize.bodySm}
          fow={strong ? fontWeight.bold : fontWeight.medium}
          ta={block ? 'left' : 'right'}
        >
          {value}
        </Text>
        {action}
      </XStack>
      {valueHint ? (
        <Text col={colors.placeholder} fos={fontSize.label} ta={block ? 'left' : 'right'}>
          {valueHint}
        </Text>
      ) : null}
    </YStack>
  );

  const labelBlock = (
    <YStack gap={2} {...(block ? {} : { f: 3 })}>
      <Text
        col={colors.textMuted}
        flexShrink={1}
        fos={fontSize.bodySm}
        fow={strong ? fontWeight.semibold : fontWeight.regular}
      >
        {label}
      </Text>
      {hint ? (
        <Text col={colors.placeholder} fos={fontSize.label}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );

  if (block) {
    return (
      <YStack gap={2}>
        {labelBlock}
        {valueText}
      </YStack>
    );
  }

  return (
    <XStack ai="flex-start" jc="space-between" gap={space.md}>
      {labelBlock}
      {valueText}
    </XStack>
  );
}

export function Divider() {
  return <YStack height={1} bg={colors.borderSubtle} />;
}
