import { memo, useState, type ReactNode } from 'react';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_LINK_STATUS, STOREFRONT_KIND } from '@xeprime/types';
import { driverLinkTone, telHref } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { MyDriverLink } from '../api';

/** Ý định trên một liên kết — xác nhận (từ chối, ngừng) nằm ở KHU danh sách, không ở thẻ. */
export type DriverLinkIntent = 'accept' | 'decline' | 'leave';

type LinkStatusKey = 'invited' | 'active' | 'suspended' | 'declined' | 'ended';

/** `--xp-space-12`. */
const GAP_12 = space.sm + space.xs;
/** Ảnh bên thuê: 40 trên thẻ (`size="lg"`), 56 trong popup (`size="xl"`) — web `EmployerAvatar`. */
const AVATAR_CARD = 40;
const AVATAR_DIALOG = 56;

/**
 * MỘT chủ xe đối tác của tài khoản này — bản native của `DriverLinkCard` web (#221, Figma
 * `21788:62412`), bố cục ≤640px: ảnh + tên + viên trạng thái; hàng nút trọn bề ngang; các dòng
 * thông tin một cột (loại chủ xe · số chuyến đã hoàn thành · hình thức hợp tác · chuyến đang gán ·
 * được mời/đã tham gia lúc). Chạm thẻ mở popup chi tiết (`DriverLinkDialog`).
 *
 * Lời mời: Liên hệ · Từ chối · Xác nhận hợp tác; đang hợp tác (kể cả tạm khoá): Ngừng làm tài xế ·
 * Liên hệ; đã kết thúc: chỉ đọc.
 */
function DriverLinkCardImpl({
  link,
  pending,
  onIntent,
}: {
  link: MyDriverLink;
  /** Thao tác đang chạy trên CHÍNH liên kết này (`null` = không có) — nút đó quay, nút khác khoá. */
  pending: DriverLinkIntent | null;
  onIntent: (link: MyDriverLink, intent: DriverLinkIntent) => void;
  /** Giữ chữ ký cũ — web không còn lối "xem chuyến" trên thẻ. */
  onViewTrips?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Driving.linkCard');
  const tStatus = useTranslations('Driving.linkStatus');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [detailOpen, setDetailOpen] = useState(false);

  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const working =
    link.linkStatus === DRIVER_LINK_STATUS.ACTIVE ||
    link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED;

  return (
    <>
      <Pressable
        onPress={() => setDetailOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('openDetail', { name: link.employer.name })}
      >
        <Card>
          <YStack gap={space.md}>
            <XStack ai="center" gap={GAP_12} flexWrap="wrap">
              <EmployerAvatar link={link} size={AVATAR_CARD} />
              <Text
                f={1}
                minWidth={0}
                col={colors.text}
                fos={fontSize.h3}
                fow={fontWeight.semibold}
              >
                {link.employer.name}
              </Text>
              <ToneBadge tone={driverLinkTone(link.linkStatus)}>
                {tStatus(link.linkStatus as LinkStatusKey)}
              </ToneBadge>
            </XStack>

            <LinkActions link={link} pending={pending} onIntent={onIntent} />

            <YStack gap={space.sm}>
              <Fact label={t('ownerKind')}>
                {domainLabel('driverEmployerKind', link.employer.kind)}
              </Fact>
              {working ? (
                <Fact label={t('completedTrips')}>{fmt.count(link.completedTripCount)}</Fact>
              ) : null}
              <Fact label={t('driverType')}>{domainLabel('driverType', link.driverType)}</Fact>
              {working ? (
                <Fact label={t('activeTrips')}>{fmt.count(link.activeTripCount)}</Fact>
              ) : null}
              <Fact label={invited ? t('invitedAt') : t('joinedAt')}>
                {fmt.dateTime(invited ? link.invitedAt : (link.respondedAt ?? link.invitedAt))}
              </Fact>
            </YStack>
          </YStack>
        </Card>
      </Pressable>

      <DriverLinkSheet
        link={link}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        pending={pending}
        onIntent={(target, intent) => {
          setDetailOpen(false);
          onIntent(target, intent);
        }}
      />
    </>
  );
}

/** `memo`: HÀNG của một danh sách cuộn. */
export const DriverLinkCard = memo(DriverLinkCardImpl);

function EmployerAvatar({ link, size }: { link: MyDriverLink; size: number }) {
  const t = useTranslations('Listings.card');
  // Gian hàng tuyến gói mang dấu tích xanh; chủ xe cá nhân thì không (web `EmployerAvatar`).
  const verified = link.employer.kind === STOREFRONT_KIND.SHOP;
  return (
    <Avatar
      name={link.employer.name}
      url={link.employer.avatarUrl ?? null}
      size={size}
      {...(verified ? { verifiedLabel: t('shopVerified') } : {})}
    />
  );
}

/** Cụm nút — `LinkActions` web; `primaryContact` = nút Liên hệ đặc trong popup. */
function LinkActions({
  link,
  pending,
  onIntent,
  primaryContact = false,
}: {
  link: MyDriverLink;
  pending: DriverLinkIntent | null;
  onIntent: (link: MyDriverLink, intent: DriverLinkIntent) => void;
  primaryContact?: boolean;
}) {
  const t = useTranslations('Driving.linkCard');
  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;
  const working =
    link.linkStatus === DRIVER_LINK_STATUS.ACTIVE ||
    link.linkStatus === DRIVER_LINK_STATUS.SUSPENDED;
  /* Có thao tác chạy ⇒ khoá cả cụm; chỉ NÚT của thao tác đó quay (web `busy` + `loading`). */
  const busy = pending !== null;
  // Gọi qua `telHref` dùng chung (chuẩn hoá +84/khoảng trắng) như web, không ghép `tel:` thô.
  const tel = telHref(link.employer.phone);

  const contact = tel ? (
    <YStack f={1} key="contact">
      <Button
        label={t('contact')}
        // Hàng BA nút (lời mời): bỏ icon để nhãn không bị "…" (người dùng chốt 28/10/2026).
        {...(invited ? {} : { icon: 'call-outline' as const })}
        tight={invited}
        variant={primaryContact ? 'primary' : 'secondary'}
        onPress={() => void Linking.openURL(tel)}
      />
    </YStack>
  ) : null;

  let buttons: ReactNode[] = [];
  if (invited) {
    buttons = [
      contact,
      <YStack f={1} key="decline">
        <Button
          label={t('decline')}
          tight
          variant="dangerOutline"
          loading={pending === 'decline'}
          disabled={busy}
          onPress={() => onIntent(link, 'decline')}
        />
      </YStack>,
      <YStack f={1} key="accept">
        <Button
          label={t('acceptShort')}
          accessibilityLabel={t('accept')}
          tight
          loading={pending === 'accept'}
          disabled={busy}
          onPress={() => onIntent(link, 'accept')}
        />
      </YStack>,
    ];
  } else {
    buttons = [
      working ? (
        <YStack f={1} key="leave">
          <Button
            label={t('leave')}
            variant="dangerOutline"
            loading={pending === 'leave'}
            disabled={busy}
            onPress={() => onIntent(link, 'leave')}
          />
        </YStack>
      ) : null,
      contact,
    ];
  }

  const visible = buttons.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <XStack gap={GAP_12} flexWrap="wrap">
      {visible}
    </XStack>
  );
}

