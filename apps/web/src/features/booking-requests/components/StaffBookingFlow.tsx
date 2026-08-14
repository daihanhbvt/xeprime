'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Skeleton } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { API_ERROR_CODE, PRICE_ROW, SERVICE_TYPE } from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { NumberField } from '@/components/form/NumberField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { bookingPath } from '@/constants/routes';
import { checkConflict } from '@/features/bookings/api';
import { useCreateBooking } from '@/features/bookings/hooks/use-booking-mutations';
import { fetchCalendarQuote } from '@/features/calendar/api';
import type { CalendarQuote } from '@/features/calendar/types/calendar.types';
import { fetchListingDetailClient, fetchListingReviewsClient } from '@/features/marketplace/api';
import { formatRentalPoint } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { PICKUP_METHOD, type PickupMethod } from '../schema';
import { BookingSteps, type BookingStepKey } from './BookingSteps';
import { VehicleSummaryPanel } from './VehicleSummaryPanel';
import styles from './RequestBookingFlow.module.css';

interface StaffBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Prefill từ ô lịch được bấm (ISO). */
  pickupAt?: string | null;
  returnAt?: string | null;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onResultChange?: (isResult: boolean) => void;
}

const REVIEW_PREVIEW_COUNT = 3;

/**
 * Form của luồng đặt hộ: staff nhập khách + ghi chú; KHÔNG có OTP/điều khoản (thao tác nội bộ
 * đã đăng nhập). Tiền chỉ nhập tay khi server không báo giá được (xe chưa cấu hình giá ngày).
 */
const staffBookingSchema = yup.object({
  customerName: yup.string().trim().required('Nhập tên khách').max(255),
  customerPhone: yup
    .string()
    .trim()
    .required('Nhập số điện thoại khách')
    .matches(/^(0|\+84)\d{9}$/, 'Số điện thoại không hợp lệ'),
  pickupAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', 'Chọn thời gian nhận xe', (v) => v != null),
  returnAt: yup
    .mixed<Dayjs>()
    .nullable()
    .defined()
    .test('required', 'Chọn thời gian trả xe', (v) => v != null)
    .test('after-pickup', 'Thời gian trả phải sau thời gian nhận', (value, ctx) => {
      const pickup = ctx.parent.pickupAt as Dayjs | null;
      return !value || !pickup || value.isAfter(pickup);
    }),
  pickupMethod: yup
    .string()
    .oneOf([PICKUP_METHOD.SELF, PICKUP_METHOD.DELIVERY])
    .default(PICKUP_METHOD.SELF),
  deliveryAddress: yup
    .string()
    .trim()
    .default('')
    .when('pickupMethod', {
      is: PICKUP_METHOD.DELIVERY,
      then: (s) => s.required('Nhập địa chỉ giao xe').max(500),
    }),
  note: yup.string().trim().max(2000).default(''),
  /** Chỉ dùng khi KHÔNG có báo giá server — xe chưa cấu hình giá ngày. */
  manualBaseAmount: yup.number().min(0).nullable().default(null),
  manualDepositAmount: yup.number().min(0).nullable().default(null),
});

type StaffBookingValues = yup.InferType<typeof staffBookingSchema>;

function rowAmount(quote: CalendarQuote, key: string): string | null {
  return quote.rows.find((r) => r.key === key)?.amount ?? null;
}

/**
 * Luồng "Đặt xe" của GIAN HÀNG trên lịch — dùng NGUYÊN giao diện luồng thuê xe của khách
 * (cột hồ sơ xe + ba bước `Thời gian → Khách hàng → Xác nhận`, cùng CSS/step bar/bảng giá),
 * khác đúng hai điều:
 *
 *  - KHÔNG có OTP: người thao tác là staff đã đăng nhập, khách được nhập hộ;
 *  - Gửi xong là ĐƠN THẬT (`POST /bookings`, trạng thái `reserved`, giữ chỗ ngay trong cùng
 *    transaction — ADR 0006), không phải yêu cầu chờ chính mình duyệt lại.
 *
 * Tiền lấy từ báo giá NỘI BỘ `/calendar/quote` (cùng PricingService + giá riêng theo ngày với
 * báo giá công khai — FE không tự cộng trừ). Xe chưa cấu hình giá thì server 400 và bước xác
 * nhận rơi về ô nhập tiền tay. Giao tận nơi: phí 0 lúc tạo (chốt sau như Wave 9), địa chỉ đi
 * vào ghi chú của đơn vì đơn trực tiếp không có cột địa chỉ giao.
 */
