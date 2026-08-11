'use client';

import { CheckCircleFilled, EditOutlined, WarningFilled } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { API_ERROR_CODE, isSameVnPhone, PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { DateTimeField } from '@/components/form/DateTimeField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { fetchPublicQuote } from '@/features/rental-policies/api';
import { queryKeys } from '@/services/query-keys';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { verifyOtp } from '@/features/phone-verification/api';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorCode, getErrorMessage } from '@/services/api-client';
import { checkAvailability, submitBookingRequest } from '../api';
import { requestFormSchema, type RequestFormValues } from '../schema';
import { BookingSteps, type BookingStepKey } from './BookingSteps';
import styles from './RequestBookingFlow.module.css';

interface RequestBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  pricePerDay?: string | null;
  /** Ngày giờ đã chọn ở bộ lọc "Tìm xe khả dụng" (ISO) — prefill để khách khỏi nhập lại. */
  pickupAt?: string | null;
  returnAt?: string | null;
  onClose: () => void;
  /**
   * Báo cho vỏ biết đang có request "không được bỏ dở" (xác minh OTP / gửi yêu cầu) để nó
   * khoá các đường đóng vô ý. Flow vẫn tự giữ state; đây chỉ là thông báo ra ngoài.
   */
  onBusyChange?: (busy: boolean) => void;
}

/**
 * Luồng đặt xe cho khách — **bốn bước, nhận biết trạng thái đăng nhập**.
 *
 * Khách vãng lai: thời gian → liên hệ → OTP → gửi (OTP vừa xác thực SĐT vừa tạo/đăng nhập tài
 * khoản passwordless, khách vào thẳng /trips không cần mật khẩu).
 *
 * Khách đã đăng nhập mà SĐT tài khoản ĐÃ xác thực và trùng số đang dùng: bỏ qua OTP hoàn toàn —
 * không bắt xác thực lại thứ đã xác thực. Đăng nhập nhưng chưa có SĐT / SĐT chưa xác thực / gõ
 * số khác thì vẫn phải OTP cho số đó.
 *
 * **Điều kiện bỏ qua OTP ở đây chỉ để CHỌN MÀN HÌNH.** Cái chặn thật nằm ở
 * `BookingRequestsService.canSkipBookingOtp`; nếu hai bên bất đồng (phiên vừa hết hạn) backend
 * trả `PHONE_NOT_VERIFIED` và flow tự lùi về bước OTP, giữ nguyên mọi thứ đã nhập.
 */
