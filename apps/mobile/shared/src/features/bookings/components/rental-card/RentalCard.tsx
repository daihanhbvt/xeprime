import { createContext, memo, useCallback, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Linking, Pressable } from 'react-native';
import { Image } from 'expo-image';
import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import { AntIcon } from '@/components/icons/AntIcon';
import { LineIcon } from '@/components/icons/LineIcon';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LIST_SEPARATOR, telHref } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { ContactActions } from '@/components/ui/ContactActions';
import { DashedDivider } from '@/components/ui/DashedDivider';
import type { IconSquareSize } from '@/components/ui/IconSquareButton';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { ServiceTypeChip } from '@/components/ui/ServiceTypeChip';
import { BookingSourceChip } from '@/components/ui/BookingSourceChip';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

/**
 * Khung MỘT thẻ chuyến của màn "Đơn thuê xe" gộp — design v2 (Figma Partner-XePrime "Rental
 * Request - MB" `_Kanban Items` `24175:57187`, người dùng chốt 13/11/2026). Một khuôn cho cả YÊU
 * CẦU (`BookingRequestCard`) lẫn ĐƠN (`BookingCard`):
 *
 *   #mã ····························· [trạng thái]
 *   [dịch vụ] ··························· tiền thuê
 *   ─────────────────────────────────────────────
 *   [ảnh] tên xe / biển số · thông số          (˄)
 *   (mở) khách · Nhắn tin · Gọi · Zalo
 *   (mở) - - - - - - - - - - - - - - - - - - - - -
 *   (mở) Khách trả │ Trả khi nhận xe │ Giữ chỗ
 *   [ô xám: lịch · hình thức nhận …]
 *   thông tin thêm (rủi ro, ghi chú…) · tiến độ
 *   ─────────────────────────────────────────────
 *   đồng hồ / câu tình trạng ········ [nút] [nút]
 *
 * Mũi tên cạnh xe THU/MỞ vùng khách + vùng tiền (Figma: thẻ thứ hai `24175:57188` thu lại) — chỉ
 * là trình bày, mặc định mở để không giấu gì so với web. Thẻ một cột ở mọi khổ (cột Kanban iPad
 * cũng ~340).
 *
 * Khung không biết nghiệp vụ: nơi dùng quyết nội dung từng vùng và hành động.
 */

/** Figma "Vehicle Image" 76×48 bo 8. */
const THUMB = { width: 76, height: 48 } as const;
/** Figma "Avatar" 32 viền `stroke/gray-low200` - app nâng 40 cho bằng khối tên + SĐT (người dùng 20/11/2026). */
const IDENTITY_AVATAR = 40;
/** Figma: thẻ đệm 16, các khối cách 12; đầu thẻ cách dòng 8, đáy đầu thẻ đệm 12. */
const CARD_PAD = 16;
const BLOCK_GAP = 12;
const HEAD_GAP = 8;
/** Mũi tên thu/mở: viên tròn 24, icon 20. */
const TOGGLE = 24;
/** Ô xám lịch thuê: đệm 12, bo 12, dòng cách 8. */
const PANEL_PAD = 12;
/** Cột tiền: nhãn cách số 2; ba cột cách 12. */
const MONEY_GAP = 12;
/** Figma "Vehicle row": ảnh cách chữ 8; viên biển số đệm 8 bo 6. */
const VEHICLE_GAP = 8;
/** Viên biển số bo 6, cách thông số 6. */
const PLATE_RADIUS = 6;
const PLATE_GAP = 6;

