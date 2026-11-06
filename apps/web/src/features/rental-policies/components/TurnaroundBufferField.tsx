'use client';

import { Radio } from 'antd';
import { useTranslations } from 'next-intl';
import {
  useController,
  useWatch,
  type Control,
  type FieldValues,
  type Path,
  type PathValue,
} from 'react-hook-form';
import { TURNAROUND_BUFFER_MAX_MINUTES, TURNAROUND_BUFFER_PRESET_MINUTES } from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';

import styles from './TurnaroundBufferField.module.css';

const INHERIT = 'shop';
const CUSTOM = 'custom';
/** Số phút gợi ý khi bấm "Khác" — ô nhập hiện ra với một giá trị dùng được ngay. */
const CUSTOM_START_MINUTES = 30;

/**
 * Chọn thời gian chết giữa hai chuyến: Không có · 1 giờ · 2 giờ · Khác (ô nhập phút) — design
 * `24047:77405`. Dùng chung cho mặc định gian hàng (trang Chính sách thuê) và thiết lập của một xe
 * (màn sửa xe), nên hai nơi hỏi cùng một câu bằng cùng một bộ nút.
 *
 * `inherit` (chỉ màn sửa xe của gian hàng): thêm lựa chọn đầu "Theo gian hàng (X)" — chọn nó là
 * bật cờ kế thừa của nơi gọi, xe đọc số từ mặc định gian hàng ở server.
 */
export function TurnaroundBufferField<T extends FieldValues>({
  control,
  name,
  inherit,
  disabled,
  label,
  notice = true,
}: {
  control: Control<T>;
  name: Path<T>;
  inherit?: { active: boolean; label: string; onChange: (active: boolean) => void };
  disabled?: boolean;
  /** Tên khả truy cập của nhóm nút — tiêu đề khối đứng ngoài. */
  label: string;
  /** Dải xanh "chỉ áp cho lịch giữ MỚI…" — màn sửa xe đã đưa câu này vào icon ⓘ của tiêu đề. */
  notice?: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const minutes = useController({ control, name });
  const value = useWatch({ control, name }) as number | null;
  const isPreset = value != null && TURNAROUND_BUFFER_PRESET_MINUTES.includes(value);
  const selected = inherit?.active ? INHERIT : isPreset ? value : CUSTOM;

  function select(next: number | typeof CUSTOM | typeof INHERIT) {
    inherit?.onChange(next === INHERIT);
    if (next === INHERIT) return;
    minutes.field.onChange(
      (next === CUSTOM ? CUSTOM_START_MINUTES : next) as PathValue<T, Path<T>>,
    );
  }

  return (
    <div className={styles.root}>
      <Radio.Group
        value={selected}
        disabled={disabled}
        optionType="button"
        aria-label={label}
        className={styles.options}
        onChange={(event) => select(event.target.value as number | typeof CUSTOM | typeof INHERIT)}
      >
        {inherit ? <Radio.Button value={INHERIT}>{inherit.label}</Radio.Button> : null}
        {TURNAROUND_BUFFER_PRESET_MINUTES.map((preset) => (
          <Radio.Button key={preset} value={preset}>
            {preset === 0 ? t('handover.bufferNone') : t('common.hours', { count: preset / 60 })}
          </Radio.Button>
        ))}
        <Radio.Button value={CUSTOM}>{t('handover.bufferCustom')}</Radio.Button>
      </Radio.Group>

      {selected === CUSTOM ? (
        <div className={styles.custom}>
          <NumberField
            control={control}
            name={name}
            label={t('handover.bufferCustomLabel')}
            addonAfter={t('handover.bufferUnit')}
            min={0}
            max={TURNAROUND_BUFFER_MAX_MINUTES}
            disabled={disabled}
          />
        </div>
      ) : null}

      {notice ? <p className={styles.notice}>{t('handover.scopeNote')}</p> : null}
    </div>
  );
}