/** Popup "Chi tiết chủ xe đối tác" — `DriverLinkDialog` web (Figma `21788:71387`). */
function DriverLinkSheet({
  link,
  open,
  onClose,
  pending,
  onIntent,
}: {
  link: MyDriverLink;
  open: boolean;
  onClose: () => void;
  pending: DriverLinkIntent | null;
  onIntent: (link: MyDriverLink, intent: DriverLinkIntent) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Driving.linkDialog');
  const tCard = useTranslations('Driving.linkCard');
  const tStatus = useTranslations('Driving.linkStatus');
  const tDetail = useTranslations('Driving.detail');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const kind = domainLabel('driverEmployerKind', link.employer.kind);
  const empty = tDetail('emptyValue');
  const contact = link.employerContact;
  const invited = link.linkStatus === DRIVER_LINK_STATUS.INVITED;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      footer={<LinkActions link={link} pending={pending} onIntent={onIntent} primaryContact />}
    >
      <YStack gap={space.md}>
        <XStack ai="center" gap={GAP_12}>
          <EmployerAvatar link={link} size={AVATAR_DIALOG} />
          <YStack f={1} minWidth={0} gap={space.xs}>
            <XStack ai="center" gap={space.sm} flexWrap="wrap">
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} flexShrink={1}>
                {link.employer.name}
              </Text>
              <ToneBadge tone={driverLinkTone(link.linkStatus)}>
                {tStatus(link.linkStatus as LinkStatusKey)}
              </ToneBadge>
            </XStack>
            <Text col={colors.placeholder} fos={fontSize.body}>
              {t('subtitle', { kind })}
            </Text>
          </YStack>
        </XStack>

        <Section title={t('contactSection')}>
          <Fact label={t('representative')}>{contact.representativeName ?? empty}</Fact>
          <Fact label={t('phone')}>{link.employer.phone ?? empty}</Fact>
          <Fact label={t('email')}>{contact.email ?? empty}</Fact>
          <Fact label={t('area')}>{contact.areaName ?? empty}</Fact>
        </Section>

        <YStack h={1} bg={colors.border} />

        <Section title={t('partnershipSection')}>
          <Fact label={tCard('ownerKind')}>{kind}</Fact>
          <Fact label={tCard('driverType')}>{domainLabel('driverType', link.driverType)}</Fact>
          <Fact label={invited ? tCard('invitedAt') : tCard('joinedAt')}>
            {fmt.dateTime(invited ? link.invitedAt : (link.respondedAt ?? link.invitedAt))}
          </Fact>
          <XStack gap={space.md}>
            <Stat label={t('completedTrips')} value={fmt.count(link.completedTripCount)} />
            <Stat label={t('activeTrips')} value={fmt.count(link.activeTripCount)} />
          </XStack>
        </Section>
      </YStack>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={space.sm}>
      <Text
        col={colors.text}
        fos={fontSize.bodyLg}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {children}
    </YStack>
  );
}

/** Một dòng thông tin — `.fact` web: nhãn xám bên trái, giá trị căn phải. */
function Fact({ label, children }: { label: string; children: string }) {
  const colors = useColors();
  return (
    <XStack jc="space-between" gap={space.md}>
      <Text col={colors.placeholder} fos={fontSize.body} flexShrink={0}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.body} ta="right" flexShrink={1}>
        {children}
      </Text>
    </XStack>
  );
}

/** Ô số liệu — `.stat` web: căn giữa, viền xám, nền `color-bg`, số 20/30 semibold. */
function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <YStack
      f={1}
      ai="center"
      gap={space.sm}
      py={space.sm}
      px={GAP_12}
      bw={1}
      bc={colors.border}
      br={radius.control}
      bg={colors.background}
    >
      <Text col={colors.placeholder} fos={fontSize.body} ta="center">
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.lead} lh={30} fow={fontWeight.semibold}>
        {value}
      </Text>
    </YStack>
  );
}
