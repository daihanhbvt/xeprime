import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { WALLET_STATUS } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/DataRow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import { useWalletSummary } from '../hooks/use-wallet';

/**
 * Số dư ví điểm — BA con số, không phải một.
 *
 * Hiện một con số duy nhất sẽ làm người dùng hoặc tưởng rút được nhiều hơn thực tế (khi có lệnh
 * đang chờ chuyển), hoặc tưởng tiền đã biến mất trong lúc chờ. Ba con số trả lời đủ: rút được
 * ngay · đang trên đường · tổng XePrime đang nợ.
 *
 * `legalNote` hiện CỐ ĐỊNH, không phải một dấu hỏi phải chạm vào: bản chất của sổ này là nghĩa vụ
 * phải trả, và người dùng phải đọc được điều đó ở cùng chỗ họ nhìn thấy con số — "1 điểm = 1đ ·
 * rút về ngân hàng được · không hết hạn" (ADR 0033 điều 1).
 */
export function WalletSummaryCard({
  scope,
  onWithdraw,
}: {
  scope: WalletScope;
  /** Bỏ trống = không có nút rút (bề mặt chỉ đọc). */
  onWithdraw?: () => void;
}) {
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const { data, isPending, isError, error, refetch } = useWalletSummary(scope);

  if (isPending) return <MiniRowsSkeleton rows={3} />;
  if (isError) {
    return <ScreenError error={error} title={t('loadError')} onRetry={() => void refetch()} />;
  }

  const frozen = data.status === WALLET_STATUS.FROZEN;
  /*
   * Ngưỡng rút do SERVER đặt (`minWithdrawAmount`), không gõ cứng ở client: đổi chính sách là
   * đổi một con số trong `fee_policies`, không phải phát hành lại app.
   */
  const canWithdraw = !frozen && Number(data.available) >= Number(data.minWithdrawAmount);

  return (
    <Card>
      <YStack gap={space.md}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t(scope === WALLET_SCOPE.SHOP ? 'title.tenant' : 'title.user')}
        </Text>

        {frozen ? <Callout tone="warning">{t('balance.frozen')}</Callout> : null}

        <YStack gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('balance.available')}
          </Text>
          <XStack ai="baseline" gap={space.xs}>
            <Text col={colors.price} fos={fontSize.h2} fow={fontWeight.bold}>
              {fmt.money(data.available)}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('unit')}
            </Text>
          </XStack>
        </YStack>

        <Divider />

        <XStack gap={space.md}>
          <Figure label={t('balance.pending')} value={fmt.money(data.pending)} />
          <Figure label={t('balance.total')} value={fmt.money(data.total)} />
        </XStack>

        {onWithdraw ? (
          <Button label={t('withdraw.action')} disabled={!canWithdraw} onPress={onWithdraw} />
        ) : null}

        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('legalNote')}
        </Text>

        {Number(data.total) === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <YStack f={1} minWidth={0} gap={2}>
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
        {value}
      </Text>
    </YStack>
  );
}
