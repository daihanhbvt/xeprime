import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CUSTOMER_TRIP_FILTER,
  TENANT_ROLE,
  TRIP_ROLE,
  WITHDRAWAL_STATUS_HOLDING_FUNDS,
  type WithdrawalStatus,
} from '@xeprime/types';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTripsInfinite } from '@/features/trips/hooks/use-trips';
import { useWalletSummary, useWithdrawals } from '@/features/wallet/hooks/use-wallet';
import { walletScopeFor } from '@/features/wallet/wallet-scope';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Những thứ KHÔNG tự biến mất khi gửi yêu cầu xoá tài khoản. Bản native của
 * `AccountDeletionImpact` bên web.
 *
 * Form gốc viết cho khách thuê thuần: nó cảnh báo "hành động không hoàn tác" và hết. Nhưng người
 * đứng ở đây có thể đang giữ một số dư, một lệnh rút đang treo, và một pháp nhân gắn vào tài
 * khoản — ba thứ mà người thật phải đối soát, và đối soát SAU khi đóng tài khoản thì chậm hơn
 * nhiều.
 *
 * KHÔNG chặn nút gửi: yêu cầu vẫn đi vào hàng đợi support để người thật xử lý. Đây là thông tin
 * để người dùng tự quyết, không phải một cổng.
 *
 * Đọc ví qua `walletScopeFor` — chủ xe có ví thuộc TENANT (ADR 0038 điều 2), nên đóng đinh scope
 * `account` ở đây sẽ báo "số dư 0đ" cho đúng người đang có tiền chưa rút.
 *
 * AI dựng khối này KHÔNG phải việc của nó: bên web, hai trang `/account` và `/manage/account`
 * quyết định, còn `/account/delete-account` thì không dựng. Xem `DeleteAccountScreen`.
 */
export function AccountDeletionImpact() {
  const t = useTranslations('Account.deletionImpact');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();

  const scope = walletScopeFor(user);
  const wallet = useWalletSummary(scope, Boolean(user));
  const withdrawals = useWithdrawals(scope, Boolean(user));
  /*
   * Vai `renter`: chuyến gian hàng CHO THUÊ không thuộc về con người này, chúng thuộc pháp nhân
   * và không đóng theo tài khoản cá nhân.
   */
  const renterTrips = useTripsInfinite(CUSTOMER_TRIP_FILTER.CURRENT, TRIP_ROLE.RENTER);

  if (!user) return null;

  const isOwner = user.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
  const queries = [wallet, withdrawals, renterTrips];
  const loading = queries.some((q) => q.isLoading);
  const failed = queries.some((q) => q.isError);

  const holding = (withdrawals.data ?? []).filter((row) =>
    (WITHDRAWAL_STATUS_HOLDING_FUNDS as readonly string[]).includes(row.status as WithdrawalStatus),
  ).length;
  const openTrips = renterTrips.data?.pages[0]?.counts.current ?? 0;
  // Còn nghĩa vụ tiền = còn thứ phải đối soát TRƯỚC khi đóng, không phải sau.
  const hasMoney =
    Number(wallet.data?.available ?? 0) > 0 || Number(wallet.data?.pending ?? 0) > 0 || holding > 0;

  return (
    <YStack gap={space.sm}>
      <Callout tone="warning" title={t('title')}>
        <CalloutBody>
          {user.tenant ? t('body', { shop: user.tenant.name }) : t('bodyPersonal')}
        </CalloutBody>
      </Callout>

      {loading ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('loading')}
        </Text>
      ) : (
        <>
          {/* Không kiểm được ảnh hưởng KHÔNG phải lý do chặn — nói rõ rồi để họ gửi tiếp. */}
          {failed ? <Callout tone="info" title={t('loadError')} /> : null}

          {/*
            KHÔNG dùng `DataRow` cho ba dòng này. `DataRow` chia 3:7 nhãn/giá trị và căn phải cột
            giá trị — hợp với dòng tiền có nhãn hai chữ, nhưng ở đây nhãn là "Số dư khả dụng" /
            "Đang chờ chuyển" (vỡ xuống hai dòng trong 30% bề ngang) còn giá trị của dòng gian
            hàng là một TÊN dài ("Việt Car Hà Nội – CN Cầu Giấy") bị ép vào 70% rồi cắt bằng "…".
            Hai lỗi đó cộng lại chính là khối vỡ.

            Thay bằng: tên gian hàng chiếm TRỌN bề ngang với nhãn nằm trên (tên là chữ, nó cần
            chỗ để xuống dòng), rồi hai số tiền thành hai ô bằng nhau — tiền thì ngắn và đứng
            cạnh nhau mới so được với nhau.
          */}
          <Card>
            <YStack gap={space.sm}>
              {user.tenant ? (
                <YStack gap={2}>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('shop')}
                  </Text>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {user.tenant.name}
                  </Text>
                </YStack>
              ) : null}

              {wallet.data ? (
                <XStack gap={space.sm}>
                  <MoneyTile label={t('balance')} value={fmt.money(wallet.data.available)} />
                  <MoneyTile label={t('pending')} value={fmt.money(wallet.data.pending)} />
                </XStack>
              ) : null}
            </YStack>
          </Card>

          <YStack gap={space.xs}>
            {user.tenant ? <Bullet>{isOwner ? t('ownerNote') : t('memberNote')}</Bullet> : null}
            <Bullet>{t('withdrawals', { count: holding })}</Bullet>
            <Bullet>{t('openTrips', { count: openTrips })}</Bullet>
          </YStack>

          {hasMoney ? <Callout tone="warning" title={t('settleFirst')} /> : null}
        </>
      )}
    </YStack>
  );
}

/**
 * Một ô SỐ TIỀN — nhãn nhỏ nằm trên, con số nằm dưới, ô chiếm nửa bề ngang.
 *
 * Nhãn trên/số dưới chứ không nhãn-trái/số-phải: "Số dư khả dụng" và "Đang chờ chuyển" đều là
 * cụm ba chữ, và ở một cột hẹp thì kiểu hai cột đẩy chúng xuống hai dòng rồi vẫn cắt.
 *
 * `adjustsFontSizeToFit` + sàn co: số tiền chín chữ số ("120.000.000 ₫") dài hơn nửa bề ngang máy
 * 360dp — không co thì nó bị cắt đúng ở phần đuôi, tức là mất luôn bậc đơn vị.
 */
function MoneyTile({ label, value }: { label: string; value: string }) {
  return (
    <YStack
      f={1}
      minWidth={0}
      gap={2}
      p={space.sm}
      br={radius.md}
      bg={colors.surfaceMuted}
      bw={1}
      bc={colors.borderSubtle}
    >
      <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
        {label}
      </Text>
      <Text
        col={colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {value}
      </Text>
    </YStack>
  );
}

function Bullet({ children }: { children: string }) {
  return (
    <XStack gap={space.xs} ai="flex-start">
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        •
      </Text>
      <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}
