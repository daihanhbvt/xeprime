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
import { useColors } from '@/theme/ThemeProvider';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { WALLET_SCOPE, type WalletScope } from '@/api/wallet/api';
import { canWithdraw } from '../can-withdraw';
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
  const colors = useColors();
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
  const withdrawable = canWithdraw(data);

  /*
   * Tài khoản KHÁCH = `variant="panel"` của web (tab "Tài khoản thanh toán", Figma
   * `19879:74829`): con số khả dụng bên trái, nút rút cùng hàng (≤640px nút xuống dòng, full
   * width), hai con số phụ chia đôi hàng dưới, dòng gợi ý cuối thẻ. Tiêu đề chỉ cho trình đọc màn
   * hình (`.srOnly`) ở web — đầu trang app đã nói cùng câu đó nên không vẽ thêm.
   */
  if (scope === WALLET_SCOPE.ACCOUNT && !pageVariant) {
    return (
      <PanelSummary
        data={data}
        frozen={frozen}
        withdrawable={withdrawable}
        onWithdraw={onWithdraw}
      />
    );
  }

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
              <Button
                icon="cash-outline"
                // Tài khoản khách: "Rút về ngân hàng liên kết" — đúng nhãn web (Figma `19879:74829`).
                label={t(
                  scope === WALLET_SCOPE.ACCOUNT ? 'withdraw.actionLinked' : 'withdraw.action',
                )}
                disabled={!withdrawable}
                onPress={onWithdraw}
              />
            )}
            {/*
              Ví bị khoá thì dải cảnh báo ở ĐẦU THẺ đã nói rồi — khác web, nơi dải nằm trong thẻ
              còn nút nằm ngoài nó nên hai chỗ không chạm nhau. Ở đây chúng cách nhau ba dòng, và
              lặp lại nguyên câu chỉ dạy người dùng bỏ qua vùng đó.
            */}
            {!withdrawable && !frozen ? (
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
  const colors = useColors();
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

/**
 * Hình thái `panel` — bản native của `.panel` trong `WalletSummaryCard.module.css` web.
 *
 * Vùng thẻ (`.card` + `.panel`, ≤640px): viền `color-border` 1px, bo `border-radius-card` (16),
 * nền `bg-container`, đệm `space-md`, khoảng cách khối `space-20`.
 */
function PanelSummary({
  data,
  frozen,
  withdrawable,
  onWithdraw,
}: {
  data: { available: string; pending: string; total: string; minWithdrawAmount: string };
  frozen: boolean;
  withdrawable: boolean;
  onWithdraw?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();

  return (
    <Card radius={radius.card}>
      <YStack gap={toPx(XP_TOKENS['space-20'])}>
        {/* `<Alert type="warning">` ví đóng băng — đứng đầu thẻ như web. */}
        {frozen ? <Callout tone="warning">{t('balance.frozen')}</Callout> : null}

        {/*
          `.panelTop`: khả dụng + nút. ≤640px nút `flex: 1 1 100%` ⇒ xuống dòng, full width.
          `.panelLabel` text-tertiary 14 · `.panelBig` h2 semibold màu `color-text`.
        */}
        <YStack gap={space.md}>
          <YStack gap={space.xs} minWidth={0}>
            <Text col={colors.placeholder} fos={fontSize.body}>
              {t('balance.available')}
            </Text>
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.semibold}>
              {fmt.money(data.available)}
            </Text>
          </YStack>
          {onWithdraw ? (
            /* `CtaButton variant="neutral"` — viền `border-strong`, chữ `text-secondary`. */
            <Button
              variant="neutral"
              label={t('withdraw.actionLinked')}
              disabled={!withdrawable}
              onPress={onWithdraw}
            />
          ) : null}
        </YStack>

        {/*
          `.panelFigures`: lưới 2 cột, gap `space-md` (≤640). dt text-tertiary 14 · dd body-lg
          semibold `color-text`, cách nhãn `space-xs`.
        */}
        <XStack gap={space.md}>
          {[
            { key: 'pending', label: t('balance.pending'), value: fmt.money(data.pending) },
            { key: 'total', label: t('balance.total'), value: fmt.money(data.total) },
          ].map((cell) => (
            <YStack key={cell.key} f={1} minWidth={0} gap={space.xs}>
              <Text col={colors.placeholder} fos={fontSize.body} numberOfLines={1}>
                {cell.label}
              </Text>
              <Text
                col={colors.text}
                fos={fontSize.bodyLg}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {cell.value}
              </Text>
            </YStack>
          ))}
        </XStack>

        {/*
          `.panelHint` text-secondary cỡ `label`. Ví đóng băng đã có cảnh báo ở đầu thẻ — web
          truyền `hint = null` lúc đó, không nói hai lần.
        */}
        {onWithdraw && !withdrawable && !frozen ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('withdraw.belowMinimum', { min: fmt.money(data.minWithdrawAmount) })}
          </Text>
        ) : null}
      </YStack>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const colors = useColors();
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
