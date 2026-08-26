'use client';

import {
  Alert,
  App,
  Button,
  DatePicker,
  Form,
  InputNumber,
  Segmented,
  Select,
  Skeleton,
  Table,
} from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BULK_PRICE_MODE,
  PRICE_PERCENT_MAX,
  PRICE_PERCENT_MIN,
  PRICE_ROUND_STEPS,
  PRICE_ROUND_STEP_DEFAULT,
  PRICE_SPREAD_WARN_RATIO,
  listedPriceForDay,
  planBulkDayPrices,
  priceSpreadRatio,
  type BulkPriceMode,
} from '@xeprime/domain';
import { MoneyInput } from '@/components/form/MoneyInput';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { APP_TIME_ZONE, DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { getErrorMessage } from '@/services/api-client';
import { useBulkDayPreview, useBulkPriceDay, useBulkRestoreDayPrices } from '../hooks/use-bulk-day';
import { formatDateKey } from '../utils/calendar-date.util';
import styles from './BulkDayDialog.module.css';

export interface BulkDayPriceState {
  date: string;
  suggestedRange: { from: string; to: string };
}

type RangeMode = 'single' | 'range';

/**
 * Đặt giá riêng cho TOÀN BỘ xe trong một ngày (hoặc một khoảng).
 *
 * ## Vì sao mặc định là PHẦN TRĂM
 *
 * Đội xe thật lệch nhau tới ba lần (xe máy 150k ↔ Everest 1,5tr). Một con số đồng giá vì thế
 * gần như chắc chắn sai với phần lớn đội: đặt 1tr thì i10 thành đắt vô lý còn Everest thành rẻ
 * như cho. "+30% dịp lễ" mới là câu mà người vận hành thật sự nghĩ trong đầu.
 *
 * Đồng giá VẪN giữ, vì nó đúng khi nhóm đang lọc đã hẹp (chỉ xe máy chẳng hạn). Khi độ lệch giá
 * trong nhóm vượt ngưỡng thì cảnh báo tại chỗ — nói ra, không chặn.
 *
 * ## Ba cái bẫy của phần trăm, và cách xử lý
 *
 *  - **% của giá nào**: giá áp cho ĐÚNG ngày đó (cuối tuần dùng giá cuối tuần). Lấy phẳng giá
 *    ngày thường sẽ biến một lệnh tăng giá thành giảm giá đúng vào Thứ Bảy.
 *  - **Cộng dồn**: gốc LUÔN là giá niêm yết, không bao giờ là bản ghi đè đang có ⇒ bấm mấy lần
 *    cũng ra một kết quả.
 *  - **Số lẻ**: làm tròn theo bước, mặc định 10.000₫.
 *
 * Bảng xem trước không phải trang trí: nó là thứ duy nhất biến "+30%" thành "i10 → 680k,
 * Everest → 1,95tr" để người dùng thấy mình sắp làm gì. Nó chạy CHÍNH hàm `planBulkDayPrices`
 * mà backend dùng lúc ghi, nên con số hiện ra là con số sẽ được lưu.
 */
export function BulkDayPriceDialog({
  state,
  onClose,
}: {
  state: BulkDayPriceState | null;
  onClose: () => void;
}) {
  return <PriceDialogInner key={state?.date ?? 'closed'} state={state} onClose={onClose} />;
}

/**
 * MỘT component dựng cả thân lẫn footer.
 *
 * Bản trước tách form ra rồi đẩy footer ngược lên vỏ bằng `useState` — một vòng lặp render vô
 * hạn: mỗi lần render tạo phần tử JSX mới, `setState` thấy tham chiếu khác nên render tiếp.
 * Giữ chung một component là cách duy nhất để footer đọc được state của form.
 */
function PriceDialogInner({
  state,
  onClose,
}: {
  state: BulkDayPriceState | null;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const { message, modal } = App.useApp();

  const suggested = state?.suggestedRange ?? { from: '', to: '' };
  const suggestsRange = Boolean(state) && suggested.to !== suggested.from;
  const [mode, setMode] = useState<RangeMode>(suggestsRange ? 'range' : 'single');
  const [range, setRange] = useState<[Dayjs, Dayjs]>(() => {
    const fallback = dayjs().tz(APP_TIME_ZONE).format(DAY_PARAM_FORMAT);
    return [
      dayjs.tz(suggested.from || fallback, APP_TIME_ZONE),
      dayjs.tz(suggested.to || fallback, APP_TIME_ZONE),
    ];
  });
  const [priceMode, setPriceMode] = useState<BulkPriceMode>(BULK_PRICE_MODE.PERCENT);
  const [percent, setPercent] = useState<number>(30);
  const [fixedPrice, setFixedPrice] = useState<number | null>(null);
  const [roundStep, setRoundStep] = useState<number>(PRICE_ROUND_STEP_DEFAULT);

  const from = mode === 'single' ? (state?.date ?? '') : range[0].format(DAY_PARAM_FORMAT);
  const to = mode === 'single' ? (state?.date ?? '') : range[1].format(DAY_PARAM_FORMAT);

  const preview = useBulkDayPreview(from, to, state !== null);
  const save = useBulkPriceDay();
  const restore = useBulkRestoreDayPrices();

  const vehicles = useMemo(() => preview.data?.vehicles ?? [], [preview.data]);

  /*
   * Bảng xem trước tính cho NGÀY ĐẦU khoảng. Với khoảng vắt qua cuối tuần, giá gốc từng ngày
   * khác nhau — chú thích nói ra điều đó thay vì giả vờ mọi ngày giống nhau.
   */
  const rows = useMemo(
    () =>
      planBulkDayPrices(
        vehicles.map((v) => ({
          vehicleId: v.vehicleId,
          // Contract khai hai trường này là TUỲ CHỌN; hàm thuần đòi `string | null` tường minh.
          weekdayPrice: v.weekdayPrice ?? null,
          weekendPrice: v.weekendPrice ?? null,
        })),
        from,
        {
          mode: priceMode,
          percent,
          fixedPrice: fixedPrice === null ? undefined : String(fixedPrice),
          roundStep,
        },
      ).map((row) => {
        const vehicle = vehicles.find((v) => v.vehicleId === row.vehicleId)!;
        return { ...row, name: vehicle.name, plateNumber: vehicle.plateNumber };
      }),
    [vehicles, from, priceMode, percent, fixedPrice, roundStep],
  );

  const priceable = rows.filter((r) => r.nextPrice !== null);
  const withoutBase = rows.filter((r) => r.basePrice === null).length;

  /** Độ lệch giá trong nhóm — cơ sở để cảnh báo trước khi ai đó đặt đồng giá cho cả đội xe. */
  const spread = useMemo(
    () =>
      priceSpreadRatio(
        vehicles.map((v) =>
          listedPriceForDay(
            { weekdayPrice: v.weekdayPrice ?? null, weekendPrice: v.weekendPrice ?? null },
            from,
          ),
        ),
      ),
    [vehicles, from],
  );
  const spreadWarning =
    priceMode === BULK_PRICE_MODE.FIXED && spread !== null && spread >= PRICE_SPREAD_WARN_RATIO;

  const targetIds = () =>
    (priceMode === BULK_PRICE_MODE.FIXED ? rows : priceable).map((r) => r.vehicleId);

  function submit() {
    const vehicleIds = targetIds();
    if (vehicleIds.length === 0) return;
    save.mutate(
      {
        from,
        to,
        mode: priceMode,
        ...(priceMode === BULK_PRICE_MODE.PERCENT
          ? { percent, roundStep }
          : { fixedPrice: String(fixedPrice ?? 0) }),
        vehicleIds,
      },
      {
        onSuccess: (result) => {
          message.success(
            t('bulkPrice.done', { vehicles: result.updatedVehicles, days: result.updatedDays }),
          );
          onClose();
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  function confirmRestore() {
    modal.confirm({
      title: t('bulkPrice.confirmRestoreTitle'),
      content: t('bulkPrice.confirmRestoreContent', {
        count: vehicles.length,
        from: formatDateKey(from),
        to: formatDateKey(to),
      }),
      okText: t('bulkPrice.restore'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.cancel'),
      onOk: () =>
        restore
          .mutateAsync({
            from,
            to,
            mode: BULK_PRICE_MODE.PERCENT,
            percent: 0,
            vehicleIds: vehicles.map((v) => v.vehicleId),
          })
          .then((result) => {
            message.success(t('bulkPrice.restored', { count: result.updatedDays }));
            onClose();
          })
          .catch((error: unknown) => message.error(getErrorMessage(error))),
    });
  }

  return (
    <ResponsiveDialog
      open={state !== null}
      onClose={onClose}
      size="lg"
      mobileMode="fullscreen"
      title={t('bulkPrice.title')}
      /* Footer dính đáy: bảng 40 xe dài bao nhiêu cũng không đẩy nút ra khỏi tầm mắt. */
      footer={
        <>
          <Button danger loading={restore.isPending} onClick={confirmRestore}>
            {t('bulkPrice.restore')}
          </Button>
          <Button onClick={onClose} disabled={save.isPending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="primary"
            loading={save.isPending}
            disabled={preview.isLoading || targetIds().length === 0}
            onClick={submit}
          >
            {t('bulkPrice.submit', { count: targetIds().length })}
          </Button>
        </>
      }
    >
      <Form layout="vertical">
        <Form.Item label={t('bulkPrice.scope')}>
          <Segmented<RangeMode>
            value={mode}
            onChange={setMode}
            options={[
              {
                label: t('bulkPrice.modeSingle', { date: formatDateKey(state?.date ?? '') }),
                value: 'single',
              },
              { label: t('bulkPrice.modeRange'), value: 'range' },
            ]}
            block
          />
        </Form.Item>

        {mode === 'range' ? (
          <Form.Item label={t('bulkPrice.range')} required>
            <DatePicker.RangePicker
              value={range}
              format="DD/MM/YYYY"
              allowClear={false}
              className={styles.fullWidth}
              onChange={(next) => {
                if (next?.[0] && next[1]) setRange([next[0], next[1]]);
              }}
            />
          </Form.Item>
        ) : null}

        <Form.Item label={t('bulkPrice.mode')}>
          <Segmented<BulkPriceMode>
            value={priceMode}
            onChange={setPriceMode}
            options={[
              { label: t('bulkPrice.modePercent'), value: BULK_PRICE_MODE.PERCENT },
              { label: t('bulkPrice.modeFixed'), value: BULK_PRICE_MODE.FIXED },
            ]}
            block
          />
        </Form.Item>

        {priceMode === BULK_PRICE_MODE.PERCENT ? (
          <div className={styles.row}>
            <Form.Item label={t('bulkPrice.percent')} className={styles.grow}>
              <InputNumber
                value={percent}
                onChange={(v) => setPercent(v ?? 0)}
                min={PRICE_PERCENT_MIN}
                max={PRICE_PERCENT_MAX}
                step={5}
                addonAfter="%"
                className={styles.fullWidth}
                aria-label={t('bulkPrice.percent')}
              />
            </Form.Item>
            <Form.Item label={t('bulkPrice.roundStep')} className={styles.grow}>
              <Select
                value={roundStep}
                onChange={setRoundStep}
                aria-label={t('bulkPrice.roundStep')}
                options={PRICE_ROUND_STEPS.map((step) => ({
                  value: step,
                  label: step === 1 ? t('bulkPrice.roundNone') : fmt.money(String(step)),
                }))}
              />
            </Form.Item>
          </div>
        ) : (
          <Form.Item label={t('bulkPrice.fixedPrice')} required>
            <MoneyInput
              value={fixedPrice ?? undefined}
              onChange={(v) => setFixedPrice(v ?? null)}
              min={0}
              step={50000}
              addonAfter={t('dailyPrice.dailyAddon')}
              className={styles.fullWidth}
            />
          </Form.Item>
        )}

        {priceMode === BULK_PRICE_MODE.PERCENT ? (
          <Alert
            type="info"
            showIcon
            className={styles.note}
            message={t('bulkPrice.percentBaseNote')}
          />
        ) : null}

        {spreadWarning ? (
          <Alert
            type="warning"
            showIcon
            className={styles.note}
            message={t('bulkPrice.spreadWarningTitle', { ratio: spread.toFixed(1) })}
            description={t('bulkPrice.spreadWarningBody')}
          />
        ) : null}

        {withoutBase > 0 && priceMode === BULK_PRICE_MODE.PERCENT ? (
          <Alert
            type="warning"
            showIcon
            className={styles.note}
            message={t('bulkPrice.missingBaseWarning', { count: withoutBase })}
          />
        ) : null}

        {preview.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : preview.isError ? (
          <Alert type="error" showIcon message={getErrorMessage(preview.error)} />
        ) : (
          <Table
            size="small"
            rowKey="vehicleId"
            dataSource={rows}
            pagination={rows.length > 8 ? { pageSize: 8, size: 'small' } : false}
            scroll={{ x: true }}
            className={styles.table}
            caption={
              mode === 'range' ? (
                <span className={styles.hint}>{t('bulkPrice.tableRangeNote')}</span>
              ) : undefined
            }
            columns={[
              {
                title: t('bulkPrice.colVehicle'),
                dataIndex: 'name',
                render: (_: unknown, row) => (
                  <span>
                    {row.name}
                    {row.plateNumber ? (
                      <span className={styles.muted}> · {row.plateNumber}</span>
                    ) : null}
                  </span>
                ),
              },
              {
                title: t('bulkPrice.colBase'),
                dataIndex: 'basePrice',
                align: 'right' as const,
                render: (value: string | null) =>
                  value === null ? <span className={styles.muted}>—</span> : fmt.money(value),
              },
              {
                title: t('bulkPrice.colNext'),
                dataIndex: 'nextPrice',
                align: 'right' as const,
                render: (value: string | null) =>
                  value === null ? (
                    <span className={styles.muted}>{t('bulkPrice.skipped')}</span>
                  ) : (
                    <strong>{fmt.money(value)}</strong>
                  ),
              },
            ]}
          />
        )}
      </Form>
    </ResponsiveDialog>
  );
}