export function StaffBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pickupAt,
  returnAt,
  onClose,
  onBusyChange,
  onResultChange,
}: StaffBookingFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<BookingStepKey>('time');
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [stepError, setStepError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  /**
   * Hồ sơ xe cho cột trái — CHỈ có với xe đang công khai; xe nội bộ thì panel dùng fallback
   * (tên + ảnh từ hàng lịch). 404 ở đây là trạng thái hợp lệ, không phải lỗi.
   */
  const listingQ = useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId),
    queryFn: () => fetchListingDetailClient(vehicleId),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const reviewsQ = useQuery({
    queryKey: queryKeys.marketplace.reviews(vehicleId, { limit: REVIEW_PREVIEW_COUNT }),
    queryFn: () => fetchListingReviewsClient(vehicleId, REVIEW_PREVIEW_COUNT),
    staleTime: 5 * 60_000,
    retry: false,
    enabled: listingQ.isSuccess,
  });
  const listing = listingQ.data ?? null;

  const { control, trigger, getValues, setValue, formState } = useForm<StaffBookingValues>({
    resolver: yupResolver(staffBookingSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      pickupAt: pickupAt ? dayjs(pickupAt) : null,
      returnAt: returnAt ? dayjs(returnAt) : null,
      pickupMethod: PICKUP_METHOD.SELF,
      deliveryAddress: '',
      note: '',
      manualBaseAmount: null,
      manualDepositAmount: null,
    },
  });

  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const pickupMethod = useWatch({ control, name: 'pickupMethod' });
  const isDelivery = pickupMethod === PICKUP_METHOD.DELIVERY;
  const hasRange = Boolean(watchedPickup && watchedReturn && watchedReturn.isAfter(watchedPickup));

  /** Báo giá nội bộ — 400 (xe chưa có giá) là trạng thái hợp lệ: rơi về nhập tiền tay. */
  const quoteParams = hasRange
    ? {
        vehicleId,
        pickupAt: watchedPickup!.toISOString(),
        returnAt: watchedReturn!.toISOString(),
      }
    : null;
  const quoteQ = useQuery({
    queryKey: queryKeys.calendar.quote(quoteParams ?? {}),
    queryFn: () => fetchCalendarQuote(quoteParams!),
    enabled: quoteParams != null,
    staleTime: 60_000,
    retry: false,
  });
  const quote = quoteQ.data ?? null;
  const quoteUnavailable = hasRange && quoteQ.isError;

  const availabilityM = useMutation({
    mutationFn: () => {
      const v = getValues();
      return checkConflict({
        vehicleId,
        startAt: v.pickupAt?.toISOString() ?? '',
        endAt: v.returnAt?.toISOString() ?? '',
      });
    },
    onSuccess: (res) => {
      if (res.hasConflict) {
        setStepError('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.');
      } else {
        setStepError(null);
        setStep('contact');
      }
    },
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const create = useCreateBooking();
  const submitting = create.isPending;

  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);
  const isResult = step === 'done';
  useEffect(() => {
    onResultChange?.(isResult);
  }, [isResult, onResultChange]);

  async function continueFromTime() {
    setStepError(null);
    if (await trigger(['pickupAt', 'returnAt'])) availabilityM.mutate();
  }

  async function continueFromContact() {
    setStepError(null);
    if (await trigger(['customerName', 'customerPhone', 'deliveryAddress'])) setStep('review');
  }

  async function submitBooking() {
    setStepError(null);
    // Không có báo giá server thì tiền thuê nhập tay là BẮT BUỘC — không tạo đơn 0đ âm thầm.
    if (quoteUnavailable) {
      const ok = await trigger(['manualBaseAmount']);
      if (!ok) return;
      if (getValues('manualBaseAmount') == null) {
        setStepError('Xe chưa cấu hình giá — nhập tiền thuê trước khi tạo đơn.');
        return;
      }
    }

    const v = getValues();
    const discountRow = quote ? rowAmount(quote, PRICE_ROW.DISCOUNT) : null;
    const deliveryLine = isDelivery ? `Giao xe tận nơi: ${v.deliveryAddress.trim()}` : '';
    const note = [deliveryLine, v.note.trim()].filter(Boolean).join('\n');

    create.mutate(
      {
        vehicleId,
        customerName: v.customerName.trim(),
        customerPhone: v.customerPhone.trim(),
        // Marketplace hiện chỉ đặt tự lái — cùng giá trị luồng khách dùng.
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: v.pickupAt!.toISOString(),
        returnAt: v.returnAt!.toISOString(),
        // Tiền từ báo giá server (đã gồm giá riêng theo ngày); giảm giá là dòng âm → tách dương.
        baseAmount: quote
          ? (rowAmount(quote, PRICE_ROW.BASE) ?? quote.totalAmount)
          : String(v.manualBaseAmount ?? 0),
        discountAmount: discountRow ? discountRow.replace('-', '') : '0',
        // Giao tận nơi phí 0 lúc tạo — chủ xe chốt phí đã thoả thuận sau (Wave 9).
        deliveryFee: '0',
        depositAmount: quote ? quote.depositAmount : String(v.manualDepositAmount ?? 0),
        ...(note ? { note } : {}),
      },
      {
        onSuccess: (booking) => {
          setCreatedCode(booking.code);
          setCreatedId(booking.id);
          setStep('done');
        },
        onError: (e) => {
          if (getErrorCode(e) === API_ERROR_CODE.BOOKING_SCHEDULE_CONFLICT) {
            setStepError(
              'Xe vừa được đặt vào khung giờ này. Quay lại bước Thời gian để chọn khoảng khác.',
            );
          } else {
            setStepError(getErrorMessage(e));
          }
        },
      },
    );
  }

  const primaryAction =
    step === 'time'
      ? {
          label: availabilityM.isPending ? 'Đang kiểm tra…' : 'Tiếp tục',
          onClick: () => void continueFromTime(),
          loading: availabilityM.isPending,
          disabled: false,
        }
      : step === 'contact'
        ? {
            label: 'Tiếp tục',
            onClick: () => void continueFromContact(),
            loading: false,
            disabled: false,
          }
        : {
            label: 'Tạo đơn thuê',
            onClick: () => void submitBooking(),
            loading: submitting,
            disabled: false,
          };

  const secondaryAction =
    step === 'time'
      ? { label: 'Huỷ', onClick: onClose, disabled: false }
      : step === 'contact'
        ? { label: 'Quay lại', onClick: () => setStep('time'), disabled: false }
        : { label: 'Quay lại', onClick: () => setStep('contact'), disabled: submitting };

  // --- Kết quả: đơn đã tạo và ĐÃ GIỮ CHỖ — khác hẳn màn "yêu cầu đã gửi" của khách ----------
  if (step === 'done') {
    const v = getValues();
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={styles.doneBadge} aria-hidden>
            <CheckOutlined />
          </span>
          <h3 className={styles.doneTitle}>Đã tạo đơn thuê</h3>
          {createdCode ? (
            <p className={styles.requestCode}>
              Mã đơn: <b>{createdCode}</b>
            </p>
          ) : null}
          <p className={styles.doneText}>
            Xe đã được giữ chỗ cho khách. Lịch xe phía sau sẽ tự cập nhật.
          </p>

          <dl className={styles.doneSummary}>
            <div className={styles.doneRow}>
              <dt>Xe</dt>
              <dd>{listing?.name ?? vehicleName}</dd>
            </div>
            <div className={styles.doneRow}>
              <dt>Khách</dt>
              <dd>
                {v.customerName} · {v.customerPhone}
              </dd>
            </div>
            <div className={styles.doneRow}>
              <dt>Thời gian</dt>
              <dd>
                {v.pickupAt ? formatRentalPoint(v.pickupAt) : '—'} →{' '}
                {v.returnAt ? formatRentalPoint(v.returnAt) : '—'}
              </dd>
            </div>
            {quote ? (
              <div className={styles.doneRow}>
                <dt>Tổng tiền</dt>
                <dd>{formatMoneyVnd(quote.totalAmount)}</dd>
              </div>
            ) : null}
          </dl>

          <div className={styles.doneActions}>
            {createdId ? (
              <Button
                type="primary"
                size="large"
                block
                onClick={() => {
                  onClose();
                  router.push(bookingPath.detail(createdId));
                }}
              >
                Mở chi tiết đơn
              </Button>
            ) : null}
            <Button size="large" block onClick={onClose}>
              Về lịch xe
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.left}>
        <VehicleSummaryPanel
          listing={listing}
          fallbackName={vehicleName}
          fallbackImageUrl={vehicleImageUrl}
          loading={listingQ.isLoading}
          reviews={reviewsQ.data?.data ?? []}
          reviewSummary={reviewsQ.data?.summary ?? null}
          reviewsLoading={listingQ.isSuccess && reviewsQ.isLoading}
          verifiedContact={null}
        />
      </div>

      <div className={styles.right}>
        <BookingSteps current={step} labels={{ contact: 'Khách hàng' }} />

        {/* ── Bước 1 — Thời gian ───────────────────────────────────────────── */}
        {step === 'time' ? (
          <section className={styles.stepBody}>
            <p className={styles.stepHint}>
              Chọn thời gian thuê để kiểm tra xe còn trống. Có thể thuê theo ngày hoặc theo giờ.
            </p>

            <div className={styles.rangeField}>
              <span className={styles.rangeFieldLabel}>Thời gian thuê</span>
              <div
                className={cx(
                  styles.rangeBox,
                  (formState.errors.pickupAt || formState.errors.returnAt) && styles.rangeBoxError,
                )}
              >
                <RentalDateTimeRangeField
                  value={{ pickupAt: watchedPickup ?? null, returnAt: watchedReturn ?? null }}
                  onChange={(next) => {
                    setValue('pickupAt', next.pickupAt, { shouldValidate: true });
                    setValue('returnAt', next.returnAt, { shouldValidate: true });
                    if (stepError) setStepError(null);
                  }}
                  mode={rentalMode}
                  onModeChange={setRentalMode}
                  variant="labelled"
                  prefix={<CalendarOutlined />}
                />
              </div>
              <p className={styles.rangeHint}>
                {hasRange ? (
                  <>
                    <ClockCircleOutlined aria-hidden />{' '}
                    {rentalMode === 'hourly' ? 'Thuê theo giờ' : 'Thuê theo ngày'} · bấm vào ô để
                    đổi
                  </>
                ) : (
                  'Bấm vào ô trên để mở lịch và chọn khoảng thuê.'
                )}
              </p>
            </div>

            {formState.errors.pickupAt || formState.errors.returnAt ? (
              <p className={styles.fieldError} role="alert">
                {formState.errors.pickupAt?.message ?? formState.errors.returnAt?.message}
              </p>
            ) : null}

            {hasRange ? (
              quoteQ.isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} title={false} />
              ) : quote ? (
                <PriceBreakdown
                  rows={quote.rows}
                  totalAmount={quote.totalAmount}
                  depositAmount={quote.depositAmount}
                  title="Tạm tính cho khoảng thời gian đã chọn"
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  className={styles.err}
                  message="Xe chưa cấu hình giá ngày — bạn sẽ nhập tiền thuê ở bước Xác nhận."
                />
              )
            ) : null}

            {stepError ? (
              <Alert type="warning" showIcon message={stepError} className={styles.err} />
            ) : null}
          </section>
        ) : null}

        {/* ── Bước 2 — Khách hàng (KHÔNG có OTP: staff nhập hộ) ───────────── */}
        {step === 'contact' ? (
          <section className={styles.stepBody}>
            <div className={styles.dateSummary}>
              <span>
                {watchedPickup ? formatRentalPoint(watchedPickup) : '—'} →{' '}
                {watchedReturn ? formatRentalPoint(watchedReturn) : '—'}
              </span>
              <button type="button" className={styles.linkBtn} onClick={() => setStep('time')}>
                Đổi thời gian
              </button>
            </div>

            <TextField
              control={control}
              name="customerName"
              label="Tên khách"
              placeholder="Nguyễn Văn A"
              autoComplete="off"
            />
            <TextField
              control={control}
              name="customerPhone"
              label="Số điện thoại khách"
              placeholder="0901234567"
              autoComplete="off"
            />

            <fieldset className={styles.pickupGroup}>
              <legend className={styles.fieldLabel}>Hình thức nhận xe</legend>
              <div
                className={styles.pickupOptions}
                role="radiogroup"
                aria-label="Hình thức nhận xe"
              >
                {(
                  [
                    {
                      key: PICKUP_METHOD.SELF,
                      label: 'Nhận tại điểm hẹn',
                      hint: 'Khách tới nhận xe tại địa điểm của gian hàng',
                      icon: <CarOutlined />,
                    },
                    {
                      key: PICKUP_METHOD.DELIVERY,
                      label: 'Giao xe tận nơi',
                      hint: 'Mang xe tới địa chỉ của khách',
                      icon: <EnvironmentOutlined />,
                    },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    role="radio"
                    aria-checked={pickupMethod === option.key}
                    className={cx(
                      styles.pickupOption,
                      pickupMethod === option.key && styles.pickupOptionActive,
                    )}
                    onClick={() =>
                      setValue('pickupMethod', option.key as PickupMethod, { shouldValidate: true })
                    }
                  >
                    <span className={styles.pickupIcon} aria-hidden>
                      {option.icon}
                    </span>
                    <span className={styles.pickupText}>
                      <span className={styles.pickupLabel}>{option.label}</span>
                      <span className={styles.pickupHint}>{option.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            {isDelivery ? (
              <div className={styles.deliveryBlock}>
                <TextField
                  control={control}
                  name="deliveryAddress"
                  label="Địa chỉ giao xe"
                  placeholder="123 Nguyễn Văn Linh, Q. Hải Châu, Đà Nẵng"
                  autoComplete="off"
                />
                <div className={styles.deliveryFeeRow}>
                  <span>Phí giao nhận</span>
                  <b className={styles.freeTag}>Chốt sau</b>
                </div>
                <p className={styles.deliveryNote}>
                  Thoả thuận phí với khách rồi cập nhật vào đơn bằng “Cập nhật phí giao nhận”.
                </p>
              </div>
            ) : null}

            <TextAreaField
              control={control}
              name="note"
              label="Ghi chú"
              rows={3}
              maxLength={2000}
            />

            {stepError ? (
              <Alert
                type="error"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}
          </section>
        ) : null}

        {/* ── Bước 3 — Xác nhận ────────────────────────────────────────────── */}
        {step === 'review' ? (
          <section className={styles.stepBody}>
            <dl className={styles.reviewList}>
              <div className={styles.reviewRow}>
                <dt>Xe</dt>
                <dd>{listing?.name ?? vehicleName}</dd>
              </div>
              <div className={styles.reviewRow}>
                <dt>Khách thuê</dt>
                <dd>
                  {getValues('customerName')} · {getValues('customerPhone')}
                </dd>
              </div>
              <div className={styles.reviewRow}>
                <dt>Nhận xe</dt>
                <dd>{watchedPickup ? formatRentalPoint(watchedPickup) : '—'}</dd>
              </div>
              <div className={styles.reviewRow}>
                <dt>Trả xe</dt>
                <dd>{watchedReturn ? formatRentalPoint(watchedReturn) : '—'}</dd>
              </div>
              <div className={styles.reviewRow}>
                <dt>Hình thức</dt>
                <dd>{isDelivery ? 'Giao xe tận nơi' : 'Nhận tại điểm hẹn'}</dd>
              </div>
              {isDelivery ? (
                <div className={styles.reviewRow}>
                  <dt>Địa chỉ giao</dt>
                  <dd>{getValues('deliveryAddress') || '—'}</dd>
                </div>
              ) : null}
            </dl>

            {quoteQ.isLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            ) : quote ? (
              <PriceBreakdown
                rows={quote.rows}
                totalAmount={quote.totalAmount}
                depositAmount={quote.depositAmount}
                title="Chi tiết giá thuê"
                footer={
                  <span className={styles.deliveryFootnote}>
                    Giá tính bởi hệ thống (đã gồm giá riêng theo ngày và ưu đãi theo số ngày thuê).
                  </span>
                }
              />
            ) : (
              /* Xe chưa cấu hình giá: staff CHỐT tiền tại đây — không tạo đơn 0đ âm thầm. */
              <>
                <Alert
                  type="warning"
                  showIcon
                  className={styles.err}
                  message="Xe chưa cấu hình giá ngày — nhập tiền thuê thoả thuận với khách."
                />
                <NumberField
                  control={control}
                  name="manualBaseAmount"
                  label="Tiền thuê (cả kỳ)"
                  money
                  min={0}
                />
                <NumberField
                  control={control}
                  name="manualDepositAmount"
                  label="Tiền cọc tài sản"
                  money
                  min={0}
                />
              </>
            )}

            {stepError ? (
              <Alert
                type="error"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}
          </section>
        ) : null}

        <footer className={styles.footer}>
          <Button onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
            {secondaryAction.label}
          </Button>
          <Button
            key={step}
            type="primary"
            loading={primaryAction.loading}
            disabled={primaryAction.disabled}
            onClick={primaryAction.onClick}
          >
            {primaryAction.label}
          </Button>
        </footer>
      </div>
    </div>
  );
}
