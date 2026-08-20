'use client';

import { App } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { ImageGalleryField } from '@/components/form/ImageGalleryField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs, DAY_PARAM_FORMAT } from '@/lib/datetime';
import { moneyToVietnameseWords } from '@/lib/money';
import { vehicleLabel } from '@/lib/vehicle-label';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { presignReceiptAttachment } from '@/services/upload';
import { PAYMENT_METHOD } from '@xeprime/types';
import { RECEIPT_TYPE } from '../constants';
import { useBookingOptions } from '../hooks/use-booking-options';
import { useFinanceCategories } from '../hooks/use-finance-categories';
import { useFinanceOptions } from '../hooks/use-finance-options';
import { useCreateReceipt } from '../hooks/use-receipt-mutations';
import { receiptFormSchema, type ReceiptFormValues } from '../schema';
import type { CreateReceiptInput, ReceiptBookingOption } from '../types';
import styles from './ReceiptFormDrawer.module.css';

/** Trần ảnh minh chứng — khớp `ArrayMaxSize(10)` của DTO backend. */
const MAX_ATTACHMENTS = 10;

/** Cùng nhịp với `FilterBar` — người dùng gõ xong một từ rồi mới bắn truy vấn. */
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULTS = (): ReceiptFormValues => ({
  type: RECEIPT_TYPE.EXPENSE,
  // Mặc định HÔM NAY: đại đa số phiếu nhập ngay lúc phát sinh. Tính lúc mở form chứ không phải
  // lúc nạp module — tab mở qua nửa đêm mà vẫn điền ngày hôm qua là một lỗi im lặng.
  occurredAt: dayjs().format(DAY_PARAM_FORMAT),
  amount: null,
  paymentMethod: PAYMENT_METHOD.CASH,
  categoryId: null,
  bookingId: null,
  vehicleId: null,
  referenceCode: '',
  description: '',
  attachments: [],
});

/**
 * Drawer tạo phiếu thu/chi (chờ duyệt).
 *
 * Thứ tự trường theo đúng thao tác thật của chủ xe: ngày và loại trước, rồi **chọn đơn thuê** —
 * bước đó tự điền khách, xe và số tiền còn nợ, nên phần lớn phiếu chỉ còn phải bấm Lưu. Danh
 * mục lọc theo loại phiếu đang chọn.
 */
