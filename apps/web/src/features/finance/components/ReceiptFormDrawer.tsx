'use client';

import { CarOutlined, FileTextOutlined, TagOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { CheckboxField } from '@/components/form/CheckboxField';
import { ChoiceCardsField } from '@/components/form/ChoiceCardsField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs, DAY_PARAM_FORMAT } from '@/lib/datetime';
import { moneyToVietnameseWords } from '@/lib/money';
import { vehicleLabel } from '@/lib/vehicle-label';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PAYMENT_METHOD } from '@xeprime/types';
import { RECEIPT_LINK_MODE, RECEIPT_LINK_MODE_VALUES, RECEIPT_TYPE } from '../constants';
import { useBookingOptions } from '../hooks/use-booking-options';
import { useFinanceCategories } from '../hooks/use-finance-categories';
import { useFinanceOptions } from '../hooks/use-finance-options';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
import { useCreateReceipt } from '../hooks/use-receipt-mutations';
import { receiptFormSchema, type ReceiptFormValues } from '../schema';
import type { CreateReceiptInput } from '../types';
import { ReceiptAttachmentsField } from './ReceiptAttachmentsField';
import { BookingLinkCard, VehicleLinkCard } from './ReceiptLinkCard';
import styles from './ReceiptFormDrawer.module.css';

/** Cùng nhịp với `FilterBar` — người dùng gõ xong một từ rồi mới bắn truy vấn. */
const SEARCH_DEBOUNCE_MS = 300;

/** Trần diễn giải — khớp `.max(500)` ở schema, và là con số bộ đếm dưới ô đang đếm tới. */
const DESCRIPTION_MAX = 500;

/** Icon của mỗi lối liên kết — nhận diện nhanh hơn đọc ba nhãn cạnh nhau. */
const LINK_MODE_ICON = {
  [RECEIPT_LINK_MODE.NONE]: <TagOutlined />,
  [RECEIPT_LINK_MODE.BOOKING]: <FileTextOutlined />,
  [RECEIPT_LINK_MODE.VEHICLE]: <CarOutlined />,
} as const;

interface ReceiptFormDrawerProps {
  open: boolean;
  onClose: () => void;
  /**
   * Xe chọn sẵn khi form mở từ hồ sơ xe (`/manage/receipts?vehicleId=…&create=1`).
   *
   * Chỉ là giá trị KHỞI TẠO: người dùng đổi sang chế độ khác hoặc chọn xe khác thì form theo họ,
   * không bị kéo về xe cũ ở mỗi lần render. `defaultValues` của RHF cũng chỉ đọc một lần lúc
   * mount, nên nơi gọi phải đổi `key` khi ngữ cảnh xe đổi — dựng lại cây, không ghi đè bằng effect.
   */
  initialVehicleId?: string | null;
}

const DEFAULTS = (initialVehicleId?: string | null): ReceiptFormValues => ({
  type: RECEIPT_TYPE.EXPENSE,
  // Mặc định HÔM NAY: đại đa số phiếu nhập ngay lúc phát sinh. Tính lúc mở form chứ không phải
  // lúc nạp module — tab mở qua nửa đêm mà vẫn điền ngày hôm qua là một lỗi im lặng.
  occurredAt: dayjs().format(DAY_PARAM_FORMAT),
  amount: null,
  paymentMethod: PAYMENT_METHOD.CASH,
  categoryId: null,
  // Mở từ hồ sơ xe thì chế độ đã được quyết bởi chính đường dẫn — bắt người dùng bấm lại "Xe"
  // sau khi họ vừa bấm "Tạo phiếu cho xe này" là hỏi lại một câu đã trả lời.
  linkMode: initialVehicleId ? RECEIPT_LINK_MODE.VEHICLE : RECEIPT_LINK_MODE.NONE,
  bookingId: null,
  vehicleId: initialVehicleId ?? null,
  referenceCode: '',
  description: '',
  keepOpen: false,
  attachments: [],
});

