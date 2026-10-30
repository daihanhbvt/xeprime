import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { buildVietQrUrl } from '@xeprime/domain';
import type { components } from '@xeprime/types';
import { DataRow } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { InfoHint } from '@/components/ui/InfoHint';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, radius, space } from '@/theme/tokens';

export type TransferAccount = components['schemas']['HoldPaymentInfoDto'];

/** Ảnh QR do `qr.sepay.vn` sinh (#201, `template=compact`) — ảnh VUÔNG. */
const QR_WIDTH = 260;
const QR_HEIGHT = QR_WIDTH;

const useStyles = makeStyles((colors) => ({
  qr: {
    width: QR_WIDTH,
    height: QR_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
}));

/**
 * Chuyển khoản VietQR của MỘT khoản — bản native của `BankTransferDetails` (web, 13/10/2026).
 *
 * VietQR mang SẴN số tiền và nội dung (ADR 0016 điều 5): không bao giờ để khách tự gõ mã, vì một
 * ký tự sai là một khoản tiền không khớp được. Trên native mọi ô có nút CHÉP — quét QR bằng chính
 * máy đang mở app thì không quét được, và lúc đó chép tay là đường duy nhất.
 *
 * Ảnh hỏng hoặc chưa cấu hình tài khoản nhận ⇒ nói thẳng và chỉ xuống bảng thông tin; một khung
 * trắng im lặng là chỗ khách bỏ cuộc.
 */
export function BankTransferDetails({
  account,
  amount,
  code,
}: {
  account: TransferAccount | null | undefined;
  amount: string;
  code: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  const t = useTranslations('PaymentGateway.checkout.transfer');
  // Hai nút chép chỉ native có (web không chép tên ngân hàng / chủ tài khoản) — dùng chữ sẵn có.
  const tHold = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const copy = useCopy();
  const [qrFailed, setQrFailed] = useState(false);

  const qrUrl = account ? buildVietQrUrl(account, amount, code) : null;

  return (
    <YStack gap={space.md}>
      {qrUrl && !qrFailed ? (
        <YStack ai="center" gap={space.sm}>
          {/* Khung trắng có viền: QR nổi khỏi nền thẻ và đủ lề trắng cho máy quét bắt góc. */}
          <YStack p={space.sm} br={radius.lg} bw={1} bc={colors.borderSubtle} bg={colors.surface}>
            <Image
              source={{ uri: qrUrl }}
              style={styles.qr}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessibilityLabel={t('qrAlt')}
              onError={() => setQrFailed(true)}
            />
          </YStack>
          <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
            {t('qrCaption')}
          </Text>
        </YStack>
      ) : (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {qrUrl ? t('qrFailed') : t('qrUnavailable')}
        </Text>
      )}

      {/* Vạch mảnh tách QR khỏi bảng thông tin; bảng giữ trọn bề ngang để số tài khoản dài không gãy dòng. */}
      <YStack borderTopWidth={1} borderTopColor={colors.borderSubtle} pt={space.xs}>
        {account?.configured ? (
          <>
            {account.bankCode ? (
              <DataRow
                label={t('bank')}
                value={account.bankCode}
                action={
                  <IconButton
                    icon="copy-outline"
                    label={tHold('copyBank')}
                    onPress={() => void copy(account.bankCode as string)}
                  />
                }
              />
            ) : null}
            <DataRow
              label={t('accountNumber')}
              value={account.accountNumber ?? ''}
              // Không `strong`: số tài khoản ảo của SePay dài ~19 ký tự, ở cỡ đậm nó gãy một ký tự
              // cuối xuống dòng riêng ("…68G / 7") — khách chép tay dễ bỏ sót. Số tiền và MÃ mới là
              // hai giá trị phải khớp tuyệt đối nên vẫn giữ nhấn.
              {...(account.accountNumber
                ? {
                    action: (
                      <IconButton
                        icon="copy-outline"
                        label={t('copyAccount')}
                        onPress={() => void copy(account.accountNumber as string)}
                      />
                    ),
                  }
                : {})}
            />
            {account.accountName ? (
              <DataRow
                label={t('accountName')}
                value={account.accountName}
                action={
                  <IconButton
                    icon="copy-outline"
                    label={tHold('copyAccountName')}
                    onPress={() => void copy(account.accountName as string)}
                  />
                }
              />
            ) : null}
          </>
        ) : null}

        <DataRow
          label={t('amount')}
          value={fmt.money(amount)}
          strong
          tone="price"
          action={
            <IconButton
              icon="copy-outline"
              label={t('copyAmount')}
              onPress={() => void copy(amount)}
            />
          }
        />
        {/* MÃ quyết định tiền khớp vào khoản nào — gõ tay sai một ký tự là một khoản treo. */}
        <DataRow
          label={t('code')}
          value={code}
          strong
          hint={<InfoHint content={t('codeHint')} label={t('codeHintLabel')} />}
          action={
            <IconButton icon="copy-outline" label={t('copyCode')} onPress={() => void copy(code)} />
          }
        />
      </YStack>
    </YStack>
  );
}
