'use client';

import { Alert, App, Button, DatePicker, Form, Input, Segmented, Select, Skeleton } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_BLOCK_REASON,
  VEHICLE_BLOCK_REASON_VALUES,
  type VehicleBlockReason,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { APP_TIME_ZONE, DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { getErrorMessage } from '@/services/api-client';
import { useBulkBlockDay, useBulkDayPreview } from '../hooks/use-bulk-day';
import { formatDateKey } from '../utils/calendar-date.util';
import styles from './BulkDayDialog.module.css';

/** Mở từ thẻ ngày: biết ngày được bấm và cụm ngày lễ chứa nó (nếu có). */
export interface BulkDayBlockState {
  /** Ngày người dùng bấm. */
  date: string;
  /** Cụm ngày lễ liền kề chứa `date` — dùng làm khoảng gợi ý cho chế độ nhiều ngày. */
  suggestedRange: { from: string; to: string };
}

type RangeMode = 'single' | 'range';

/**
 * Khoá TOÀN BỘ xe trong một khoảng — hộp ĐẦY ĐỦ, mở từ mũi tên trên thẻ ngày.
 * Thao tác một-chạm cho đúng một ngày nằm ở công tắc và không đi qua đây.
 *
 * Hai điều hộp này tồn tại để nói thẳng trước khi người dùng bấm:
 *
 *  1. **"Toàn bộ" nghĩa là tập xe đang hiển thị trên lưới**, sau bộ lọc loại xe / chi nhánh /
 *     từ khoá — không phải cả gian hàng.
 *  2. **Xe đang có đơn sẽ KHÔNG khoá được** (`EXCLUDE USING gist`, ADR 0006). Bảng tóm tắt nói
 *     ra con số. Một nút hứa "khoá hết" rồi âm thầm bỏ sót 8 xe là cách chắc chắn nhất để ai đó
 *     nhận một đơn vào đúng ngày họ tưởng đã đóng.
 *
 * `key` theo ngày đang mở: state form không được dính lại từ lần mở trước.
 */
export function BulkDayBlockDialog({
  state,
  onClose,
}: {
  state: BulkDayBlockState | null;
  onClose: () => void;
}) {
  return <BlockDialogInner key={state?.date ?? 'closed'} state={state} onClose={onClose} />;
}

/**
 * MỘT component dựng cả thân lẫn footer.
 *
 * Bản trước tách form ra component con rồi đẩy footer ngược lên vỏ bằng `useState` — và đó là
 * một vòng lặp render vô hạn: mỗi lần render tạo một phần tử JSX mới, `setState` thấy tham
 * chiếu khác nên render tiếp, mãi mãi. Test không bắt được vì hai dialog đều bị mock ở test
 * của lưới lịch. Giữ chung một component là cách duy nhất để footer đọc được state của form mà
 * không phải chuyền qua lại.
 */
function BlockDialogInner({
  state,
  onClose,
}: {
  state: BulkDayBlockState | null;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();

  const suggested = state?.suggestedRange ?? { from: '', to: '' };
  /** Cụm ngày lễ dài hơn một ngày ⇒ mở thẳng ở chế độ khoảng, đúng thứ người dùng đang định làm. */
  const suggestsRange = Boolean(state) && suggested.to !== suggested.from;

  const [mode, setMode] = useState<RangeMode>(suggestsRange ? 'range' : 'single');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const fallback = dayjs().tz(APP_TIME_ZONE).format(DAY_PARAM_FORMAT);
    return [
      dayjs.tz(suggested.from || fallback, APP_TIME_ZONE),
      dayjs.tz(suggested.to || fallback, APP_TIME_ZONE),
    ];
  });
  const [reason, setReason] = useState<VehicleBlockReason>(VEHICLE_BLOCK_REASON.NOT_FOR_RENT);
  const [note, setNote] = useState('');

  const from = mode === 'single' ? (state?.date ?? '') : range[0].format(DAY_PARAM_FORMAT);
  const to = mode === 'single' ? (state?.date ?? '') : range[1].format(DAY_PARAM_FORMAT);

  const preview = useBulkDayPreview(from, to, state !== null);
  const block = useBulkBlockDay();

  const vehicles = preview.data?.vehicles ?? [];
  const dayCount = preview.data?.dayCount ?? 1;
  /** Xe khoá được ít nhất một ngày — chỉ những chiếc này mới đáng gửi lên. */
  const blockable = vehicles.filter((v) => v.busyDates.length < dayCount);
  const fullyBusy = vehicles.length - blockable.length;

  function submit() {
    if (blockable.length === 0) return;
    block.mutate(
      {
        from,
        to,
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        vehicleIds: blockable.map((v) => v.vehicleId),
      },
      {
        onSuccess: (result) => {
          message.success(
            t('bulkBlock.done', {
              days: result.blockedDays,
              vehicles: result.fullyBlockedVehicles + result.partiallyBlockedVehicles,
            }),
          );
          onClose();
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  return (
    <ResponsiveDialog
      open={state !== null}
      onClose={onClose}
      size="md"
      mobileMode="fullscreen"
      title={t('bulkBlock.title')}
      /* Footer của ResponsiveDialog dính đáy — thân dài bao nhiêu thì nút vẫn ở đúng chỗ đó. */
      footer={
        <>
          <Button onClick={onClose} disabled={block.isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="primary"
            loading={block.isPending}
            disabled={preview.isLoading || blockable.length === 0}
            onClick={submit}
          >
            {t('bulkBlock.submit', { count: blockable.length })}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('bulkBlock.scope')}>
          <Segmented<RangeMode>
            value={mode}
            onChange={setMode}
            options={[
              {
                label: t('bulkBlock.modeSingle', { date: formatDateKey(state?.date ?? '') }),
                value: 'single',
              },
              { label: t('bulkBlock.modeRange'), value: 'range' },
            ]}
            block
          />
        </Form.Item>

        {mode === 'range' ? (
          <Form.Item label={t('bulkBlock.range')} required>
            <DatePicker.RangePicker
              value={range}
              format="DD/MM/YYYY"
              allowClear={false}
              className={styles.fullWidth}
              onChange={(next) => {
                if (next?.[0] && next[1]) setRange([next[0], next[1]]);
              }}
            />
            {suggestsRange ? (
              <div className={styles.hint}>
                {t('bulkBlock.holidayRangeHint', {
                  from: formatDateKey(suggested.from),
                  to: formatDateKey(suggested.to),
                })}
              </div>
            ) : null}
          </Form.Item>
        ) : null}

        <Form.Item label={t('bulkBlock.reason')} required>
          <Select<VehicleBlockReason>
            value={reason}
            onChange={setReason}
            className={styles.fullWidth}
            aria-label={t('bulkBlock.reason')}
            options={VEHICLE_BLOCK_REASON_VALUES.map((value) => ({
              value,
              label: domainLabel('vehicleBlockReason', value),
            }))}
          />
        </Form.Item>

        <Form.Item label={t('bulkBlock.note')}>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={2000}
            placeholder={t('bulkBlock.notePlaceholder')}
          />
        </Form.Item>

        {preview.isLoading ? (
          <Skeleton active paragraph={{ rows: 2 }} />
        ) : preview.isError ? (
          <Alert type="error" showIcon message={getErrorMessage(preview.error)} />
        ) : (
          <div className={styles.summary} role="status">
            <Alert
              type={blockable.length === 0 ? 'warning' : 'info'}
              showIcon
              message={t('bulkBlock.summary', {
                blockable: blockable.length,
                total: vehicles.length,
                days: dayCount,
              })}
              description={
                fullyBusy > 0 ? t('bulkBlock.summarySkipped', { count: fullyBusy }) : undefined
              }
            />
          </div>
        )}
      </Form>
    </ResponsiveDialog>
  );
}