/**
 * Drawer tạo phiếu thu/chi (chờ duyệt).
 *
 * Câu hỏi ĐẦU TIÊN của form là **khoản này gắn vào đâu** (`RECEIPT_LINK_MODE`), vì nó quyết định
 * mọi ô còn lại. Ba lối vào ứng với ba loại khoản có thật trong sổ: tiền của một chuyến (chọn
 * đơn → tự điền khách, xe, số còn nợ), tiền của một chiếc xe ngoài chuyến nào (rửa xe, vá lốp),
 * và tiền của gian hàng không thuộc xe nào (marketing, văn phòng).
 *
 * Chọn xong, đối tượng được đọc lại bằng một THẺ có ảnh + trạng thái + bối cảnh (`ReceiptLinkCard`)
 * chứ không phải một dòng chữ: đây là bước cuối trước khi tiền được ghi vào một chiếc xe cụ thể.
 */
export function ReceiptFormDrawer({ open, onClose, initialVehicleId }: ReceiptFormDrawerProps) {
  const { message } = App.useApp();
  const t = useTranslations('Finance.receipts.form');
  const errorMessage = useErrorMessage();
  const options = useFinanceOptions();
  const resolver = useMemo(() => yupResolver(receiptFormSchema(t)), [t]);
  const { control, handleSubmit, reset, setValue, getValues } = useForm<ReceiptFormValues>({
    resolver,
    defaultValues: DEFAULTS(initialVehicleId),
  });

  const type = useWatch({ control, name: 'type' });
  const amount = useWatch({ control, name: 'amount' });
  const bookingId = useWatch({ control, name: 'bookingId' });
  const vehicleId = useWatch({ control, name: 'vehicleId' });
  const linkMode = useWatch({ control, name: 'linkMode' });

  const { data: categories, isFetching: loadingCategories } = useFinanceCategories(type);
  const categoryOptions = (categories ?? []).map((c) => ({ value: c.id, label: c.name }));

  // Tìm ở SERVER: ô này chỉ tải 20 đơn ưu tiên còn nợ, nên đơn cũ chỉ ra qua đường tìm kiếm.
  // Debounce vì mỗi lần gõ là bốn vị từ `ILIKE '%…%'` quét bảng `bookings` — không hoãn thì một
  // biển số 8 ký tự là 8 lần quét.
  const [bookingSearch, setBookingSearch] = useState('');
  const debouncedBookingSearch = useDebouncedValue(bookingSearch, SEARCH_DEBOUNCE_MS);
  const linkingBooking = linkMode === RECEIPT_LINK_MODE.BOOKING;
  const linkingVehicle = linkMode === RECEIPT_LINK_MODE.VEHICLE;

  const {
    data: bookings,
    isFetching: loadingBookings,
    isError: bookingsError,
  } = useBookingOptions(debouncedBookingSearch, open && linkingBooking);
  const bookingOptions = (bookings ?? []).map((b) => ({
    value: b.id,
    label: `${b.code} · ${b.customerName}${b.plateNumber ? ` · ${b.plateNumber}` : ''}`,
  }));

  const [vehicleSearch, setVehicleSearch] = useState('');
  const debouncedVehicleSearch = useDebouncedValue(vehicleSearch, SEARCH_DEBOUNCE_MS);
  const {
    data: vehicles,
    isFetching: loadingVehicles,
    isError: vehiclesError,
  } = useVehicleOptions(debouncedVehicleSearch, open && linkingVehicle, vehicleId);
  const vehicleOptions = (vehicles ?? []).map((v) => ({
    value: v.id,
    label: `${v.code} · ${vehicleLabel(v.name, v.plateNumber)}`,
  }));

  const selectedBooking = useMemo(
    () => (bookings ?? []).find((b) => b.id === bookingId) ?? null,
    [bookings, bookingId],
  );
  const selectedVehicle = useMemo(
    () => (vehicles ?? []).find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId],
  );

  /**
   * Xe đã chọn nhưng server KHÔNG trả về — xe đã xoá, hoặc không còn thuộc gian hàng này.
   *
   * Phân biệt được vì `includeId` bắt server luôn kèm xe đang chọn nếu nó còn hợp lệ: xin đích
   * danh mà không thấy thì đúng là nó không còn. Nói ra ngay tại form, chứ không để người dùng
   * bấm Lưu rồi nhận một lỗi 404 sau khi đã gõ xong mọi ô.
   */
  const vehicleMissing =
    linkingVehicle && Boolean(vehicleId) && !loadingVehicles && !vehiclesError && !selectedVehicle;

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
    /*
     * Chế độ QUYẾT ĐỊNH cái gì được gửi, không phải "ô nào tình cờ còn giá trị".
     *
     * Chọn một đơn rồi đổi sang "gắn xe" mà vẫn gửi `bookingId` cũ là gửi một liên kết người
     * dùng đã bỏ — và nếu xe mới khác xe của đơn đó, server từ chối bằng một lỗi họ không hiểu
     * vì ô đơn thuê đã biến mất khỏi màn hình.
     */
    const linked =
      values.linkMode === RECEIPT_LINK_MODE.BOOKING
        ? { bookingId: values.bookingId || undefined, vehicleId: values.vehicleId || undefined }
        : values.linkMode === RECEIPT_LINK_MODE.VEHICLE
          ? { vehicleId: values.vehicleId || undefined }
          : {};

    const body: CreateReceiptInput = {
      type: values.type,
      amount: String(values.amount ?? 0),
      paymentMethod: values.paymentMethod,
      occurredAt: values.occurredAt,
      categoryId: values.categoryId || undefined,
      ...linked,
      referenceCode: values.referenceCode || undefined,
      description: values.description,
      attachments: values.attachments?.length ? values.attachments : undefined,
    };
    create.mutate(body, {
      onSuccess: () => {
        message.success(t('success'));
        /*
         * "Tạo và tiếp tục nhập mới": dọn form nhưng GIỮ drawer mở, và giữ luôn ngữ cảnh liên
         * kết vừa dùng. Người giữ sổ nhập một xấp hoá đơn của cùng một chiếc xe trong một lượt;
         * bắt họ chọn lại xe sau mỗi phiếu là bắt trả giá cho việc thường xuyên nhất.
         */
        if (values.keepOpen) {
          reset({
            ...DEFAULTS(initialVehicleId),
            type: values.type,
            occurredAt: values.occurredAt,
            paymentMethod: values.paymentMethod,
            categoryId: values.categoryId,
            linkMode: values.linkMode,
            bookingId: values.bookingId,
            vehicleId: values.vehicleId,
            keepOpen: true,
          });
          filledFor.current = values.bookingId ?? null;
          return;
        }
        resetAll();
        onClose();
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  });

  function resetAll() {
    reset(DEFAULTS(initialVehicleId));
    filledFor.current = null;
    setBookingSearch('');
    setVehicleSearch('');
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  const linkModeOptions = RECEIPT_LINK_MODE_VALUES.map((value) => ({
    value,
    label: t(`linkMode.${value}`),
    description: t(`linkHint.${value}`),
    icon: LINK_MODE_ICON[value],
  }));

  return (
    // Form drawer: nút gửi phải nằm TRONG <form> nên không dùng footer của DetailDrawer.
    <DetailDrawer title={t('title')} size="lg" open={open} onClose={handleClose}>
      {/*
        `<Form component={false}>` chỉ CẤP NGỮ CẢNH bố cục cho `Form.Item` — nhãn nằm TRÊN ô nhập,
        dấu bắt buộc đặt SAU nhãn; form thật vẫn là thẻ `<form>` của React Hook Form bên dưới.
        Thiếu ngữ cảnh này, `Form.Item` rơi về layout NGANG mặc định của AntD: nhãn nằm bên trái
        kèm dấu hai chấm, ăn mất một phần ba bề ngang và đẩy ba thẻ "Khoản này là" xuống hai dòng.
      */}
      <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
        <form onSubmit={submit} noValidate>
          <div className={styles.grid}>
            <DateTimeField control={control} name="occurredAt" label={t('occurredAt')} dateOnly />
            <SelectField
              control={control}
              name="type"
              label={t('type')}
              options={options.receiptType}
              required
            />

            <div className={styles.wide}>
              <ChoiceCardsField
                control={control}
                name="linkMode"
                label={t('linkMode.label')}
                options={linkModeOptions}
                required
              />
            </div>

            {linkingBooking ? (
              <div className={styles.wide}>
                <SelectField
                  control={control}
                  name="bookingId"
                  label={t('link.label')}
                  options={bookingOptions}
                  placeholder={t('bookingPlaceholder')}
                  required
                  allowClear
                  showSearch
                  loading={loadingBookings}
                  onSearch={setBookingSearch}
                  help={
                    !loadingBookings && !bookingsError && bookingOptions.length === 0
                      ? t('bookingEmpty')
                      : undefined
                  }
                />
                {bookingsError ? (
                  <Alert type="warning" showIcon message={t('bookingError')} />
                ) : null}
                {selectedBooking ? <BookingLinkCard booking={selectedBooking} /> : null}
              </div>
            ) : null}

            {linkingVehicle ? (
              <div className={styles.wide}>
                <SelectField
                  control={control}
                  name="vehicleId"
                  label={t('link.label')}
                  options={vehicleOptions}
                  placeholder={t('vehiclePlaceholder')}
                  required
                  allowClear
                  showSearch
                  loading={loadingVehicles}
                  onSearch={setVehicleSearch}
                  help={
                    !loadingVehicles && !vehiclesError && vehicleOptions.length === 0
                      ? t('vehicleEmpty')
                      : undefined
                  }
                />
                {vehiclesError ? (
                  <Alert type="warning" showIcon message={t('vehicleError')} />
                ) : null}
                {vehicleMissing ? <Alert type="error" showIcon message={t('vehicleGone')} /> : null}
                {selectedVehicle ? <VehicleLinkCard vehicle={selectedVehicle} /> : null}
              </div>
            ) : null}

            <SelectField
              control={control}
              name="categoryId"
              label={t('category')}
              options={categoryOptions}
              placeholder={t('categoryPlaceholder')}
              required
              allowClear
              showSearch
              loading={loadingCategories}
            />
            <SelectField
              control={control}
              name="paymentMethod"
              label={t('method')}
              options={options.paymentMethod}
              required
            />

            <div>
              <NumberField control={control} name="amount" label={t('amount')} money min={0} />
              {/* Số tiền bằng chữ nằm NGAY DƯỚI ô nhập — chỗ duy nhất bắt được lỗi thừa một số 0. */}
              <div className={styles.words} aria-live="polite">
                {amount != null ? moneyToVietnameseWords(String(amount)) : null}
              </div>
            </div>
            <TextField
              control={control}
              name="referenceCode"
              label={t('referenceCode')}
              placeholder={t('referenceCodePlaceholder')}
            />

            <div className={styles.wide}>
              <TextAreaField
                control={control}
                name="description"
                label={t('description')}
                required
                rows={3}
                maxLength={DESCRIPTION_MAX}
              />
            </div>

            <div className={styles.wide}>
              <ReceiptAttachmentsField
                control={control}
                name="attachments"
                label={t('attachments.label')}
              />
            </div>
          </div>

          <div className={styles.actions}>
            <CheckboxField control={control} name="keepOpen">
              {t('keepOpen')}
            </CheckboxField>
            <div className={styles.buttons}>
              <Button onClick={handleClose}>{t('cancel')}</Button>
              <Button type="primary" htmlType="submit" loading={create.isPending}>
                {t(`submit.${type}`)}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </DetailDrawer>
  );
}
