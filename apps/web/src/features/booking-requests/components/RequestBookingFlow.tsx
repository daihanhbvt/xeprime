'use client';

import {
  CalendarOutlined,
  CarOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EnvironmentOutlined,
  ExclamationOutlined,
} from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Skeleton } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { API_ERROR_CODE, isSameVnPhone, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import {
  RentalDateTimeRangeField,
  type RentalMode,
} from '@/components/form/RentalDateTimeRangeField';
import { TextField } from '@/components/form/TextField';
import { ROUTES } from '@/constants/routes';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { fetchListingDetailClient, fetchListingReviewsClient } from '@/features/marketplace/api';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { verifyOtp } from '@/features/phone-verification/api';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { fetchPublicQuote } from '@/features/rental-policies/api';
import { useCurrentUser } from '@/hooks/use-current-user';
import { formatRentalPoint } from '@/lib/datetime';
import { cx } from '@/lib/cx';
import { applyDiscountPercent, formatMoneyVnd } from '@/lib/money';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { checkAvailability, submitBookingRequest } from '../api';
import { PICKUP_METHOD, requestFormSchema, type RequestFormValues } from '../schema';
import { BookingSteps, type BookingStepKey } from './BookingSteps';
import { VehicleSummaryPanel } from './VehicleSummaryPanel';
import styles from './RequestBookingFlow.module.css';

interface RequestBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  /** Listing đầy đủ khi mở từ trang chi tiết — có sẵn thì KHÔNG gọi lại API. */
  listing?: PublicListingDetail | null;
  /** Ngày giờ đã chọn ở bộ lọc "Tìm xe khả dụng" (ISO) — prefill để khách khỏi nhập lại. */
  pickupAt?: string | null;
  returnAt?: string | null;
  onClose: () => void;
  /**
   * Báo cho vỏ biết đang có request "không được bỏ dở" (xác minh OTP / gửi yêu cầu) để nó
   * khoá các đường đóng vô ý. Flow vẫn tự giữ state; đây chỉ là thông báo ra ngoài.
   */
  onBusyChange?: (busy: boolean) => void;
  /**
   * Đã sang màn KẾT QUẢ (gửi xong / trùng lặp). Vỏ dùng tín hiệu này để thu overlay lại cho vừa
   * nội dung — khung hai cột rộng 1180px và cao hết màn là dành cho biểu mẫu, giữ nguyên cho
   * một thẻ xác nhận ngắn thì thừa mênh mông chỗ trống.
   */
  onResultChange?: (isResult: boolean) => void;
}

const DELIVERY_NOTE =
  'Nếu có chi phí phát sinh, chủ xe sẽ trao đổi trực tiếp với bạn trước khi cập nhật đơn thuê.';

/** Số đánh giá hiện trong cột hồ sơ xe — vài cái tiêu biểu, không phải cả trang đánh giá. */
const REVIEW_PREVIEW_COUNT = 3;

/**
 * Luồng "Yêu cầu thuê xe" của khách — **ba bước biểu mẫu**, hai cột trên desktop.
 *
 * Cột trái là hồ sơ xe đứng yên (`VehicleSummaryPanel`); cột phải đổi theo bước:
 * `Thời gian` → `Liên hệ` → `Xác nhận`. OTP là một TRẠNG THÁI bên trong bước Liên hệ chứ không
 * phải bước thứ tư — khách đã đăng nhập với đúng SĐT đã xác thực không đi qua nó bao giờ.
 *
 * **Điều kiện bỏ qua OTP ở đây chỉ để CHỌN MÀN HÌNH.** Cái chặn thật nằm ở
 * `BookingRequestsService.canSkipBookingOtp`; nếu hai bên bất đồng (phiên vừa hết hạn) backend
 * trả `PHONE_NOT_VERIFIED` và flow tự lùi về OTP, giữ nguyên mọi thứ đã nhập.
 *
 * **Giao xe tận nơi (Wave 9)**: chỉ hỏi địa chỉ. Phí giao nhận luôn `Miễn phí` lúc gửi yêu cầu —
 * không hỏi khoảng cách, không báo giá, không có trạng thái chờ khách duyệt phí. Chủ xe thống
 * nhất phí ngoài ứng dụng rồi cập nhật vào đơn sau khi duyệt.
 *
 * Tiền hiển thị đều LẤY TỪ SERVER (`/public/listings/:id/quote`) — client không tự cộng trừ.
 */