export function RequestBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pricePerDay,
  pickupAt,
  returnAt,
  onClose,
  onBusyChange,
}: RequestBookingFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<BookingStepKey>('dates');
  const [otpPhone, setOtpPhone] = useState('');
  const [code, setCode] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);
  /** Yêu cầu trùng lặp — trạng thái riêng, có lối đi tiếp, không phải một alert đỏ. */
  const [duplicate, setDuplicate] = useState(false);
  /** Người đã đăng nhập bấm "Đổi thông tin" → hiện ô nhập thay vì thẻ xác nhận gọn. */
  const [editingContact, setEditingContact] = useState(false);

  // 401 = chưa đăng nhập, là trạng thái hợp lệ ở màn công khai này → coi như khách vãng lai.
  const { data: me } = useCurrentUser();
  const accountPhone = me?.phone ?? null;
  const accountPhoneVerified = Boolean(me?.phoneVerified && accountPhone);

  const { control, trigger, getValues, setValue } = useForm<RequestFormValues>({
    resolver: yupResolver(requestFormSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      pickupAt: pickupAt ? dayjs(pickupAt) : null,
      returnAt: returnAt ? dayjs(returnAt) : null,
      deliveryRequested: false,
      deliveryAddress: '',
    },
  });

  /**
   * Báo giá công khai (Wave 2) — CÙNG PricingService với luồng duyệt của shop, FE không tự
   * cộng trừ. Chỉ gọi sau khi đã qua bước chọn ngày; hỏng cũng không chặn luồng đặt (khối giá
   * chỉ là thông tin tham khảo, giá chốt vẫn do shop duyệt).
   */
  const watchedPickup = useWatch({ control, name: 'pickupAt' });
  const watchedReturn = useWatch({ control, name: 'returnAt' });
  const deliveryRequested = useWatch({ control, name: 'deliveryRequested' });
  const quoteParams =
    watchedPickup && watchedReturn
      ? { pickupAt: watchedPickup.toISOString(), returnAt: watchedReturn.toISOString() }
      : null;
  const quoteQ = useQuery({
    queryKey: queryKeys.marketplace.quote(vehicleId, quoteParams ?? {}),
    queryFn: () => fetchPublicQuote(vehicleId, quoteParams!),
    enabled: step === 'contact' && quoteParams != null,
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
        pickupAt: v.pickupAt?.toISOString() ?? '',
        returnAt: v.returnAt?.toISOString() ?? '',
        ...(v.deliveryRequested
          ? { deliveryRequested: true, deliveryAddress: v.deliveryAddress.trim() }
          : {}),
      });
    },
    onSuccess: async () => {
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
    onSuccess: () => submitM.mutate(otpPhone),
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const submitting = verifyM.isPending || submitM.isPending;

  // Đẩy trạng thái "đang gửi" ra vỏ để nó khoá Esc/bấm nền trong lúc request đang bay.
  useEffect(() => {
    onBusyChange?.(submitting);
  }, [submitting, onBusyChange]);

  /** Bước "Xác thực" hiện là ĐÃ XONG (không phải bỏ qua) khi tài khoản đã verify đúng số này. */
  const skippedSteps = useMemo<BookingStepKey[]>(
    () => (step !== 'dates' && phoneMatchesAccount(getValues('customerPhone')) ? ['otp'] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- đọc giá trị form tại thời điểm render
    [step, accountPhoneVerified, accountPhone, editingContact],
  );

  async function continueFromDates() {
    setStepError(null);
    if (await trigger(['pickupAt', 'returnAt'])) availabilityM.mutate();
  }

  async function continueFromContact() {
    setStepError(null);
    if (!(await trigger(['customerName', 'customerPhone', 'deliveryAddress']))) return;
    const phone = getValues('customerPhone').trim();

    // Đã đăng nhập + đúng SĐT đã xác thực → gửi thẳng, không dựng bước OTP thừa.
    if (phoneMatchesAccount(phone)) {
      submitM.mutate(phone);
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

  function confirm() {
    if (code.length !== 6 || submitting) return;
    setStepError(null);
    // Đã verify xong mà lần gửi trước hỏng → gửi lại, không bắt nhập mã mới.
    if (verifyM.isSuccess) submitM.mutate(otpPhone);
    else verifyM.mutate();
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
    submitM.reset();
    vp.send(otpPhone);
  }

  // --- Trạng thái trùng lặp: chiếm trọn thân hộp thoại, có hai lối đi tiếp ------------------
  if (duplicate) {
    return (
      <div className={styles.centered}>
        <WarningFilled className={styles.warnIcon} />
        <h3 className={styles.doneTitle}>Yêu cầu trùng lặp</h3>
        <p className={styles.doneText}>
          Bạn đã gửi một yêu cầu thuê xe này với cùng khung giờ. Vui lòng đợi chủ xe phản hồi trước
          khi gửi yêu cầu mới.
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
    );
  }

  return (
    <div className={styles.flow}>
      <BookingSteps current={step} skipped={skippedSteps} />

      {step !== 'done' ? (
        <div className={styles.recap}>
          {vehicleImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh xe từ storage ngoài
            <img src={vehicleImageUrl} alt={vehicleName} className={styles.recapImg} />
          ) : (
            <div className={styles.recapImgPlaceholder} aria-hidden="true" />
          )}
          <div className={styles.recapBody}>
            <div className={styles.recapName}>{vehicleName}</div>
            {/* Giá 0 đ là giá thật; chỉ ẩn khi backend KHÔNG có giá (null/rỗng). */}
            {pricePerDay != null && pricePerDay !== '' ? (
              <div className={styles.recapPrice}>
                {formatMoneyVnd(pricePerDay)}
                <span>/ngày</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {step === 'dates' ? (
        <>
          <p className={styles.stepHint}>Chọn thời gian thuê để kiểm tra xe còn trống.</p>
          <div className={styles.row}>
            <DateTimeField
              control={control}
              name="pickupAt"
              label="Ngày nhận xe"
              placeholder="Chọn giờ nhận"
            />
            <DateTimeField
              control={control}
              name="returnAt"
              label="Ngày trả xe"
              placeholder="Chọn giờ trả"
            />
          </div>
          {stepError ? (
            <Alert type="warning" showIcon message={stepError} className={styles.err} />
          ) : null}
          <div className={styles.actions}>
            <Button onClick={onClose}>Huỷ</Button>
            <Button
              type="primary"
              loading={availabilityM.isPending}
              onClick={() => void continueFromDates()}
            >
              {availabilityM.isPending ? 'Đang kiểm tra…' : 'Tiếp tục'}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'contact' ? (
        <>
          <div className={styles.dateSummary}>
            <span>
              {formatDateTime(getValues('pickupAt')!.toISOString())} →{' '}
              {formatDateTime(getValues('returnAt')!.toISOString())}
            </span>
            <button type="button" className={styles.linkBtn} onClick={() => setStep('dates')}>
              Đổi ngày
            </button>
          </div>

          {accountPhoneVerified && !editingContact ? (
            /*
             * Đã đăng nhập, SĐT đã xác thực: KHÔNG bắt gõ lại thứ hệ thống đã biết. Hiện thẻ xác
             * nhận gọn; muốn dùng số khác thì bấm "Đổi thông tin" và đi qua OTP như khách mới.
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
            </>
          )}

          {/* Giao tận nơi — chỉ hiện khi chính sách giao nhận của xe đang bật (dữ liệu thật). */}
          {quoteQ.data?.delivery.enabled ? (
            <div className={styles.deliveryBlock}>
              <SwitchField
                control={control}
                name="deliveryRequested"
                label="Giao xe tận nơi"
                description={`Miễn phí/tính phí theo khoảng cách trong bán kính ${quoteQ.data.delivery.maxRadiusKm ?? '—'} km; xa hơn shop sẽ báo giá riêng.`}
              />
              {deliveryRequested ? (
                <TextField
                  control={control}
                  name="deliveryAddress"
                  label="Địa điểm giao xe"
                  placeholder="123 Nguyễn Huệ, Q.1, TP.HCM"
                  autoComplete="street-address"
                />
              ) : null}
            </div>
          ) : null}

          {/* Breakdown từ PricingService — tham khảo; giá chốt vẫn do shop duyệt yêu cầu. */}
          {quoteQ.data ? (
            <PriceBreakdown
              rows={quoteQ.data.breakdown.rows}
              totalAmount={quoteQ.data.breakdown.totalAmount}
              depositAmount={quoteQ.data.breakdown.depositAmount}
              title="Chi tiết giá thuê (dự kiến)"
              footer={
                deliveryRequested ? (
                  <span className={styles.deliveryFootnote}>
                    Chưa gồm phí giao nhận — shop xác nhận theo khoảng cách thực tế.
                  </span>
                ) : null
              }
            />
          ) : quoteQ.isLoading ? (
            <p className={styles.stepHint}>Đang tải chi tiết giá…</p>
          ) : null}

          {vp.error ? (
            <Alert type="error" showIcon message={vp.error} className={styles.err} />
          ) : null}
          {stepError ? (
            <Alert type="error" showIcon message={stepError} className={styles.err} role="alert" />
          ) : null}
          <div className={styles.actions}>
            <Button onClick={() => setStep('dates')}>Quay lại</Button>
            <Button
              type="primary"
              loading={vp.sending || submitM.isPending}
              onClick={() => void continueFromContact()}
            >
              {accountPhoneVerified && !editingContact ? 'Gửi yêu cầu thuê' : 'Gửi mã xác thực'}
            </Button>
          </div>
        </>
      ) : null}

      {step === 'otp' ? (
        <>
          <h3 className={styles.otpTitle}>Nhập mã xác thực</h3>
          <p className={styles.stepHint}>
            Mã gồm 6 số đã được gửi đến <b>{maskPhone(otpPhone)}</b>. XePrime dùng số này để chủ xe
            phản hồi và giúp bạn theo dõi yêu cầu thuê.
          </p>
          <OtpCodeInput
            value={code}
            onChange={onCodeChange}
            onComplete={confirm}
            autoFocus
            disabled={submitting}
          />
          {vp.devCode ? (
            <div className={styles.devHint}>
              Mã dev: <b>{vp.devCode}</b> — chỉ hiện ở môi trường phát triển.
            </div>
          ) : null}
          {stepError ? (
            <Alert type="error" showIcon message={stepError} className={styles.err} role="alert" />
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
          <div className={styles.actions}>
            <Button
              type="primary"
              block
              size="large"
              loading={submitting}
              disabled={code.length !== 6}
              onClick={confirm}
            >
              Gửi yêu cầu thuê
            </Button>
          </div>
        </>
      ) : null}

      {step === 'done' ? (
        <div className={styles.centered}>
          <CheckCircleFilled className={styles.doneIcon} />
          <h3 className={styles.doneTitle}>Yêu cầu đã được gửi</h3>
          <p className={styles.doneText}>
            Gian hàng sẽ xem xét yêu cầu của bạn và liên hệ khi có phản hồi.
          </p>
          {/* Nói rõ đây MỚI là yêu cầu — xe chưa bị giữ chỗ (pending không chiếm lịch). */}
          <Alert
            type="warning"
            showIcon
            className={styles.doneNote}
            message="Xe chưa được đặt giữ. Yêu cầu cần được chủ xe xem xét và chấp thuận."
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
              Xem chuyến đi
            </Button>
            <Button size="large" block onClick={onClose}>
              Về trang chủ
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
