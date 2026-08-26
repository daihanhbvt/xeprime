'use client';

import { Alert, App, Button, DatePicker, Descriptions, Form, Input } from 'antd';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { MoneyInput } from '@/components/form/MoneyInput';
import { APP_TIME_ZONE, dayjs } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { Dayjs } from 'dayjs';
import { fetchVehicleDailyPrices } from '../api';
import { useDeleteDailyPrices, useSaveDailyPrices } from '../hooks/use-calendar-mutations';
import styles from './VehicleBlockDialog.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

/** Mở từ ô lịch: biết xe (kèm giá thường để đối chiếu) và ngày được bấm. */
export interface DailyPriceDialogState {
  vehicleId: string;
  vehicleName: string;
  /** Giá ngày thường của xe — đối chiếu "giá mặc định" ngay trong dialog. */
  weekdayPrice: string | null;
  /** Xe có cho thuê giờ không — quyết định ô "giá giờ" có hiện hay không. */
  hourlyPrice: string | null;
  date: string;
}

/** Trần theo `DAILY_PRICE_MAX_DATES` của backend — khớp khoảng xem lớn nhất của lịch. */
const MAX_RANGE_DAYS = 62;

/**
 * Đặt giá riêng theo ngày — bản ghi đè BỀN trong `vehicle_daily_prices`, không phải state UI.
 *
 * Mặc định áp cho đúng ngày được bấm; cho phép nới thành một khoảng ngắn (backend upsert tất
 * định từng ngày). Giá riêng KHÔNG đụng lịch trống của xe. "Khôi phục giá mặc định" xoá bản
 * ghi đè — giá thường/cuối tuần áp trở lại ngay ở mọi báo giá.
 */
