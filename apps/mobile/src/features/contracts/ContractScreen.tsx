import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import type { ServiceType, VehicleType } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Card } from '@/components/ui/Card';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useContract } from './hooks/use-contract';
import type { ContractSnapshot } from './api';

/**
 * Xem hợp đồng thuê xe — bản native của trang `/manage/contracts/[id]` + `ContractDocument`.
 *
 * Đọc **duy nhất từ `snapshot`**, không đọc lại đơn: hợp đồng là bản chụp đông cứng tại thời
 * điểm lập, và sửa đơn sau đó KHÔNG được làm văn bản đã lập đổi theo. Đó là lý do server trả cả
 * cụm `shop`/`customer`/`vehicle`/`rental`/`pricing` thay vì vài id để client tự tra.
 *
 * Nhiều ô kiểm tra `?` trước khi vẽ vì hợp đồng ký từ trước có thể thiếu khoá mới (lộ trình,
 * gói dài hạn) — bản chụp cũ không được dựng lại theo luật mới.
 */
export function ContractScreen({ contractId }: { contractId: string }) {
  const t = useTranslations('Bookings.contract');
  const router = useRouter();
  const query = useContract(contractId);

  const back = () => goBackOr(router, ROUTES.manage.bookings());
  const refreshing = query.isRefetching;
  const onRefresh = () => void query.refetch();

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
          <YStack gap={layout.section}>
            <SkeletonText lines={3} />
            <Skeleton height={160} />
            <Skeleton height={200} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError) {
    return (
      <>
        <AppHeader title={t('title')} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            title={t('errorTitle')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <ContractBody
      contract={query.data}
      refreshing={refreshing}
      onRefresh={onRefresh}
      onBack={back}
    />
  );
}

function ContractBody({
  contract,
  refreshing,
  onRefresh,
  onBack,
}: {
  contract: { contractNo: string; createdAt: string; snapshot: ContractSnapshot };
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
}) {
  const t = useTranslations('Bookings.contract');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const s = contract.snapshot;

  const bankLine = s.shop.bankAccountNo
    ? [s.shop.bankAccountNo, s.shop.bankName, s.shop.bankAccountName].filter(Boolean).join(LIST_SEPARATOR)
    : null;
  const brandModel = [s.vehicle.brand, s.vehicle.model].filter(Boolean).join(' ');

  return (
    <>
      <AppHeader title={t('title')} subtitle={s.rental.bookingCode} onBack={onBack} />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          <Card>
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('title')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('contractNo', { no: contract.contractNo })}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('createdAt', { date: fmt.date(contract.createdAt) })}
              </Text>
            </YStack>
          </Card>

          {/* Hai bên */}
          <Card>
            <YStack gap={space.md}>
              <YStack gap={2}>
                <SectionTitle>{t('partyA')}</SectionTitle>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {s.shop.name}
                </Text>
                {[s.shop.address, s.shop.province].filter(Boolean).length > 0 ? (
                  <Line>{[s.shop.address, s.shop.province].filter(Boolean).join(', ')}</Line>
                ) : null}
                {s.shop.phone ? <Line>{t('phone', { phone: s.shop.phone })}</Line> : null}
                {bankLine ? <Line>{t('bankAccount', { account: bankLine })}</Line> : null}
              </YStack>

              <Divider />

              <YStack gap={2}>
                <SectionTitle>{t('partyB')}</SectionTitle>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {s.customer.name}
                </Text>
                {s.customer.phone ? <Line>{t('phone', { phone: s.customer.phone })}</Line> : null}
              </YStack>
            </YStack>
          </Card>

          {/* Xe */}
          <Card>
            <YStack gap={space.xs}>
              <SectionTitle>{t('vehicleHeading')}</SectionTitle>
              <DataRow label={t('vehicleName')} value={s.vehicle.name} />
              <DataRow label={t('plateNumber')} value={s.vehicle.plateNumber ?? '—'} />
              <DataRow
                label={t('vehicleType')}
                value={domainLabel('vehicleType', s.vehicle.vehicleType as VehicleType)}
              />
              <DataRow
                label={t('serviceType')}
                value={domainLabel('serviceType', s.vehicle.serviceType as ServiceType)}
              />
              {brandModel ? <DataRow label={t('brandModel')} value={brandModel} /> : null}
              {s.vehicle.manufactureYear ? (
                <DataRow label={t('manufactureYear')} value={String(s.vehicle.manufactureYear)} />
              ) : null}
              {s.vehicle.color ? <DataRow label={t('color')} value={s.vehicle.color} /> : null}
              {s.vehicle.seatCount ? (
                <DataRow
                  label={t('seatCount')}
                  value={t('seats', { count: s.vehicle.seatCount })}
                />
              ) : null}
            </YStack>
          </Card>

          {/* Thời gian thuê */}
          <Card>
            <YStack gap={space.xs}>
              <SectionTitle>{t('rentalHeading')}</SectionTitle>
              <DataRow label={t('pickupAt')} value={fmt.dateTime(s.rental.pickupAt)} />
              <DataRow label={t('returnAt')} value={fmt.dateTime(s.rental.returnAt)} />
              {/*
                Chuyến THUÊ DÀI HẠN ký theo GÓI tháng lịch, không theo số ngày (ADR 0011) — in
                "90 ngày" cho gói 3 tháng là sai văn bản khi các tháng lệch độ dài. Hợp đồng ký
                trước ADR 0011 không có khoá này nên vẫn in số ngày như cũ.
              */}
              {s.rental.longTermPackageMonths ? (
                <DataRow
                  label={t('term')}
                  value={fmt.packageLabel(s.rental.longTermPackageMonths) ?? ''}
                />
              ) : (
                <DataRow label={t('days')} value={t('daysValue', { count: s.rental.days })} />
              )}
              <DataRow label={t('bookingCode')} value={s.rental.bookingCode} />
              {s.rental.routeType ? (
                <DataRow
                  label={t('routeType')}
                  value={domainLabel('routeType', s.rental.routeType)}
                />
              ) : null}
              {s.rental.pickupAddress ? (
                <DataRow label={t('pickupAddress')} value={s.rental.pickupAddress} block />
              ) : null}
              {s.rental.destination ? (
                <DataRow label={t('destination')} value={s.rental.destination} block />
              ) : null}
            </YStack>
          </Card>

          {/* Chi phí */}
          <Card>
            <YStack gap={space.xs}>
              <SectionTitle>{t('pricingHeading')}</SectionTitle>
              <DataRow label={t('baseAmount')} value={fmt.money(s.pricing.baseAmount)} />
              <DataRow label={t('deliveryFee')} value={fmt.money(s.pricing.deliveryFee)} />
              <DataRow
                label={t('discountAmount')}
                value={`−${fmt.money(s.pricing.discountAmount)}`}
                tone="discount"
              />
              <Divider />
              <DataRow label={t('totalAmount')} value={fmt.money(s.pricing.totalAmount)} strong />
              <DataRow label={t('depositAmount')} value={fmt.money(s.pricing.depositAmount)} />
              <DataRow label={t('paidAmount')} value={fmt.money(s.pricing.paidAmount)} />
              <DataRow
                label={t('remainingAmount')}
                value={fmt.money(s.pricing.remainingAmount)}
                tone="price"
                strong
              />
            </YStack>
          </Card>

          {/* Điều khoản */}
          <Card>
            <YStack gap={space.sm}>
              <SectionTitle>{t('termsHeading')}</SectionTitle>
              <Term index={1}>{t('term1')}</Term>
              <Term index={2}>{t('term2')}</Term>
              <Term index={3}>{t('term3')}</Term>
              <Term index={4}>{t('term4')}</Term>
            </YStack>
          </Card>

          {s.note ? (
            <Card>
              <YStack gap={space.xs}>
                <SectionTitle>{t('noteHeading')}</SectionTitle>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {s.note}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {/*
            Ô ký giữ nguyên như văn bản in của web: hợp đồng này được đọc trên điện thoại rồi
            KÝ TAY trên bản in, nên bỏ phần ký đi là bỏ mất một nửa mục đích của văn bản.
          */}
          <Card>
            <XStack gap={space.md}>
              <SignBlock role={t('partyA')} hint={t('signHint')} />
              <SignBlock role={t('partyB')} hint={t('signHint')} />
            </XStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
      {children.toUpperCase()}
    </Text>
  );
}

function Line({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

function Term({ index, children }: { index: number; children: string }) {
  return (
    <XStack gap={space.xs}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {index}.
      </Text>
      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
        {children}
      </Text>
    </XStack>
  );
}

function SignBlock({ role, hint }: { role: string; hint: string }) {
  return (
    <YStack f={1} ai="center" gap={2}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} ta="center">
        {role}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.label} ta="center">
        {hint}
      </Text>
    </YStack>
  );
}