const useStyles = makeStyles((colors) => ({
  // Figma "Vehicle Image": bo `num/8`, nền xám khi chưa có ảnh.
  thumb: { ...THUMB, borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  flip: { transform: [{ rotate: '180deg' }] },
  pressed: { opacity: 0.6 },
}));

/**
 * Bề rộng THẬT của chỗ đặt thẻ khi khác cột nội dung — cột Kanban rộng ~340 trên iPad (web đo bằng
 * `@container`). Thẻ v2 luôn một cột; context giữ lại cho `RentalsBoard`.
 */
export const RentalCardWidthContext = createContext<number | null>(null);

export interface RentalCardVehicle {
  name: string;
  imageUrl: string | null | undefined;
  /** "4 chỗ · Số tự động · Điện" — từng mảnh, đã dịch. */
  specs: readonly string[];
  /** Mã nội bộ · biển số. */
  plateLine: string | null;
  /** Mở hồ sơ xe — vắng khi người xem không có quyền xem xe (chữ thường, không dẫn vào 403). */
  onOpen?: () => void;
  /** "Xem lịch xe" — vắng khi không có quyền xem xe. */
  schedule?: { label: string; accessibilityLabel: string; onPress: () => void } | null;
  noImageLabel: string;
}

/** Một cột của hàng tiền ("Khách trả" · "Trả khi nhận xe" · "Giữ chỗ"). */
export interface RentalMoneyColumn {
  key: string;
  label: string;
  /** Đã định dạng. */
  value: string;
  /** Số cần chú ý (còn phải thu) — tô màu thương hiệu. */
  emphasis?: boolean;
}

function RentalCardImpl({
  accessibilityLabel,
  busy = false,
  code,
  stamp,
  status,
  serviceType,
  source,
  price,
  notice,
  vehicle,
  customer,
  money,
  moneyNote,
  schedule,
  extras,
  progress,
  footerStatus,
  actions,
  onOpenDetail,
  alert = false,
}: {
  /**
   * Thẻ CẦN XỬ LÝ GẤP (đơn quá giờ giao xe) - Figma thẻ thứ tư `24486:61072`: cả thẻ nền đỏ nhạt,
   * viền đỏ; ô lịch đổi sang nền trắng để vẫn tách khỏi nền thẻ.
   */
  alert?: boolean;
  /** Tên thẻ cho trình đọc màn hình (tên xe · mã). */
  accessibilityLabel: string;
  busy?: boolean;
  /** Đầu thẻ, trái: "#mã" hoặc "Gửi lúc …". */
  code: string;
  /** Mốc phụ dưới mã ("Đã xử lý lúc …"). */
  stamp?: string | null;
  /** Nhãn trạng thái góc phải đầu thẻ. */
  status?: { label: string; tone: PillTone } | null;
  serviceType: string;
  /**
   * Nguồn đơn (ADR 0110) - viên cạnh viên dịch vụ, như web `BookingCard`. Đơn qua sàn (và yêu cầu)
   * không có viên.
   */
  source?: { code: string; label: string | null } | null;
  /** Số tiền nổi bên phải viên dịch vụ (đã định dạng) + tên của nó cho trình đọc màn hình. */
  price?: { value: string; label: string } | null;
  /** Câu cảnh báo cả chiều ngang dưới đầu thẻ — chỉ khi có. */
  notice?: string | null;
  vehicle: RentalCardVehicle;
  /** Vùng khách (danh tính + nút liên hệ) — thu/mở theo mũi tên. */
  customer: ReactNode;
  /** Hàng cột tiền — thu/mở theo mũi tên; vắng khi chưa có số nào nói được. */
  money?: readonly RentalMoneyColumn[] | undefined;
  /** Chú thích nhỏ dưới hàng tiền ("Tạm tính"). */
  moneyNote?: string | null;
  /** Ô xám: các dòng lịch (`RentalFact`). */
  schedule: ReactNode;
  extras?: ReactNode;
  /** Thanh tiến độ chuyến (nhóm Đang thuê). */
  progress?: ReactNode;
  /** Chân thẻ, trái: đồng hồ / câu tình trạng. */
  footerStatus?: ReactNode;
  /** Chân thẻ, phải: các nút. */
  actions?: ReactNode;
  /** Chạm vào chỗ TRỐNG của thẻ mở chi tiết (web "nhấn vào thẻ để xem chi tiết"). */
  onOpenDetail?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  // Khách + hàng tiền THU GỌN mặc định (người dùng chốt lại 20/11/2026, như web `RentalBoardCard`);
  // mũi tên mở ra. Ô lịch và chân thẻ luôn hiện.
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((open) => !open), []);
  const hasMoney = money !== undefined && money.length > 0;

  return (
    <Card
      padded={false}
      {...(alert ? { tone: 'danger' as const } : {})}
      {...(onOpenDetail ? { onPress: onOpenDetail, accessibilityLabel } : {})}
    >
      <YStack p={CARD_PAD} gap={BLOCK_GAP} opacity={busy ? 0.85 : 1}>
        {/* Figma "Header": mã · trạng thái / dịch vụ · tiền; vạch `stroke/gray-100` đóng đáy. */}
        <YStack gap={HEAD_GAP} pb={BLOCK_GAP} borderBottomWidth={1} borderBottomColor={colors.borderSubtle}>
          <XStack ai="center" jc="space-between" gap={HEAD_GAP}>
            <YStack f={1} minWidth={0}>
              <Text
                col={colors.textMuted}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {code}
              </Text>
              {stamp ? (
                <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
                  {stamp}
                </Text>
              ) : null}
            </YStack>
            {status ? (
              <YStack flexShrink={1} ai="flex-end">
                {/* Figma: nhãn trạng thái KHÔNG viền (bo 6); viên dịch vụ thì có viền. */}
                <Pill label={status.label} tone={status.tone} shape="tag" borderless />
              </YStack>
            ) : null}
          </XStack>
          <XStack ai="center" jc="space-between" gap={HEAD_GAP}>
            <XStack ai="center" gap={space.xs} flexShrink={1} minWidth={0}>
              <ServiceTypeChip value={serviceType} />
              {source ? <BookingSourceChip source={source.code} sourceLabel={source.label} /> : null}
            </XStack>
            {price ? (
              <Text
                col={colors.brandLink}
                fos={typeScale.title.fontSize}
                lh={typeScale.title.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
                accessibilityLabel={`${price.label} ${price.value}`}
              >
                {price.value}
              </Text>
            ) : null}
          </XStack>
        </YStack>

        {notice ? (
          <YStack px={PANEL_PAD} py={space.sm} br={radius.control} bg={colors.warningSubtle}>
            <Text col={colors.textBody} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {notice}
            </Text>
          </YStack>
        ) : null}

        <RentalVehicle
          vehicle={vehicle}
          expanded={expanded}
          onToggle={toggle}
          toggleLabel={expanded ? t('collapse') : t('expand')}
        />

        {expanded ? (
          <>
            <XStack ai="center" jc="space-between" gap={HEAD_GAP} flexWrap="wrap" rowGap={HEAD_GAP}>
              {customer}
            </XStack>
            {hasMoney ? (
              <>
                <DashedDivider color={colors.border} />
                <YStack gap={space.xs}>
                  <RentalMoneyRow columns={money} />
                  {moneyNote ? (
                    <Text
                      ta="center"
                      col={colors.placeholder}
                      fos={typeScale.label.fontSize}
                      lh={typeScale.label.lineHeight}
                    >
                      {moneyNote}
                    </Text>
                  ) : null}
                </YStack>
              </>
            ) : null}
          </>
        ) : null}

        {/* Figma "Rental Details": ô xám bo 12, đệm 12, dòng cách 8. */}
        <YStack p={PANEL_PAD} gap={space.sm} br={radius.control} bg={alert ? colors.surface : colors.background}>
          {schedule}
        </YStack>

        {extras ? <YStack gap={BLOCK_GAP}>{extras}</YStack> : null}

        {progress}

        {footerStatus || actions ? (
          /*
            Figma "Action Buttons": đồng hồ trái · nút phải, cùng một hàng. Câu tình trạng dài (thẻ
            đơn) thì tự xuống dòng riêng và hàng nút dạt về phải ở dòng dưới — `marginLeft: auto`.
          */
          <XStack
            ai="center"
            flexWrap="wrap"
            rowGap={space.sm}
            columnGap={space.sm}
            pt={BLOCK_GAP}
            borderTopWidth={1}
            borderTopColor={colors.borderSubtle}
          >
            {footerStatus ? (
              /*
                `flexBasis` để câu tình trạng dài (VD "Quá cả giờ trả xe ... - chưa xác nhận giao xe")
                tự đẩy hàng nút xuống dòng dưới thay vì bị ép thành cột hẹp xuống dòng từng chữ
                (máy ảo 13/11/2026); đồng hồ ngắn vẫn chung hàng với hai nút như Figma.
              */
              <YStack flexGrow={1} flexShrink={0} flexBasis={FOOTER_STATUS_BASIS} minWidth={0}>
                {footerStatus}
              </YStack>
            ) : null}
            {actions ? (
              <XStack marginLeft="auto" gap={space.sm} flexWrap="wrap" jc="flex-end" rowGap={space.sm}>
                {actions}
              </XStack>
            ) : null}
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

export const RentalCard = memo(RentalCardImpl);

/** Figma "Payment Summary": các cột chia đều, căn giữa, vạch dọc ngăn cột. */
const RentalMoneyRow = memo(function RentalMoneyRow({
  columns,
}: {
  columns: readonly RentalMoneyColumn[];
}) {
  const colors = useColors();
  return (
    <XStack gap={MONEY_GAP} ai="stretch">
      {columns.map((column, index) => (
        <XStack key={column.key} f={1} gap={MONEY_GAP} minWidth={0}>
          {index > 0 ? <YStack w={1} bg={colors.border} /> : null}
          <YStack f={1} minWidth={0} ai="center" jc="center" gap={2}>
            <Text
              ta="center"
              col={colors.placeholder}
              fos={typeScale.label.fontSize}
              lh={typeScale.label.lineHeight}
              numberOfLines={2}
            >
              {column.label}
            </Text>
            <Text
              ta="center"
              col={column.emphasis ? colors.brandLink : colors.text}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fow={column.emphasis ? fontWeight.semibold : fontWeight.medium}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={MONEY_MIN_SCALE}
            >
              {column.value}
            </Text>
          </YStack>
        </XStack>
      ))}
    </XStack>
  );
});

/** Số tiền 9 chữ số trong cột hẹp (máy 360dp) co tối đa chừng này thay vì cắt "…". */
const MONEY_MIN_SCALE = 0.8;

/** Vùng xe: ảnh · tên · viên biển số + thông số · "Xem lịch xe" · mũi tên thu/mở. */
function RentalVehicle({
  vehicle,
  expanded,
  onToggle,
  toggleLabel,
}: {
  vehicle: RentalCardVehicle;
  expanded: boolean;
  onToggle: () => void;
  toggleLabel: string;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <XStack ai="flex-start" gap={VEHICLE_GAP} minWidth={0}>
      <Pressable
        disabled={!vehicle.onOpen}
        onPress={vehicle.onOpen}
        // Tên xe ngay cạnh đã là liên kết cho trình đọc màn hình — hai lối cùng đích đọc liền là lặp.
        accessible={false}
      >
        {vehicle.imageUrl ? (
          <Image
            source={{ uri: vehicle.imageUrl }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={vehicle.imageUrl}
            transition={150}
          />
        ) : (
          <YStack style={styles.thumb} ai="center" jc="center">
            <YStack accessibilityLabel={vehicle.noImageLabel} accessibilityRole="image">
              <AntIcon icon={CarOutlined} size={iconSize.lg} color={colors.placeholder} />
            </YStack>
          </YStack>
        )}
      </Pressable>
      <YStack f={1} minWidth={0} gap={6} ai="flex-start">
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          numberOfLines={1}
          {...(vehicle.onOpen ? { onPress: vehicle.onOpen, accessibilityRole: 'link' as const } : {})}
        >
          {vehicle.name}
        </Text>
        {/*
          Figma: biển số trong viên xám "_Badge" (`bg/gray-50`, bo 6, đệm 8/2, 12/18 đậm vừa) · thông
          số 12/18 cách 6 - vẫn MỘT dòng, thông số cắt "..." khi dài (người dùng 16/11/2026).
        */}
        {vehicle.plateLine || vehicle.specs.length > 0 ? (
          <XStack ai="center" gap={PLATE_GAP} maxWidth="100%">
            {vehicle.plateLine ? (
              <YStack flexShrink={0} px={space.sm} py={2} br={PLATE_RADIUS} bg={colors.background}>
                <Text
                  col={colors.textMuted}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {vehicle.plateLine}
                </Text>
              </YStack>
            ) : null}
            {vehicle.specs.length > 0 ? (
              <Text
                flexShrink={1}
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {vehicle.specs.join(LIST_SEPARATOR)}
              </Text>
            ) : null}
          </XStack>
        ) : null}
        {vehicle.schedule ? (
          <Pressable
            onPress={vehicle.schedule.onPress}
            accessibilityRole="link"
            accessibilityLabel={vehicle.schedule.accessibilityLabel}
            hitSlop={space.sm}
            style={({ pressed }) => (pressed ? styles.pressed : null)}
          >
            <XStack ai="center" gap={space.xs}>
              <LineIcon name="calendar-sm" size={iconSize.sm} color={colors.brandLink} />
              <Text
                col={colors.brandLink}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.semibold}
              >
                {vehicle.schedule.label}
              </Text>
            </XStack>
          </Pressable>
        ) : null}
      </YStack>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ expanded }}
        hitSlop={space.md}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <YStack
          w={TOGGLE}
          h={TOGGLE}
          br={radius.pill}
          ai="center"
          jc="center"
          bg={expanded ? colors.brandLow : colors.surfaceMuted}
        >
          <YStack style={expanded ? styles.flip : null}>
            <LineIcon
              name="chevron-down"
              size={iconSize.lg}
              color={expanded ? colors.brandLink : colors.textMuted}
            />
          </YStack>
        </YStack>
      </Pressable>
    </XStack>
  );
}

/** Bỏ dấu ":" cuối nhãn — chuỗi chung của web viết cho dạng "nhãn: giá trị", Figma v2 thì không. */
export function bareLabel(label: string): string {
  return label.replace(/\s*[:：]\s*$/, '');
}

/** Một dòng "nhãn ······ giá trị" của ô xám (Figma "Pickup Details"): 14/20, nhãn xám, giá trị canh phải. */
export function RentalFact({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: ReactNode;
  /** @deprecated Ô tiền đã thành hàng cột (`money`); giữ để nơi gọi cũ không vỡ. */
  money?: boolean;
  emphasis?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack ai="flex-start" jc="space-between" gap={BLOCK_GAP}>
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} flexShrink={0}>
        {bareLabel(label)}
      </Text>
      <Text
        f={1}
        minWidth={0}
        ta="right"
        col={emphasis ? colors.brandLink : colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={emphasis ? fontWeight.semibold : fontWeight.regular}
      >
        {value}
      </Text>
    </XStack>
  );
}

/** Dòng chú thích nhỏ cuối ô xám ("Tạm tính", nguyện vọng ngày nhận…). */
export function RentalPanelNote({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
      {children}
    </Text>
  );
}

/**
 * Danh tính khách (Figma "Seller Information"): ảnh tròn 32 · tên 14/20 đậm vừa (lối vào hồ sơ khi
 * có) · viên "Khách quen" · SĐT 14/20 xám gọi được — bản native của `CustomerIdentity` web.
 */
export function RentalCustomerIdentity({
  name,
  avatarUrl,
  phone,
  badge,
  onOpen,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  phone: string | null | undefined;
  badge?: string | undefined;
  onOpen?: (() => void) | undefined;
}) {
  const colors = useColors();
  const tel = telHref(phone);
  return (
    <XStack f={1} ai="center" gap={HEAD_GAP} minWidth={0}>
      <Avatar name={name} url={avatarUrl ?? null} size={IDENTITY_AVATAR} soft />
      <YStack f={1} minWidth={0}>
        <XStack ai="center" columnGap={space.xs} rowGap={2} flexWrap="wrap">
          <Text
            flexShrink={1}
            col={onOpen ? colors.accentText : colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={1}
            {...(onOpen ? { onPress: onOpen, accessibilityRole: 'link' as const } : {})}
          >
            {name}
          </Text>
          {badge ? <Pill label={badge} tone="success" /> : null}
        </XStack>
        {phone ? (
          <Text
            col={colors.placeholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            numberOfLines={1}
            {...(tel
              ? { onPress: () => void Linking.openURL(tel), accessibilityRole: 'link' as const }
              : {})}
          >
            {phone}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Cụm liên hệ khách — Nhắn tin · Gọi · Zalo (`ContactActions`). Thẻ đơn v2 dùng ô 36 (`size="md"`);
 * màn khác (hồ sơ khách, công nợ, chuẩn bị bàn giao) giữ ô 44 mặc định.
 *
 * "Nhắn tin" chỉ có khi nơi gọi truyền `onMessage` (đã có đơn với tuyến hoa hồng — ADR 0073);
 * khách chưa có tài khoản thì nút MỜ nhưng vẫn nhận chạm để nơi gọi nói lý do.
 */
export function RentalContactButtons({
  name,
  phone,
  onMessage,
  messageUnavailable = false,
  messageLoading = false,
  disabled = false,
  size = 'lg',
}: {
  name: string;
  phone: string | null | undefined;
  onMessage?: (() => void) | undefined;
  messageUnavailable?: boolean;
  messageLoading?: boolean;
  disabled?: boolean;
  size?: IconSquareSize;
}) {
  const t = useTranslations('BookingRequests.actions');
  const labels = {
    message: t('messageAria', { name }),
    call: t('callAria', { name, phone: phone ?? '' }),
    zalo: t('zaloAria', { name, phone: phone ?? '' }),
  };
  return (
    <ContactActions
      phone={phone}
      labels={labels}
      onMessage={onMessage}
      messageUnavailable={messageUnavailable}
      messageLoading={messageLoading}
      disabled={disabled}
      size={size}
    />
  );
}

/** Chỗ tối thiểu của câu tình trạng ở chân thẻ trước khi hàng nút phải xuống dòng. */
const FOOTER_STATUS_BASIS = 80;
