'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { TextField } from '@/components/form/TextField';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { maskPhone } from '@/features/phone-verification/mask';
import { verifyOtp } from '@/features/phone-verification/api';
import { ROUTES } from '@/constants/routes';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { checkAvailability, submitBookingRequest } from '../api';
import { requestFormSchema, type RequestFormValues } from '../schema';
import styles from './RequestBookingFlow.module.css';

type Step = 'dates' | 'contact' | 'otp' | 'done';

interface RequestBookingFlowProps {
  vehicleId: string;
  vehicleName: string;
  vehicleImageUrl?: string | null;
  pricePerDay?: string | null;
  /** Ngày giờ đã chọn ở bộ lọc "Tìm xe khả dụng" (ISO) — prefill để khách khỏi nhập lại. */
  pickupAt?: string | null;
  returnAt?: string | null;
  onClose: () => void;
}

/**
 * Luồng đặt xe cho khách (mobile-first, từng bước): (1) ngày giờ → kiểm tra khung giờ trống →
 * (2) họ tên + SĐT → (3) xác minh OTP → thành công. OTP thành công vừa xác thực SĐT vừa
 * tạo/đăng nhập tài khoản (passwordless) + gửi yêu cầu; khách vào thẳng /trips, không mật khẩu.
 * Không hỏi email/ghi chú (tránh rắc rối). Không mất dữ liệu khi OTP sai/gửi lại.
 */
export function RequestBookingFlow({
  vehicleId,
  vehicleName,
  vehicleImageUrl,
  pricePerDay,
  pickupAt,
  returnAt,
  onClose,
}: RequestBookingFlowProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('dates');
  const [otpPhone, setOtpPhone] = useState('');
  const [code, setCode] = useState('');
  const [stepError, setStepError] = useState<string | null>(null);

  const { control, trigger, getValues } = useForm<RequestFormValues>({
    resolver: yupResolver(requestFormSchema),
    defaultValues: {
      customerName: '',
      customerPhone: '',
      pickupAt: pickupAt ? dayjs(pickupAt) : null,
      returnAt: returnAt ? dayjs(returnAt) : null,
    },
  });

  const vp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.BOOKING);

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
        setStepError('Xe đã có lịch trong khung giờ này. Vui lòng chọn thời gian khác.');
      }
    },
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const submitM = useMutation({
    mutationFn: () => {
      const v = getValues();
      return submitBookingRequest({
        vehicleId,
        customerName: v.customerName.trim(),
        customerPhone: otpPhone,
        pickupAt: v.pickupAt?.toISOString() ?? '',
        returnAt: v.returnAt?.toISOString() ?? '',
      });
    },
    onSuccess: async () => {
      // Phiên mới (passwordless) → làm mới auth.me để cả app biết khách đã đăng nhập.
      await queryClient.invalidateQueries();
      setStep('done');
    },
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const verifyM = useMutation({
    mutationFn: () => verifyOtp({ phone: otpPhone, purpose: PHONE_VERIFICATION_PURPOSE.BOOKING, code }),
    onSuccess: () => submitM.mutate(),
    onError: (e) => setStepError(getErrorMessage(e)),
  });

  const submitting = verifyM.isPending || submitM.isPending;

  async function continueFromDates() {
    setStepError(null);
    if (await trigger(['pickupAt', 'returnAt'])) availabilityM.mutate();
  }

  async function continueFromContact() {
    setStepError(null);
    if (!(await trigger(['customerName', 'customerPhone']))) return;
    const phone = getValues('customerPhone').trim();
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
    if (verifyM.isSuccess) submitM.mutate();
    else verifyM.mutate();
  }

  function onCodeChange(next: string) {
    if (stepError) setStepError(null);
    setCode(next);
  }

  function backToContact() {
    setStep('contact');
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

  return (
    <div className={styles.flow}>
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
            {pricePerDay ? (
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
            <DateTimeField control={control} name="pickupAt" label="Nhận xe" placeholder="Chọn giờ nhận" />
            <DateTimeField control={control} name="returnAt" label="Trả xe" placeholder="Chọn giờ trả" />
          </div>
          {stepError ? <Alert type="error" showIcon message={stepError} className={styles.err} /> : null}
          <div className={styles.actions}>
            <Button onClick={onClose}>Huỷ</Button>
            <Button type="primary" loading={availabilityM.isPending} onClick={() => void continueFromDates()}>
              Tiếp tục
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
          <TextField control={control} name="customerName" label="Họ và tên" placeholder="Nguyễn Văn A" autoComplete="name" />
          <TextField control={control} name="customerPhone" label="Số điện thoại" placeholder="0901234567" autoComplete="tel" />
          {vp.error ? <Alert type="error" showIcon message={vp.error} className={styles.err} /> : null}
          <div className={styles.actions}>
            <Button onClick={() => setStep('dates')}>Quay lại</Button>
            <Button type="primary" loading={vp.sending} onClick={() => void continueFromContact()}>
              Tiếp tục
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
          <OtpCodeInput value={code} onChange={onCodeChange} onComplete={confirm} autoFocus disabled={submitting} />
          {vp.devCode ? (
            <div className={styles.devHint}>
              Mã dev: <b>{vp.devCode}</b> — chỉ hiện ở môi trường phát triển.
            </div>
          ) : null}
          {stepError ? <Alert type="error" showIcon message={stepError} className={styles.err} role="alert" /> : null}
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
            <Button type="primary" block size="large" loading={submitting} disabled={code.length !== 6} onClick={confirm}>
              Gửi yêu cầu thuê
            </Button>
          </div>
        </>
      ) : null}

      {step === 'done' ? (
        <div className={styles.done}>
          <CheckCircleFilled className={styles.doneIcon} />
          <h3 className={styles.doneTitle}>Yêu cầu thuê xe đã được gửi</h3>
          <p className={styles.doneText}>
            Chủ xe sẽ nhận được thông báo và phản hồi yêu cầu của bạn. Bạn có thể theo dõi và nhắn tin
            với chủ xe trong mục chuyến của tôi.
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
      ) : null}
    </div>
  );
}
