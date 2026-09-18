import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, SELLER_PROFILE_STATUS, WALLET_STATUS } from '@xeprime/types';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/DataRow';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
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
  onOpenLedger,
  pageVariant = false,
}: {
  scope: WalletScope;
  /** Bỏ trống = không có nút rút (bề mặt chỉ đọc). */
  onWithdraw?: () => void;
  /**
   * Mở SỔ ví đầy đủ — lịch sử giao dịch và các lệnh rút.
   *
   * Hai chỗ đứng, hai hành động (đúng như web): trên chính màn ví, việc là RÚT; khi thẻ đứng
   * trong hồ sơ "Tài khoản của tôi", việc là MỞ SỔ. Cùng ba con số, cùng một nguồn — chép chúng
   * ra một thẻ thứ hai là mở đường cho hai màn hiện hai số dư khác nhau cho cùng một người.
   */
  onOpenLedger?: () => void;
  /**
   * Hình thái trên chính trang Số dư của khu quản lý.
   *
   * Tiêu đề và nút Rút đã nằm ở hàng tiêu đề trang, cùng khuôn với Giao dịch thu chi. Thẻ chỉ
   * còn làm đúng việc của một thẻ thống kê: trình bày ba con số và lý do nếu chưa rút được.
   */
  pageVariant?: boolean;
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
        {pageVariant ? null : (
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t(scope === WALLET_SCOPE.SHOP ? 'title.tenant' : 'title.user')}
          </Text>
        )}

        {frozen ? <Callout tone="warning">{t('balance.frozen')}</Callout> : null}

        <YStack gap={2}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('balance.available')}
          </Text>
          {/*
            Số dư hiển thị thẳng bằng VND (16/09/2026): đơn vị "điểm" và dòng chú thích
            "1 điểm = 1đ · không hết hạn" đã bỏ khỏi cả hai client cùng lúc — chúng đọc chung
            một bó message, nên bỏ ở một bên là để bên kia nói một điều đã thôi đúng.
          */}
          <Text col={colors.price} fos={fontSize.h2} fow={fontWeight.bold}>
            {fmt.money(data.available)}
          </Text>
        </YStack>

        <Divider />

        <XStack gap={space.md}>
          <Figure label={t('balance.pending')} value={fmt.money(data.pending)} />
          <Figure label={t('balance.total')} value={fmt.money(data.total)} />
        </XStack>

        {onWithdraw ? (
          <YStack gap={space.xs}>
            {/*
              Nút vẫn HIỆN khi chưa đủ điều kiện rút, chỉ bị khoá: ẩn nó đi thì người dùng không
              biết chức năng tồn tại, còn dòng ngay dưới nói rõ vì sao chưa bấm được. Không có
              dòng đó thì một nút xám là một ngõ cụt câm — chỗ mà người ta gọi hỗ trợ.
            */}
            {pageVariant ? null : (
              <Button label={t('withdraw.action')} disabled={!canWithdraw} onPress={onWithdraw} />
            )}
            {/*
              Ví bị khoá thì dải cảnh báo ở ĐẦU THẺ đã nói rồi — khác web, nơi dải nằm trong thẻ
              còn nút nằm ngoài nó nên hai chỗ không chạm nhau. Ở đây chúng cách nhau ba dòng, và
              lặp lại nguyên câu chỉ dạy người dùng bỏ qua vùng đó.
            */}
            {!canWithdraw && !frozen ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t('withdraw.belowMinimum', { min: fmt.money(data.minWithdrawAmount) })}
              </Text>
            ) : null}
          </YStack>
        ) : null}

        {onOpenLedger ? (
          <Button
            label={t('openLedger')}
            variant="secondary"
            icon="arrow-forward"
            onPress={onOpenLedger}
          />
        ) : null}

        {/* Ví GIAN HÀNG mới có hồ sơ người bán để xác minh — ví cá nhân không có trục đó. */}
        {scope === WALLET_SCOPE.SHOP ? <VerifiedBadge /> : null}
      </YStack>
    </Card>
  );
}

/**
 * "Đã xác minh" — hồ sơ người bán đã được nền tảng duyệt.
 *
 * Đứng cạnh số dư có chủ đích: hồ sơ chưa xác minh là lý do một lệnh rút bị treo, và biết điều đó
 * TRƯỚC khi bấm rút rẻ hơn nhiều so với biết sau.
 *
 * Hỏng, thiếu quyền hoặc chưa duyệt ⇒ KHÔNG hiện gì. Đây là một huy hiệu bổ trợ; thay nó bằng một
 * dòng lỗi đỏ giữa thẻ số dư sẽ làm người dùng tưởng tiền của mình có vấn đề.
 */
function VerifiedBadge() {
  const t = useTranslations('Wallet');
  const { has } = usePermissions();
  // Thiếu quyền thì TẮT hẳn request: gọi rồi nhận 403 là một vòng mạng thừa cho một huy hiệu.
  const { data } = useSellerProfile({ enabled: has(PERMISSION.SELLER_PROFILE_VIEW) });
  if (data?.status !== SELLER_PROFILE_STATUS.VERIFIED) return null;

  return (
    <XStack ai="center" jc="center" gap={space.xs}>
      <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
      <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {t('verified')}
      </Text>
    </XStack>
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
