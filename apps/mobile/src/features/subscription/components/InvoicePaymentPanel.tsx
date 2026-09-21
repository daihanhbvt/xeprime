import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { buildVietQrUrl, subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, radius, space } from '@/theme/tokens';
import type { SubscriptionInvoice } from '@/api/subscription/api';
import { usePaymentInfo } from '../hooks/use-subscription';

/** Cỡ ảnh QR — đủ để camera ngân hàng bắt được ở khoảng cách cầm tay. */
const QR_SIZE = 260;
const QR_RATIO = 260 / 308;

/**
 * Hướng dẫn chuyển khoản cho MỘT hoá đơn gói đang chờ tiền — bản native của `InvoicePaymentPanel`.
 *
 * Dùng ở hai chỗ, đúng như web: bước "chuyển khoản" của tấm mua gói ngay sau khi tạo hoá đơn, và
 * đầu màn "Gói của tôi" khi còn hoá đơn chờ. Người dùng đóng tấm rồi vẫn phải tìm lại được QR —
 * kích hoạt là việc của webhook, không phải của màn còn mở.
 *
 * QR là VietQR quicklink CÓ SẴN số tiền + nội dung (ADR 0016 điều 5): nội dung chuyển khoản là
 * khoá đối soát, không bao giờ để người dùng tự gõ. Chưa cấu hình tài khoản nhận thì rơi về mã +
 * số tiền — có gì hiện nấy, không hiện QR trỏ vào hư không.
 *
 * Hoá đơn `partially_paid` hiện SỐ CÒN THIẾU và QR mang đúng số đó — bắt người chuyển thiếu tự
 * trừ nhẩm là cách nhận thêm một lần chuyển sai.
 */
export function InvoicePaymentPanel({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const copy = useCopy();
  const paymentInfo = usePaymentInfo();

  const partial = invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const remaining = partial
    ? (subtractMoney(invoice.totalAmount, invoice.paidAmount) ?? invoice.totalAmount)
    : invoice.totalAmount;

  const info = paymentInfo.data;
  const qrUrl = info ? buildVietQrUrl(info, remaining, invoice.code) : null;



  return (
    <YStack gap={space.md}>
      <Callout tone="info">
        {partial ? t('partialIntro', { paid: fmt.money(invoice.paidAmount) }) : t('intro')}
      </Callout>

      {qrUrl ? (
        <YStack ai="center">
          <YStack w={QR_SIZE} aspectRatio={QR_RATIO} br={radius.md} ov="hidden">
            <RemoteImage
              uri={qrUrl}
              recyclingKey={invoice.code}
              contentFit="contain"
              accessibilityLabel={t('qrAlt')}
              /* QR tải hỏng thì vẫn còn mã + số tiền bên dưới — không cần hình thay thế. */
              fallback={null}
            />
          </YStack>
        </YStack>
      ) : null}

      <YStack>
        {info?.configured ? (
          <>
            {info.bankCode ? (
              <DataRow
                label={t('bank')}
                value={info.bankCode}
                action={
                  <IconButton
                    icon="copy-outline"
                    label={t('copyBank')}
                    onPress={() => void copy(info.bankCode as string)}
                  />
                }
              />
            ) : null}
            <DataRow
              label={t('accountNumber')}
              value={info.accountNumber ?? ''}
              strong
              {...(info.accountNumber
                ? {
                    action: (
                      <IconButton
                        icon="copy-outline"
                        label={t('copyAccount')}
                        onPress={() => void copy(info.accountNumber as string)}
                      />
                    ),
                  }
                : {})}
            />
            {info.accountName ? (
              <DataRow
                label={t('accountName')}
                value={info.accountName}
                action={
                  <IconButton
                    icon="copy-outline"
                    label={t('copyAccountName')}
                    onPress={() => void copy(info.accountName as string)}
                  />
                }
              />
            ) : null}
          </>
        ) : null}

        <DataRow
          label={t('amount')}
          value={fmt.money(remaining)}
          strong
          tone="price"
          action={
            <IconButton
              icon="copy-outline"
              label={t('copyAmount')}
              onPress={() => void copy(remaining)}
            />
          }
        />

        {/*
          Mã đối soát là thứ quyết định tiền khớp vào hoá đơn nào — đứng riêng một hàng, in đậm,
          kèm nút chép. Gõ tay sai một ký tự là một khoản tiền treo chờ admin gỡ.
        */}
        <DataRow
          label={t('code')}
          value={invoice.code}
          strong
          action={
            <IconButton
              icon="copy-outline"
              label={t('copyCode')}
              onPress={() => void copy(invoice.code)}
            />
          }
        />
      </YStack>

      {invoice.expiresAt ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('expires', { date: fmt.dateTime(invoice.expiresAt) })}
        </Text>
      ) : null}

      <Text col={colors.placeholder} fos={fontSize.label}>
        {t('autoActivateNote')}
      </Text>
    </YStack>
  );
}
