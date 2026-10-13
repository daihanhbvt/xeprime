import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OtpCodeInput, OTP_LENGTH } from '@/features/phone-verification/components/OtpCodeInput';
import { maskPhone } from '@/features/phone-verification/mask';
import type { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { Callout } from '@/components/ui/Callout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { getErrorMessage } from '@/lib/get-error-message';

/**
 * Bước xác thực SĐT — CHỈ xuất hiện khi hệ thống chưa biết số này là của khách.
 *
 * Mã KHÔNG đi trong body của yêu cầu thuê: `CreateBookingRequestDto` không có trường token.
 * Xác thực xảy ra TRƯỚC (purpose `booking`), server tự tra khi nhận yêu cầu — nên bước này chỉ
 * cần gọi `verify` rồi báo cho wizard đi tiếp.
 */
export function RequestOtpStep({
  phone,
  otp,
  onVerified,
  onEditPhone,
  onSubmitCode,
  submitting = false,
}: {
  phone: string;
  otp: ReturnType<typeof usePhoneVerify>;
  onVerified: () => void;
  onEditPhone: () => void;
  /**
   * Mã ĐĂNG NHẬP (ADR 0057): khách chưa đăng nhập thuê xe tự lái — mã này đăng nhập/tạo tài
   * khoản theo SĐT TRƯỚC bước bằng lái, vì bằng lái gắn với TÀI KHOẢN. Có prop này thì nút xác
   * nhận gọi nó thay cho `otp.verify` (mã đăng nhập không đi qua lượt xác minh `booking`).
   */
  onSubmitCode?: (code: string) => void;
  /** Lượt đăng nhập bằng mã đang chạy — chỉ có nghĩa khi có `onSubmitCode`. */
  submitting?: boolean;
}) {
  const t = useTranslations('BookingRequests.flow.otp');
  const tActions = useTranslations('BookingRequests.flow.actions');
  const [code, setCode] = useState('');
  const busy = onSubmitCode ? submitting : otp.verifying;

  function confirm(next = code) {
    if (next.length !== OTP_LENGTH || busy) return;
    if (onSubmitCode) {
      onSubmitCode(next);
      return;
    }
    otp.verify(phone, next);
  }

  function resend() {
    otp.send(phone);
  }

  /*
   * Trong effect chứ không trong thân render: gọi `setStep` lúc render là update-during-render
   * của component khác. Chốt MỘT lần cho mỗi lượt `verified`: nơi gọi có thể làm việc bất đồng bộ
   * (soát bằng lái) và render lại với một hàm `onVerified` mới — không chốt thì gọi lặp.
   */
  const fired = useRef(false);
  useEffect(() => {
    if (otp.status !== 'verified') {
      fired.current = false;
      return;
    }
    if (onSubmitCode || fired.current) return;
    fired.current = true;
    onVerified();
  }, [onSubmitCode, onVerified, otp.status]);

  return (
    <Card>
      <YStack gap={space.lg} ai="center">
        <YStack
          w={space.xl + space.md}
          h={space.xl + space.md}
          br={radius.pill}
          bg={colors.primaryLight}
          ai="center"
          jc="center"
        >
          <Ionicons name="phone-portrait-outline" size={iconSize.lg} color={colors.primaryActive} />
        </YStack>

        <YStack gap={space.xs} ai="center">
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold} ta="center">
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
            {t(
              otp.status !== 'code_sent'
                ? 'notSentHint'
                : onSubmitCode
                  ? 'loginHint'
                  : 'hint',
              { phone: maskPhone(phone) },
            )}
          </Text>
        </YStack>

        {/*
          Lỗi gửi mã (kể cả gửi lại và lượt tự gửi khi phiên xác minh hết hạn) và lỗi xác minh —
          đúng `vp.error` mà web in thành cảnh báo trong bước này, câu nguyên văn của server.
          Đặt TRÊN ô nhập mã: bàn phím che nửa dưới màn, đúng chỗ một dòng đỏ dưới ô sẽ rơi vào.
          Trước đây lỗi gửi lại không hiện ở đâu cả — hook giữ lỗi nhưng không ai vẽ nó.
        */}
        {otp.error ? (
          <YStack alignSelf="stretch">
            <Callout tone="danger">{getErrorMessage(otp.error)}</Callout>
          </YStack>
        ) : null}

        <OtpCodeInput
          value={code}
          onChange={(next) => {
            if (otp.error) otp.clearError();
            setCode(next);
          }}
          onComplete={confirm}
          disabled={busy}
          autoFocus
        />

        {/* `devCode` chỉ có ở môi trường mock — production không bao giờ trả trường này. */}
        {otp.devCode ? (
          <YStack alignSelf="stretch" p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('devCode', { code: otp.devCode })}
            </Text>
          </YStack>
        ) : otp.testCodeEnabled && otp.status !== 'code_sent' ? (
          <YStack alignSelf="stretch" p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.textMuted} fos={fontSize.label} ta="center">
              {t('testCodeHint')}
            </Text>
          </YStack>
        ) : null}

        <YStack alignSelf="stretch">
          <Button
            label={tActions('verify')}
            icon="checkmark-outline"
            size="lg"
            loading={busy}
            disabled={code.length !== OTP_LENGTH}
            onPress={() => confirm()}
          />
        </YStack>

        <XStack gap={space.sm} alignSelf="stretch">
          <YStack f={1}>
            {/* Nhãn NGẮN: hai nút chia đôi một hàng trên màn hẹp, nhãn đầy đủ bị cắt mất phần nói nó làm gì. */}
            <Button label={t('editPhoneShort')} variant="ghost" onPress={onEditPhone} />
          </YStack>
          <YStack f={1}>
            <Button
              label={
                otp.cooldown > 0
                  ? t('resendIn', { seconds: otp.cooldown })
                  : otp.status === 'code_sent'
                    ? t('resend')
                    : t('send')
              }
              variant="ghost"
              disabled={otp.cooldown > 0 || otp.sending}
              onPress={resend}
            />
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}
