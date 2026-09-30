import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  ACCOUNT_TRACK,
  STATUS_COLOR,
  accountTrackLabelKey,
  resolveAccountTrack,
  type AccountTrack,
  type AccountTrackInput,
} from '@xeprime/types';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { VerifiedMark } from '@/components/ui/VerifiedMark';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';


/**
 * "Tôi là ai trên sàn này" — MỘT nhãn, giải bằng `resolveAccountTrack` (ADR 0038).
 *
 * Không tự suy từ `planCode` hay `tenantType`: cả hai đều nói sai tuyến (ADR 0014 điều 2 · 0024).
 * Và không in một % chép tay: `serviceFeePercent` là % ĐANG THU theo chính sách phí hiệu lực, nên
 * thiếu số thì nhãn rút gọn chứ KHÔNG bịa 10% — một nhãn hứa 10% trong khi khách bị thu 12% là
 * một lời hứa sai về tiền.
 *
 * `unconfigured` mang tông LỖI chứ không gọi là "hoa hồng": backend đang TỪ CHỐI mọi đường ghi
 * tiền của tenant đó (`TENANT_BILLING_NOT_CONFIGURED` — ADR 0038 điều 1).
 *
 * ## Hai lớp vỏ, MỘT phép suy
 *
 * `plain` bỏ hết viên nhãn, chỉ còn một dòng chữ mang màu của tuyến. Dùng ở chỗ danh tính đã được
 * nói bằng hình rồi — ảnh đại diện có vòng gold và con dấu ở đầu trang hồ sơ, ở thẻ người dùng
 * trong menu. Thêm một viên nhãn gold NGAY DƯỚI một con dấu gold là nói cùng một câu hai lần bằng
 * hai giọng, và cái thứ hai chỉ làm loãng cái thứ nhất.
 *
 * Chữ thì KHÔNG đổi giữa hai vỏ: cùng một phép suy, cùng một bó khoá dịch.
 */
export function AccountTrackBadge({
  tenant,
  size = 'md',
  variant = 'badge',
  center = false,
}: {
  tenant: AccountTrackInput | null | undefined;
  size?: 'sm' | 'md';
  variant?: 'badge' | 'plain';
  center?: boolean;
}) {
  const t = useTranslations('Account.trackBadge');
  const { track, roleKey, planName, serviceFeePercent } = resolveAccountTrack(tenant);

  /** Chữ của nhãn — một nguồn cho cả hai vỏ, để `plain` không đẻ ra một bó khoá thứ hai. */
  const labelFor = () => {
    if (track === ACCOUNT_TRACK.PACKAGE_PENDING) return t('packagePending');
    if (track === ACCOUNT_TRACK.UNCONFIGURED) return t('unconfigured');
    if (track === ACCOUNT_TRACK.SHOP_MEMBER) return t(accountTrackLabelKey(track, roleKey) ?? 'shopMember');
    if (track === ACCOUNT_TRACK.SHOP_OWNER) {
      return planName ? t('shopOwnerWithPlan', { plan: planName }) : t('shopOwner');
    }
    return serviceFeePercent == null
      ? t('commissionOwner')
      : t('commissionOwnerWithFee', { percent: serviceFeePercent });
  };

  if (track === ACCOUNT_TRACK.RENTER) return null;

  if (variant === 'plain') {
    return (
      <Text
        col={PLAIN_TONE[track]}
        fos={size === 'sm' ? fontSize.label : fontSize.bodySm}
        fow={track === ACCOUNT_TRACK.SHOP_OWNER ? fontWeight.bold : fontWeight.medium}
        ta={center ? 'center' : 'left'}
        /*
          KHÔNG giới hạn số dòng: "Chủ gian hàng · Gói Gian hàng tiêu chuẩn" dài hơn bề ngang máy
          360dp, và cắt nó bằng "…" thì bỏ đi đúng phần mang tin — TÊN GÓI. Xuống dòng, căn giữa
          theo đúng cột với tên phía trên.
        */
      >
        {labelFor()}
      </Text>
    );
  }

  /*
   * ĐANG CHỜ THANH TOÁN (ADR 0040) — nhãn TRUNG TÍNH, và nó phải đứng TRƯỚC nhánh `unconfigured`.
   *
   * Cùng `billingMode: null`, nhưng một bên là việc người dùng chưa làm xong còn một bên là sự cố
   * của nền tảng. Dùng tông lỗi cho cả hai là gắn nhãn "hỏng" lên mọi gian hàng vừa mở.
   */
  if (track === ACCOUNT_TRACK.PACKAGE_PENDING) {
    return <StatusBadge label={t('packagePending')} color={STATUS_COLOR.PROCESSING} size={size} />;
  }

  if (track === ACCOUNT_TRACK.UNCONFIGURED) {
    return <StatusBadge label={labelFor()} color={STATUS_COLOR.DANGER} size={size} />;
  }

  if (track === ACCOUNT_TRACK.SHOP_MEMBER) {
    return <StatusBadge label={labelFor()} color={STATUS_COLOR.NEUTRAL} size={size} />;
  }

  if (track === ACCOUNT_TRACK.SHOP_OWNER) {
    /*
     * DẤU XÁC THỰC, không phải một màu trạng thái.
     *
     * Chủ gian hàng là người đã đi qua vòng duyệt hồ sơ VÀ đang trả tiền thuê bao — hai điều mà
     * khách nhìn vào một cái tên không thể tự biết. Vàng dồn vào đúng con dấu (thứ không mang chữ
     * nên không có ngưỡng tương phản của chữ); chữ giữ màu văn bản thường.
     */
    return (
      <XStack
        ai="center"
        alignSelf={center ? 'center' : 'flex-start'}
        gap={space.xs}
        px={space.sm}
        py={space.xs}
        br={radius.pill}
        bg={colors.primaryLight}
      >
        <VerifiedMark label={t('verifiedHint')} size={iconSize.sm} decorative />
        <Text
          col={colors.text}
          fos={size === 'sm' ? fontSize.label : fontSize.bodySm}
          fow={fontWeight.medium}
        >
          {labelFor()}
        </Text>
      </XStack>
    );
  }

  return <StatusBadge label={labelFor()} color={STATUS_COLOR.SUCCESS} size={size} />;
}

/**
 * Màu chữ của vỏ `plain` — cùng NGHĨA với màu viên nhãn, không phải một bảng màu thứ hai.
 *
 * Chủ gian hàng mang gold đậm (`primaryActive`, không phải `primary`): chữ trên nền sáng phải
 * đạt ngưỡng tương phản, còn `primary` là màu của MẢNG và của hình, không phải của chữ.
 */
const PLAIN_TONE: Readonly<Record<AccountTrack, string>> = {
  [ACCOUNT_TRACK.RENTER]: colors.textMuted,
  [ACCOUNT_TRACK.SHOP_OWNER]: colors.primaryActive,
  [ACCOUNT_TRACK.COMMISSION_OWNER]: colors.success,
  [ACCOUNT_TRACK.SHOP_MEMBER]: colors.textMuted,
  [ACCOUNT_TRACK.PACKAGE_PENDING]: colors.info,
  [ACCOUNT_TRACK.UNCONFIGURED]: colors.danger,
};