export function DailyPriceDialog({
  state,
  onClose,
}: {
  state: DailyPriceDialogState | null;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');

  return (
    <ResponsiveDialog
      open={state !== null}
      onClose={onClose}
      size="md"
      mobileMode="fullscreen"
      footer={null}
      title={t('dailyPrice.title')}
    >
      {state ? (
        <PriceForm key={`${state.vehicleId}-${state.date}`} state={state} onClose={onClose} />
      ) : null}
    </ResponsiveDialog>
  );
}

function PriceForm({ state, onClose }: { state: DailyPriceDialogState; onClose: () => void }) {
  const t = useTranslations('Calendar');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const { message, modal } = App.useApp();
  const day = dayjs.tz(state.date, APP_TIME_ZONE);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([day, day]);
  const [dailyPrice, setDailyPrice] = useState<number | null>(null);
  const [hourlyPrice, setHourlyPrice] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const save = useSaveDailyPrices();
  const remove = useDeleteDailyPrices();

  const from = range[0].format('YYYY-MM-DD');
  const to = range[1].format('YYYY-MM-DD');

  // Bản ghi đè đang có trong khoảng — nạp để prefill và để biết có gì mà "khôi phục mặc định".
  const existing = useQuery({
    queryKey: queryKeys.calendar.vehicleDailyPrices(state.vehicleId, { from, to }),
    queryFn: () => fetchVehicleDailyPrices(state.vehicleId, from, to),
    retry: false,
  });

  // Prefill MỘT LẦN từ bản ghi của đúng ngày bấm — người dùng gõ rồi thì dữ liệu tới muộn không đè.
  if (!prefilled && existing.data) {
    const current = existing.data.find((r) => r.date === state.date);
    if (current) {
      if (current.dailyPrice != null) setDailyPrice(Number(current.dailyPrice));
      if (current.hourlyPrice != null) setHourlyPrice(Number(current.hourlyPrice));
      if (current.note) setNote(current.note);
    }
    setPrefilled(true);
  }

  const hasOverrides = (existing.data?.length ?? 0) > 0;
  const rangeDays = range[1].diff(range[0], 'day') + 1;

  function listDates(): string[] {
    return Array.from({ length: rangeDays }, (_, i) => range[0].add(i, 'day').format('YYYY-MM-DD'));
  }

  function submit() {
    setFormError(null);
    if (rangeDays < 1 || rangeDays > MAX_RANGE_DAYS) {
      setFormError(t('dailyPrice.errors.rangeTooLong', { max: MAX_RANGE_DAYS }));
      return;
    }
    if (dailyPrice == null && hourlyPrice == null) {
      setFormError(t('dailyPrice.errors.priceRequired'));
      return;
    }
    save.mutate(
      {
        vehicleId: state.vehicleId,
        body: {
          dates: listDates(),
          ...(dailyPrice != null ? { dailyPrice: String(dailyPrice) } : {}),
          ...(hourlyPrice != null ? { hourlyPrice: String(hourlyPrice) } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          message.success(t('dailyPrice.saved'));
          onClose();
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  function confirmRestore() {
    modal.confirm({
      title: t('dailyPrice.confirmRestoreTitle'),
      content: t('dailyPrice.confirmRestoreContent', {
        vehicle: state.vehicleName,
        from: range[0].format('DD/MM'),
        to: range[1].format('DD/MM'),
      }),
      okText: t('dailyPrice.confirmRestoreOk'),
      okButtonProps: { danger: true },
      cancelText: tCommon('actions.cancel'),
      onOk: () =>
        remove
          .mutateAsync({ vehicleId: state.vehicleId, from, to })
          .then(({ deleted }) => {
            message.success(
              deleted > 0
                ? t('dailyPrice.restored', { count: deleted })
                : t('dailyPrice.restoredNone'),
            );
            onClose();
          })
          .catch((error: unknown) => {
            message.error(getErrorMessage(error));
          }),
    });
  }

  return (
    <Form layout="vertical" onFinish={submit}>
      {formError ? (
        <Alert type="error" showIcon className={styles.alert} message={formError} />
      ) : null}

      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'vehicle', label: t('dailyPrice.vehicle'), children: state.vehicleName },
          {
            key: 'normal',
            label: t('dailyPrice.defaultPrice'),
            children: !state.weekdayPrice
              ? t('dailyPrice.noDefaultPrice')
              : state.hourlyPrice
                ? t('dailyPrice.defaultPriceValueWithHourly', {
                    daily: fmt.money(state.weekdayPrice),
                    hourly: fmt.money(state.hourlyPrice),
                  })
                : t('dailyPrice.defaultPriceValue', { daily: fmt.money(state.weekdayPrice) }),
          },
        ]}
      />

      <Form.Item label={t('dailyPrice.appliesTo')} required>
        <DatePicker.RangePicker
          value={range}
          format="DD/MM/YYYY"
          allowClear={false}
          onChange={(next) => {
            if (next?.[0] && next[1]) setRange([next[0], next[1]]);
          }}
        />
      </Form.Item>

      <Form.Item label={t('dailyPrice.daily')} tooltip={t('dailyPrice.dailyTooltip')}>
        <MoneyInput
          value={dailyPrice ?? undefined}
          onChange={(v) => setDailyPrice(v ?? null)}
          min={0}
          step={50000}
          addonAfter={t('dailyPrice.dailyAddon')}
          className={styles.moneyInput}
        />
      </Form.Item>

      {state.hourlyPrice != null ? (
        <Form.Item label={t('dailyPrice.hourly')}>
          <MoneyInput
            value={hourlyPrice ?? undefined}
            onChange={(v) => setHourlyPrice(v ?? null)}
            min={0}
            step={10000}
            addonAfter={t('dailyPrice.hourlyAddon')}
            className={styles.moneyInput}
          />
        </Form.Item>
      ) : null}

      <Form.Item label={t('dailyPrice.note')}>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={255}
          placeholder={t('dailyPrice.notePlaceholder')}
        />
      </Form.Item>

      <div className={styles.actions}>
        {hasOverrides ? (
          <Button danger loading={remove.isPending} onClick={confirmRestore}>
            {t('dailyPrice.restore')}
          </Button>
        ) : null}
        <Button onClick={onClose} disabled={save.isPending}>
          {tCommon('actions.cancel')}
        </Button>
        <Button type="primary" htmlType="submit" loading={save.isPending}>
          {t('dailyPrice.submit')}
        </Button>
      </div>
    </Form>
  );
}
