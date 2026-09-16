import * as Clipboard from 'expo-clipboard';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { buildVietQrUrl, subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { DataRow } from '@/components/ui/DataRow';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { SubscriptionInvoice } from '@/api/subscription/api';
import { usePaymentInfo } from '../hooks/use-subscription';

/** Cỡ ảnh QR — đủ để camera ngân hàng bắt được ở khoảng cách cầm tay. */
const QR_SIZE = 220;
const QR_RATIO = 220 / 260;

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
  const toast = useAppToast();
  const paymentInfo = usePaymentInfo();

  const partial = invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const remaining = partial
    ? (subtractMoney(invoice.totalAmount, invoice.paidAmount) ?? invoice.totalAmount)
    : invoice.totalAmount;

  const info = paymentInfo.data;
  const qrUrl = info ? buildVietQrUrl(info, remaining, invoice.code) : null;

  const copy = (value: string, done: string) => {
    void Clipboard.setStringAsync(value).then(() => toast.showSuccess(done));
  };

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

      <YStack gap={space.xs}>
        {info?.configured ? (
          <>
            <DataRow label={t('bank')} value={info.bankCode ?? ''} />
            <DataRow label={t('accountNumber')} value={info.accountNumber ?? ''} />
            <DataRow label={t('accountName')} value={info.accountName ?? ''} />
          </>
        ) : null}

        <DataRow label={t('amount')} value={fmt.money(remaining)} />

        {/*
          Mã đối soát là thứ DUY NHẤT không được gõ sai — chuyển đúng tiền mà sai nội dung thì
          tiền về tới nơi nhưng không khớp được hoá đơn nào. Vì thế nó có nút chép riêng, và hiện
          ở cỡ chữ đọc được chứ không nhét vào một dòng phụ.
        */}
        <YStack gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('code')}
          </Text>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
            {invoice.code}
          </Text>
        </YStack>

        <XStack gap={space.sm} flexWrap="wrap">
          <Button
            label={t('copyCode')}
            icon="copy-outline"
            variant="secondary"
            size="sm"
            onPress={() => copy(invoice.code, t('copyCode'))}
          />
          <Button
            label={t('copyAmount')}
            icon="copy-outline"
            variant="ghost"
            size="sm"
            onPress={() => copy(remaining, t('copyAmount'))}
          />
          {info?.configured && info.accountNumber ? (
            <Button
              label={t('copyAccount')}
              icon="copy-outline"
              variant="ghost"
              size="sm"
              onPress={() => copy(info.accountNumber as string, t('copyAccount'))}
            />
          ) : null}
        </XStack>
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
