import {
  useController,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TURNAROUND_BUFFER_MAX_MINUTES, TURNAROUND_BUFFER_PRESET_MINUTES } from '@xeprime/types';
import { NumberField } from '@/components/ui/NumberField';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SwitchRow } from '@/components/ui/SwitchRow';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

const INHERIT = 'shop';
const CUSTOM = 'custom';
/** Số phút gợi ý khi chọn "Khác" — ô nhập hiện ra với một giá trị dùng được ngay. */
const CUSTOM_START_MINUTES = 30;

/**
 * Chọn thời gian chết giữa hai chuyến: Không có · 1 giờ · 2 giờ · Khác (ô nhập phút) — bản native
 * của `TurnaroundBufferField` bên web (PR #280). Dùng chung cho mặc định gian hàng (màn Chính sách
 * thuê) và thiết lập của một xe, nên hai nơi hỏi cùng một câu bằng cùng một bộ lựa chọn.
 *
 * `inherit` (chỉ màn xe của GIAN HÀNG): thêm lựa chọn đầu "Theo gian hàng (X)" — chọn nó là bật cờ
 * kế thừa của nơi gọi, xe đọc số từ mặc định gian hàng ở server.
 */
export function TurnaroundBufferField<T extends FieldValues>({
  control,
  name,
  label,
  inherit,
  disabled,
  notice = true,
}: {
  control: Control<T>;
  name: Path<T>;
  /** Tên nhóm lựa chọn cho trình đọc màn hình — web `aria-label={label}` của `Radio.Group`. */
  label: string;
  inherit?: { active: boolean; label: string; onChange: (active: boolean) => void };
  disabled?: boolean;
  /** Dải "chỉ áp cho lịch giữ MỚI…" — nơi gọi đã nói câu đó ở chỗ khác thì tắt. */
  notice?: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const colors = useColors();
  const minutes = useController({ control, name });
  const value = useWatch({ control, name }) as number | null;
  const isPreset =
    value != null && (TURNAROUND_BUFFER_PRESET_MINUTES as readonly number[]).includes(value);
  const selected: number | typeof INHERIT | typeof CUSTOM = inherit?.active
    ? INHERIT
    : isPreset
      ? value
      : CUSTOM;

  const select = (next: number | typeof CUSTOM | typeof INHERIT) => {
    if (disabled) return;
    inherit?.onChange(next === INHERIT);
    if (next === INHERIT) return;
    minutes.field.onChange(
      (next === CUSTOM ? CUSTOM_START_MINUTES : next) as PathValue<T, Path<T>>,
    );
  };

  const tabValue = selected === INHERIT ? CUSTOM : String(selected);
  const items = [
    ...TURNAROUND_BUFFER_PRESET_MINUTES.map((preset) => ({
      key: String(preset),
      label: preset === 0 ? t('handover.bufferNone') : t('common.hours', { count: preset / 60 }),
    })),
    { key: CUSTOM, label: t('handover.bufferCustom') },
  ];

  return (
    <YStack gap={space.sm + space.xs}>
      {/*
        "Theo gian hàng (X)" (chỉ xe của gian hàng): Figma `24705:45812` chỉ vẽ khay 4 ô - năm ô không
        vừa bề ngang điện thoại, nên lựa chọn kế thừa thành MỘT hàng công tắc ngay trên khay. Bật = theo
        gian hàng (khay ẩn); tắt = chọn số riêng của xe, bắt đầu từ chính số gian hàng (nơi gọi lo).
      */}
      {inherit ? (
        <SwitchRow
          title={inherit.label}
          value={inherit.active}
          disabled={disabled ?? false}
          onChange={(next) => (next ? select(INHERIT) : inherit.onChange(false))}
        />
      ) : null}

      {selected === INHERIT ? null : (
        <XStack
          opacity={disabled ? 0.6 : 1}
          pointerEvents={disabled ? 'none' : 'auto'}
          accessibilityLabel={label}
        >
          <SegmentedTabs
            variant="neutral"
            fit
            items={items}
            value={tabValue}
            onChange={(key) => select(key === CUSTOM ? CUSTOM : Number(key))}
          />
        </XStack>
      )}

      {selected === CUSTOM ? (
        <NumberField
          control={control}
          name={name}
          label={t('handover.bufferCustomLabel')}
          suffix={t('handover.bufferUnit')}
          integer
          required
          min={0}
          max={TURNAROUND_BUFFER_MAX_MINUTES}
          editable={!disabled}
        />
      ) : null}

      {/* Figma "Schedule Notice" `24705:45842`: nền `status/information-low`, chữ xanh 14 medium. */}
      {notice ? (
        <YStack bg={colors.infoLow} br={radius.control} p={space.sm + space.xs}>
          <Text
            col={colors.infoStrong}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
          >
            {t('handover.scopeNote')}
          </Text>
        </YStack>
      ) : null}
    </YStack>
  );
}