export function ReceiptFormDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const t = useTranslations('Finance.receipts.form');
  const errorMessage = useErrorMessage();
  const options = useFinanceOptions();
  const { control, handleSubmit, reset, setValue, getValues } = useForm<ReceiptFormValues>({
    resolver: yupResolver(receiptFormSchema),
    defaultValues: DEFAULTS(),
  });

  const type = useWatch({ control, name: 'type' });
  const amount = useWatch({ control, name: 'amount' });
  const bookingId = useWatch({ control, name: 'bookingId' });

  const { data: categories, isFetching: loadingCategories } = useFinanceCategories(type);
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));

  // Tìm ở SERVER: ô này chỉ tải 20 đơn ưu tiên còn nợ, nên đơn cũ chỉ ra qua đường tìm kiếm.
  // Debounce vì mỗi lần gõ là bốn vị từ `ILIKE '%…%'` quét bảng `bookings` — không hoãn thì một
  // biển số 8 ký tự là 8 lần quét.
  const [bookingSearch, setBookingSearch] = useState('');
  const debouncedSearch = useDebouncedValue(bookingSearch, SEARCH_DEBOUNCE_MS);
  const { data: bookings, isFetching: loadingBookings } = useBookingOptions(debouncedSearch, open);
  const bookingOptions = (bookings ?? []).map((b) => ({
    value: b.id,
    label: `${b.code} · ${b.customerName}${b.plateNumber ? ` · ${b.plateNumber}` : ''}`,
  }));

  const selectedBooking = useMemo(
    () => (bookings ?? []).find((b) => b.id === bookingId) ?? null,
    [bookings, bookingId],
  );

  const create = useCreateReceipt();

  /**
   * Chọn đơn → điền hộ những gì suy được.
   *
   * Đi qua effect chứ không phải callback của ô chọn: `SelectField` ghi thẳng vào RHF qua
   * `useController`, không có chỗ cho người gọi chen vào giữa. Chốt `filledFor` để chỉ điền
   * **một lần cho mỗi đơn** — nếu không, mọi lần render sau đó sẽ ghi đè con số người dùng vừa
   * sửa tay, và họ không hiểu vì sao ô tiền cứ tự nhảy về.
   *
   * Cố ý **không ghi đè** số tiền đã gõ: nhập một con số cụ thể rồi mới nhớ ra phải gắn đơn là
   * chuyện thường, và nuốt mất con số đó là cách chắc chắn nhất khiến họ thôi dùng ô liên kết.
   */
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    if (!bookingId) {
      filledFor.current = null;
      return;
    }
    if (filledFor.current === bookingId) return;
    const picked = (bookings ?? []).find((b) => b.id === bookingId);
    if (!picked) return;

    filledFor.current = bookingId;
    setValue('vehicleId', picked.vehicleId, { shouldDirty: true });
    // Số tiền đọc bằng `getValues` chứ không phải giá trị đã watch: `amount` đổi theo từng phím
    // gõ, đưa vào deps là effect chạy lại và điền đè đúng lúc người dùng đang nhập. `getValues`
    // ổn định qua các lần render nên deps vẫn đúng đủ.
    if (getValues('amount') == null && Number(picked.debtAmount) > 0) {
      setValue('amount', Number(picked.debtAmount), { shouldDirty: true });
    }
  }, [bookingId, bookings, getValues, setValue]);

  const submit = handleSubmit((values) => {
    const body: CreateReceiptInput = {
      type: values.type,
      amount: String(values.amount ?? 0),
      paymentMethod: values.paymentMethod,
      occurredAt: values.occurredAt,
      categoryId: values.categoryId || undefined,
      bookingId: values.bookingId || undefined,
      vehicleId: values.vehicleId || undefined,
      referenceCode: values.referenceCode || undefined,
      description: values.description || undefined,
      attachments: values.attachments?.length ? values.attachments : undefined,
    };
    create.mutate(body, {
      onSuccess: () => {
        message.success(t('success'));
        reset(DEFAULTS());
        setBookingSearch('');
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  });

  function handleClose() {
    reset(DEFAULTS());
    setBookingSearch('');
    onClose();
  }

  return (
    // Form drawer: nút gửi phải nằm TRONG <form> nên không dùng footer của DetailDrawer.
    <DetailDrawer title={t('title')} size="lg" open={open} onClose={handleClose}>
      <form onSubmit={submit} noValidate>
        <div className={styles.grid}>
          <DateTimeField control={control} name="occurredAt" label={t('occurredAt')} dateOnly />
          <SelectField
            control={control}
            name="type"
            label={t('type')}
            options={options.receiptType}
          />

          <div className={styles.linkBox}>
            <p className={styles.linkHint}>{t('linkHint')}</p>
            <SelectField
              control={control}
              name="bookingId"
              label={t('booking')}
              options={bookingOptions}
              placeholder={t('bookingPlaceholder')}
              allowClear
              showSearch
              loading={loadingBookings}
              onSearch={setBookingSearch}
            />
            {selectedBooking ? <PickedBooking booking={selectedBooking} /> : null}
          </div>

          <SelectField
            control={control}
            name="categoryId"
            label={t('category')}
            options={categoryOptions}
            placeholder={t('categoryPlaceholder')}
            allowClear
            showSearch
            loading={loadingCategories}
          />
          <SelectField
            control={control}
            name="paymentMethod"
            label={t('method')}
            options={options.paymentMethod}
          />

          <NumberField control={control} name="amount" label={t('amount')} money min={0} />
          <TextField
            control={control}
            name="referenceCode"
            label={t('referenceCode')}
            placeholder={t('referenceCodePlaceholder')}
          />
          <div className={styles.words} aria-live="polite">
            {amount != null ? moneyToVietnameseWords(String(amount)) : null}
          </div>

          <div className={styles.wide}>
            <TextAreaField
              control={control}
              name="description"
              label={t('description')}
              rows={3}
              maxLength={2000}
            />
          </div>

          <div className={styles.wide}>
            <ImageGalleryField
              control={control}
              name="attachments"
              label={t('attachments')}
              presign={presignReceiptAttachment}
              max={MAX_ATTACHMENTS}
            />
          </div>
        </div>

        <StickyFormActions
          submitLabel={t('submit')}
          onCancel={handleClose}
          submitting={create.isPending}
          variant="inline"
        />
      </form>
    </DetailDrawer>
  );
}

/**
 * Những gì đơn đã điền hộ — hiện ra để người dùng biết phiếu sẽ gắn vào đâu, không phải đoán.
 *
 * Ở NGOÀI thân `ReceiptFormDrawer`: khai báo bên trong thì mỗi lần render là một kiểu component
 * mới, React tháo và dựng lại cả nhánh — mất focus và trạng thái con ngay giữa lúc đang nhập.
 */
function PickedBooking({ booking }: { booking: ReceiptBookingOption }) {
  const fmt = useAppFormat();
  const t = useTranslations('Finance.receipts.form.picked');
  return (
    <div className={styles.filled}>
      <span>
        <span className={styles.filledLabel}>{t('customer')}</span>
        {booking.customerName}
      </span>
      <span>
        <span className={styles.filledLabel}>{t('vehicle')}</span>
        {vehicleLabel(booking.vehicleName, booking.plateNumber)}
      </span>
      <span>
        <span className={styles.filledLabel}>{t('debt')}</span>
        {fmt.money(booking.debtAmount)}
      </span>
    </div>
  );
}