export function RequestBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  listing: providedListing,
  pickupAt,
  returnAt,
  onClose,
  onBusyChange,
  onResultChange,
}: RequestBookingFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<BookingStepKey>('time');
  const [rentalMode, setRentalMode] = useState<RentalMode>('daily');
  const [otpPhone, setOtpPhone] = useState('');
  const [code, setCode] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  /** Yêu cầu trùng lặp — trạng thái riêng, có lối đi tiếp, không phải một alert đỏ. */
  const [duplicate, setDuplicate] = useState(false);
  /** Người đã đăng nhập bấm "Đổi thông tin" → hiện ô nhập thay vì thẻ xác nhận gọn. */
  const [editingContact, setEditingContact] = useState(false);
  const [requestCode, setRequestCode] = useState<string | null>(null);

  // 401 = chưa đăng nhập, là trạng thái hợp lệ ở màn công khai này → coi như khách vãng lai.
  const { data: me } = useCurrentUser();
  const accountPhone = me?.phone ?? null;
  const accountPhoneVerified = Boolean(me?.phoneVerified && accountPhone);

  /**
   * Hồ sơ xe cho cột trái. Mở từ trang chi tiết thì `providedListing` đã đủ và query TẮT —
   * không có lý do gọi lại thứ vừa render xong.
   */
  const listingQ = useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId),
    queryFn: () => fetchListingDetailClient(vehicleId),
    enabled: !providedListing,
    staleTime: 5 * 60_000,
  });
  const listing = providedListing ?? listingQ.data ?? null;

  /**
   * Vài đánh giá tiêu biểu của xe cho cột trái. Tải RỜI khỏi listing để hồ sơ xe hiện ngay,
   * đánh giá đến sau; hỏng thì khối đánh giá vắng mặt chứ không chặn luồng đặt.
   */
  const reviewsQ = useQuery({
    queryKey: queryKeys.marketplace.reviews(vehicleId, { limit: REVIEW_PREVIEW_COUNT }),
    queryFn: () => fetchListingReviewsClient(vehicleId, REVIEW_PREVIEW_COUNT),
    staleTime: 5 * 60_000,
  });

  const { control, trigger, getValues, setValue, formState } = useForm<RequestFormValues>({
    resolver: yupResolver(requestFormSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      pickupAt: pickupAt ? dayjs(pickupAt) : null,
      returnAt: returnAt ? dayjs(returnAt) : null,
      pickupMethod: PICKUP_METHOD.SELF,
      deliveryAddress: '',
      agreed: false,
    },
  });

  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const pickupMethod = useWatch({ control, name: 'pickupMethod' });
  const agreed = useWatch({ control, name: 'agreed' });
  const isDelivery = pickupMethod === PICKUP_METHOD.DELIVERY;

  /**
   * Báo giá công khai — CÙNG PricingService với luồng duyệt của shop, FE không tự cộng trừ.
   * Hỏng cũng không chặn luồng đặt: khối giá là thông tin tham khảo, giá chốt do shop duyệt.
   */
  const quoteParams =
    watchedPickup && watchedReturn
      ? { pickupAt: watchedPickup.toISOString(), returnAt: watchedReturn.toISOString() }
      : null;
  const quoteQ = useQuery({
    queryKey: queryKeys.marketplace.quote(vehicleId, quoteParams ?? {}),
    queryFn: () => fetchPublicQuote(vehicleId, quoteParams!),
    // Bật từ NGAY bước thời gian: chọn xong khoảng thuê là thấy tiền tạm tính, không phải đi
    // hết một bước nữa mới biết mình sắp trả bao nhiêu.
    enabled: quoteParams != null,
    staleTime: 60_000,
  });

  /**
   * Điền sẵn tên + SĐT của tài khoản. Chạy khi `/auth/me` về (có thể sau lần render đầu), và chỉ
   * điền vào ô đang trống — không đè lên thứ khách đã tự gõ.
   */
  useEffect(() => {
    if (!me) return;
    if (!getValues('customerName')) setValue('customerName', me.displayName ?? '');
    if (!getValues('customerPhone') && accountPhone) setValue('customerPhone', accountPhone);
  }, [me, accountPhone, getValues, setValue]);

  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.BOOKING);

  /** SĐT đang dùng có phải chính SĐT đã xác thực của tài khoản không (bỏ qua 0/84/+84). */
  const phoneMatchesAccount = (phone: string) =>
    accountPhoneVerified && isSameVnPhone(phone, accountPhone);

  const availabilityM = useMutation({
    mutationFn: () => {
      const v = getValues();
      return checkAvailability({
        vehicleId,
        pickupAt: v.pickupAt?.toISOString() ?? '',
        returnAt: v.returnAt?.toISOString() ?? '',
      });
    },
    onSuccess: (res) => {
      if (res.available) {
        setStepError(null);
        setStep('contact');
      } else {
        // KHÔNG nói xe "đã được đặt" và không hé lộ đơn của người khác — chỉ nói khung giờ bận.
        setStepError('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.');
      }
    },
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const submitM = useMutation({
    mutationFn: (phone: string) => {
      const v = getValues();
      return submitBookingRequest({
        vehicleId,
        customerName: v.customerName.trim(),
        customerPhone: phone,
        ...(v.customerEmail.trim() ? { customerEmail: v.customerEmail.trim() } : {}),
        pickupAt: v.pickupAt?.toISOString() ?? '',
        returnAt: v.returnAt?.toISOString() ?? '',
        ...(v.pickupMethod === PICKUP_METHOD.DELIVERY
          ? { deliveryRequested: true, deliveryAddress: v.deliveryAddress.trim() }
          : {}),
      });
    },
    onSuccess: async (receipt) => {
      setRequestCode(receipt.id ?? null);
      // Có thể vừa được cấp phiên mới (passwordless) → làm mới toàn bộ cache để cả app biết.
      await queryClient.invalidateQueries();
      setStep('done');
    },
    onError: (e) => {
      const code = getErrorCode(e);
      if (code === API_ERROR_CODE.BOOKING_REQUEST_DUPLICATE) {
        setDuplicate(true);
        return;
      }
      /*
       * Backend nói SĐT chưa xác thực trong khi FE tưởng được bỏ qua OTP — nghĩa là phiên đã hết
       * hạn hoặc SĐT tài khoản vừa bị đổi. Đây là điểm khôi phục: lùi về bước xác thực, GIỮ
       * NGUYÊN xe/ngày giờ/liên hệ đã nhập, gửi mã cho chính số đó.
       */
      if (code === API_ERROR_CODE.PHONE_NOT_VERIFIED) {
        const phone = getValues('customerPhone').trim();
        setOtpPhone(phone);
        setCode('');
        setStep('otp');
        setStepError('Phiên đăng nhập đã hết hạn. Vui lòng xác thực lại số điện thoại.');
        vp.send(phone);
        return;
      }
      setStepError(getErrorMessage(e));
    },
  });

  const verifyM = useMutation({
    mutationFn: () =>
      verifyOtp({ phone: otpPhone, purpose: PHONE_VERIFICATION_PURPOSE.BOOKING, code }),
    onSuccess: () => setStep('review'),
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const submitting = submitM.isPending;
  const verifying = verifyM.isPending;

  // Đẩy trạng thái "đang gửi" ra vỏ để nó khoá Esc/bấm nền trong lúc request đang bay.
  useEffect(() => {
    onBusyChange?.(submitting || verifying);
  }, [submitting, verifying, onBusyChange]);

  const isResult = step === 'done' || duplicate;
  useEffect(() => {
    onResultChange?.(isResult);
  }, [isResult, onResultChange]);

  const verifiedContact = useMemo(() => {
    if (step !== 'review' && step !== 'done') return null;
    const v = getValues();
    return { name: v.customerName, phone: v.customerPhone };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- đọc giá trị form tại thời điểm render
  }, [step]);

  async function continueFromTime() {
    setStepError(null);
    if (await trigger(['pickupAt', 'returnAt'])) availabilityM.mutate();
  }

  async function continueFromContact() {
    setStepError(null);
    const fields: Array<keyof RequestFormValues> = [
      'customerName',
      'customerPhone',
      'customerEmail',
      'deliveryAddress',
    ];
    if (!(await trigger(fields))) return;
    const phone = getValues('customerPhone').trim();

    // Đã đăng nhập + đúng SĐT đã xác thực → sang thẳng bước xác nhận, không dựng OTP thừa.
    if (phoneMatchesAccount(phone)) {
      setStep('review');
      return;
    }

    try {
      await vp.sendAsync(phone);
      setOtpPhone(phone);
      setCode('');
      setStep('otp');
    } catch {
      /* lỗi gửi mã hiển thị qua vp.error tại bước liên hệ */
    }
  }

  function confirmOtp() {
    if (code.length !== 6 || verifying) return;
    setStepError(null);
    verifyM.mutate();
  }

  function onCodeChange(next: string) {
    if (stepError) setStepError(null);
    setCode(next);
  }

  function backToContact() {
    setStep('contact');
    setEditingContact(true);
    setStepError(null);
    setCode('');
    vp.reset();
    verifyM.reset();
    submitM.reset();
  }

  function resend() {
    setStepError(null);
    setCode('');
    verifyM.reset();
    vp.send(otpPhone);
  }

  async function submitRequest() {
    setStepError(null);
    if (!(await trigger('agreed'))) return;
    if (!getValues('agreed')) {
      setStepError('Vui lòng đồng ý với điều khoản thuê xe trước khi gửi yêu cầu.');
      return;
    }
    submitM.mutate(getValues('customerPhone').trim());
  }

  const summaryPanel = (
    <VehicleSummaryPanel
      listing={listing}
      fallbackName={vehicleName}
      fallbackImageUrl={vehicleImageUrl}
      loading={listingQ.isLoading}
      reviews={reviewsQ.data?.data ?? []}
      reviewSummary={reviewsQ.data?.summary ?? null}
      reviewsLoading={reviewsQ.isLoading}
      verifiedContact={verifiedContact}
    />
  );

  const hasRange = Boolean(watchedPickup && watchedReturn);
  const promoPercent = listing?.discountPercent ?? 0;

  /**
   * Cặp nút của footer, suy từ bước hiện tại — MỘT nơi quyết định nhãn/trạng thái cho cả luồng.
   * Bước đầu không có gì để "quay lại" nên nút phụ là `Huỷ`.
   */
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
            loading: vp.sending,
            disabled: false,
          }
        : step === 'otp'
          ? {
              label: 'Xác thực',
              onClick: confirmOtp,
              loading: verifying,
              disabled: code.length !== 6,
            }
          : {
              label: 'Gửi yêu cầu thuê',
              onClick: () => void submitRequest(),
              loading: submitting,
              disabled: !agreed,
            };

  const secondaryAction =
    step === 'time'
      ? { label: 'Huỷ', onClick: onClose, disabled: false }
      : step === 'contact'
        ? { label: 'Quay lại', onClick: () => setStep('time'), disabled: false }
        : step === 'otp'
          ? { label: 'Quay lại', onClick: backToContact, disabled: verifying }
          : { label: 'Quay lại', onClick: backToContact, disabled: submitting };

  // --- Trạng thái trùng lặp: chiếm trọn thân hộp thoại, có hai lối đi tiếp ------------------
  if (duplicate) {
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          <span className={cx(styles.doneBadge, styles.warnBadge)} aria-hidden>
            <ExclamationOutlined />
          </span>
          <h3 className={styles.doneTitle}>Yêu cầu trùng lặp</h3>
          <p className={styles.doneText}>
            Bạn đã gửi một yêu cầu thuê xe này với cùng khung giờ. Vui lòng đợi chủ xe phản hồi
            trước khi gửi yêu cầu mới.
          </p>
          <div className={styles.doneActions}>
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              Xem chuyến của tôi
            </Button>
            <Button size="large" block onClick={onClose}>
              Đóng
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Đã gửi xong: kết quả, không phải một bước biểu mẫu -----------------------------------
  if (step === 'done') {
    const v = getValues();
    return (
      <div className={styles.resultWrap}>
        <div className={styles.centered}>
          {/*
            Vòng tròn XANH tự vẽ thay vì để `CheckCircleFilled` tự tô: màu của glyph đến từ
            `currentColor`, mà style runtime của AntD tiêm SAU stylesheet của CSS Module nên một
            class đơn (0,1,0) không chắc thắng — dấu tích ra màu chữ (gần đen) đúng như đã thấy.
            Ở đây màu là NỀN của thẻ bọc, không phụ thuộc thừa kế nào.
          */}
          <span className={styles.doneBadge} aria-hidden>
            <CheckOutlined />
          </span>
          <h3 className={styles.doneTitle}>Yêu cầu đã được gửi</h3>
          {requestCode ? (
            <p className={styles.requestCode}>
              Mã yêu cầu: <b>{requestCode}</b>
            </p>
          ) : null}
          <p className={styles.doneText}>
            Chủ xe sẽ xem xét và phản hồi yêu cầu của bạn. Bạn có thể theo dõi trạng thái trong mục
            chuyến đi của mình.
          </p>

          <dl className={styles.doneSummary}>
            <div className={styles.doneRow}>
              <dt>Xe</dt>
              <dd>{listing?.name ?? vehicleName}</dd>
            </div>
            <div className={styles.doneRow}>
              <dt>Thời gian</dt>
              <dd>
                {v.pickupAt ? formatRentalPoint(v.pickupAt) : '—'} →{' '}
                {v.returnAt ? formatRentalPoint(v.returnAt) : '—'}
              </dd>
            </div>
            <div className={styles.doneRow}>
              <dt>Nhận xe</dt>
              <dd>{isDelivery ? 'Giao xe tận nơi' : 'Nhận tại điểm hẹn'}</dd>
            </div>
            {quoteQ.data ? (
              <div className={styles.doneRow}>
                <dt>Tổng dự kiến</dt>
                {/* Tiền LUÔN qua bộ format — `1800000` trần là con số thô lọt ra ngoài. */}
                <dd>{formatMoneyVnd(quoteQ.data.breakdown.totalAmount)}</dd>
              </div>
            ) : null}
          </dl>

          {/* Nói rõ đây MỚI là yêu cầu — xe chưa bị giữ chỗ (pending không chiếm lịch). */}
          <Alert
            type="warning"
            showIcon
            className={styles.doneNote}
            message="Xe chưa được giữ chỗ. Yêu cầu cần được chủ xe chấp thuận trước."
          />

          <div className={styles.doneActions}>
            <Button
              type="primary"
              size="large"
              block
              onClick={() => {
                onClose();
                router.push(ROUTES.TRIPS);
              }}
            >
              Xem chuyến của tôi
            </Button>
            {/*
              Hỏi thêm chủ xe là việc RẤT hay xảy ra ngay sau khi gửi (giao xe ở đâu, có giao
              được sớm hơn không). Dùng lại nút nhắn shop sẵn có — nó tự lo cả trường hợp khách
              chưa đăng nhập — và đóng overlay trước khi rời sang khu tin nhắn.
            */}
            <ChatWithShopButton
              vehicleId={vehicleId}
              label="Liên hệ chủ xe"
              size="large"
              block
              onNavigate={onClose}
            />
            <Button size="large" block onClick={onClose}>
              Quay lại trang xe
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <div className={styles.left}>{summaryPanel}</div>

      <div className={styles.right}>
        <BookingSteps current={step} />

        {/* ── Bước 1 — Thời gian ───────────────────────────────────────────── */}
        {step === 'time' ? (
          <section className={styles.stepBody}>
            <p className={styles.stepHint}>
              Chọn thời gian thuê để kiểm tra xe còn trống. Có thể thuê theo ngày hoặc theo giờ.
            </p>

            {/*
              Ô chọn thời gian phải TRÔNG như một ô nhập bấm được. Bản trước để trigger trần
              (không viền, không nền) nên nó đọc như một dòng chữ và không ai biết bấm được vào
              đâu. Viền + nền + nhãn hai đầu ở đây là phần "vỏ ô nhập"; ruột vẫn là control lịch
              dùng chung, không dựng lịch thứ hai.
            */}
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
                  onChange={(next: { pickupAt: Dayjs | null; returnAt: Dayjs | null }) => {
                    setValue('pickupAt', next.pickupAt, { shouldValidate: true });
                    setValue('returnAt', next.returnAt, { shouldValidate: true });
                    if (stepError) setStepError(null);
                  }}
                  mode={rentalMode}
                  onModeChange={setRentalMode}
                  /*
                   * Nhãn nằm NGAY CẠNH giá trị, không phải một hàng caption riêng phía trên:
                   * hàng caption cũ căn theo hai mép ô còn giá trị lại nằm sát mũi tên ở giữa,
                   * nên "TRẢ XE" trôi ra tận mép phải trong khi số của nó ở giữa ô.
                   */
                  variant="labelled"
                  prefix={<CalendarOutlined />}
                />
              </div>
              {/* Thời lượng đã nằm ở viên bên phải ô — dòng này chỉ nói CHẾ ĐỘ tính và cách đổi. */}
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

            {/*
              Bảng giá của bước này: chưa chọn ngày thì cho biết ĐƠN GIÁ và cọc (khách quyết định
              có đi tiếp không dựa vào đó); chọn rồi thì thay bằng tạm tính THẬT từ server.
            */}
            {hasRange ? (
              quoteQ.isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} title={false} />
              ) : quoteQ.data ? (
                <PriceBreakdown
                  rows={quoteQ.data.breakdown.rows}
                  totalAmount={quoteQ.data.breakdown.totalAmount}
                  depositAmount={quoteQ.data.breakdown.depositAmount}
                  title="Tạm tính cho khoảng thời gian đã chọn"
                  footer={
                    <span className={styles.deliveryFootnote}>
                      Giá chốt cuối cùng do chủ xe xác nhận khi duyệt yêu cầu.
                    </span>
                  }
                />
              ) : (
                <Alert
                  type="warning"
                  showIcon
                  className={styles.err}
                  message="Chưa tải được giá tạm tính. Bạn vẫn tiếp tục được; chủ xe sẽ xác nhận giá."
                />
              )
            ) : (
              <div className={styles.priceCard}>
                <div className={styles.priceCardHead}>
                  <span className={styles.priceCardTitle}>Giá thuê xe</span>
                  {promoPercent > 0 ? (
                    <span className={styles.promoTag}>Giảm {promoPercent}%</span>
                  ) : null}
                </div>
                <div className={styles.priceCardRows}>
                  {listing?.weekdayPrice ? (
                    <div className={styles.priceRow}>
                      <span>Ngày thường</span>
                      <b>
                        {promoPercent > 0 ? (
                          <s className={styles.priceStrike}>
                            {formatMoneyVnd(listing.weekdayPrice)}
                          </s>
                        ) : null}
                        {formatMoneyVnd(
                          promoPercent > 0
                            ? applyDiscountPercent(listing.weekdayPrice, promoPercent)
                            : listing.weekdayPrice,
                        )}
                        <span className={styles.priceUnit}>/ngày</span>
                      </b>
                    </div>
                  ) : null}
                  {listing?.weekendPrice ? (
                    <div className={styles.priceRow}>
                      <span>Cuối tuần</span>
                      <b>
                        {formatMoneyVnd(listing.weekendPrice)}
                        <span className={styles.priceUnit}>/ngày</span>
                      </b>
                    </div>
                  ) : null}
                  {listing?.hourlyPrice ? (
                    <div className={styles.priceRow}>
                      <span>Thuê theo giờ</span>
                      <b>
                        {formatMoneyVnd(listing.hourlyPrice)}
                        <span className={styles.priceUnit}>/giờ</span>
                      </b>
                    </div>
                  ) : null}
                </div>
                <p className={styles.priceCardNote}>
                  Chọn thời gian để xem tạm tính đầy đủ (đã gồm giảm giá theo số ngày và tiền cọc).
                </p>
              </div>
            )}

            {stepError ? (
              <Alert type="warning" showIcon message={stepError} className={styles.err} />
            ) : null}
          </section>
        ) : null}

        {/* ── Bước 2 — Liên hệ ─────────────────────────────────────────────── */}
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

            {accountPhoneVerified && !editingContact ? (
              /*
               * Đã đăng nhập, SĐT đã xác thực: KHÔNG bắt gõ lại thứ hệ thống đã biết. Hiện thẻ
               * xác nhận gọn; muốn dùng số khác thì "Đổi thông tin" và đi qua OTP như khách mới.
               */
              <div className={styles.confirmCard}>
                <div className={styles.confirmRow}>
                  <span className={styles.confirmLabel}>Họ và tên</span>
                  <span className={styles.confirmValue}>{getValues('customerName') || '—'}</span>
                </div>
                <div className={styles.confirmRow}>
                  <span className={styles.confirmLabel}>Số điện thoại</span>
                  <span className={styles.confirmValue}>
                    {getValues('customerPhone')}
                    <span className={styles.verifiedTag}>
                      <CheckCircleFilled /> Đã xác thực
                    </span>
                  </span>
                </div>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => setEditingContact(true)}
                >
                  <EditOutlined /> Đổi thông tin
                </button>
              </div>
            ) : (
              <>
                <TextField
                  control={control}
                  name="customerName"
                  label="Họ và tên"
                  placeholder="Nguyễn Văn A"
                  autoComplete="name"
                />
                <TextField
                  control={control}
                  name="customerPhone"
                  label="Số điện thoại"
                  placeholder="0901234567"
                  autoComplete="tel"
                />
                <TextField
                  control={control}
                  name="customerEmail"
                  label="Email (không bắt buộc)"
                  placeholder="ban@example.com"
                  autoComplete="email"
                />
              </>
            )}

            {/* ── Hình thức nhận xe ───────────────────────────────────────── */}
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
                      hint: 'Tự tới nhận xe tại địa điểm của chủ xe',
                      icon: <CarOutlined />,
                    },
                    {
                      key: PICKUP_METHOD.DELIVERY,
                      label: 'Giao xe tận nơi',
                      hint: 'Chủ xe mang xe tới địa chỉ của bạn',
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
                    onClick={() => setValue('pickupMethod', option.key, { shouldValidate: true })}
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
                  autoComplete="street-address"
                />
                <div className={styles.deliveryFeeRow}>
                  <span>Phí giao nhận</span>
                  <b className={styles.freeTag}>Miễn phí</b>
                </div>
                <p className={styles.deliveryNote}>{DELIVERY_NOTE}</p>
              </div>
            ) : null}

            {/* Breakdown từ PricingService — tham khảo; giá chốt vẫn do shop duyệt yêu cầu. */}
            {quoteQ.isLoading ? (
              <Skeleton active paragraph={{ rows: 3 }} title={false} />
            ) : quoteQ.data ? (
              <PriceBreakdown
                rows={quoteQ.data.breakdown.rows}
                totalAmount={quoteQ.data.breakdown.totalAmount}
                depositAmount={quoteQ.data.breakdown.depositAmount}
                title="Chi tiết giá thuê (dự kiến)"
              />
            ) : null}

            {vp.error ? (
              <Alert type="error" showIcon message={vp.error} className={styles.err} />
            ) : null}
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

        {/* ── Trạng thái OTP — bên trong bước Liên hệ ──────────────────────── */}
        {step === 'otp' ? (
          <section className={styles.stepBody}>
            <h3 className={styles.otpTitle}>Nhập mã xác thực</h3>
            <p className={styles.stepHint}>
              Mã gồm 6 số đã được gửi đến <b>{maskPhone(otpPhone)}</b>. XePrime dùng số này để chủ
              xe phản hồi và giúp bạn theo dõi yêu cầu thuê.
            </p>
            <OtpCodeInput
              value={code}
              onChange={onCodeChange}
              onComplete={confirmOtp}
              autoFocus
              disabled={verifying}
            />
            {vp.devCode ? (
              <div className={styles.devHint}>
                Mã dev: <b>{vp.devCode}</b> — chỉ hiện ở môi trường phát triển.
              </div>
            ) : null}
            {stepError ? (
              <Alert
                type="error"
                showIcon
                message={stepError}
                className={styles.err}
                role="alert"
              />
            ) : null}
            <div className={styles.otpLinks}>
              <button type="button" className={styles.linkBtn} onClick={backToContact}>
                Sửa số điện thoại
              </button>
              <button
                type="button"
                className={styles.linkBtn}
                disabled={vp.cooldown > 0 || vp.sending}
                onClick={resend}
              >
                {vp.cooldown > 0 ? `Gửi lại (${vp.cooldown}s)` : 'Gửi lại mã'}
              </button>
            </div>
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
                <dt>Người thuê</dt>
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
                <dd>
                  {rentalMode === 'hourly' ? 'Thuê theo giờ' : 'Thuê theo ngày'} ·{' '}
                  {isDelivery ? 'Giao xe tận nơi' : 'Nhận tại điểm hẹn'}
                </dd>
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
            ) : quoteQ.data ? (
              <PriceBreakdown
                rows={quoteQ.data.breakdown.rows}
                totalAmount={quoteQ.data.breakdown.totalAmount}
                depositAmount={quoteQ.data.breakdown.depositAmount}
                title="Chi tiết giá thuê (dự kiến)"
                footer={
                  <span className={styles.deliveryFootnote}>
                    {isDelivery
                      ? `Phí giao nhận: Miễn phí. ${DELIVERY_NOTE}`
                      : 'Giá chốt cuối cùng do chủ xe xác nhận khi duyệt yêu cầu.'}
                  </span>
                }
              />
            ) : (
              <Alert
                type="warning"
                showIcon
                className={styles.err}
                message="Chưa tải được chi tiết giá. Bạn vẫn gửi được yêu cầu; chủ xe sẽ xác nhận giá."
              />
            )}

            <Checkbox
              checked={agreed}
              onChange={(e) => setValue('agreed', e.target.checked, { shouldValidate: true })}
              className={styles.agree}
            >
              Tôi đồng ý với điều khoản thuê xe và xác nhận thông tin trên là chính xác.
            </Checkbox>

            <Alert
              type="info"
              showIcon
              className={styles.doneNote}
              message="Đây là YÊU CẦU thuê — xe chưa được giữ chỗ cho tới khi chủ xe chấp thuận."
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

        {/*
          MỘT hàng nút cho cả luồng, dính đáy cột phải (yêu cầu: nút nằm ở footer bên phải).
          Trước đây mỗi bước tự dựng hàng nút riêng — nút trôi theo nội dung, bước dài thì phải
          cuộn mới thấy, và ba chỗ dễ lệch nhau về nhãn/trạng thái.
        */}
        <footer className={styles.footer}>
          <Button onClick={secondaryAction.onClick} disabled={secondaryAction.disabled}>
            {secondaryAction.label}
          </Button>
          {/*
            `key={step}` — mỗi bước là một nút RIÊNG, không tái dùng chung một phần tử DOM.
            Dùng lại phần tử cũ khiến spinner của bước trước ở lại trong cây (AntD gỡ nó bằng
            hoạt ảnh rời) và nút mang tên khả truy cập "loading …" của việc đã xong. Trong một
            bước thì key không đổi, nên bật/tắt loading vẫn mượt như thường.
          */}
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
