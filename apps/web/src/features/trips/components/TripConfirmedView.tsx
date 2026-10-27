'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { isZeroMoney } from '@xeprime/domain';
import {
  COLLATERAL_MODE,
  DEPOSIT_COLLECTION_MODE,
  FUEL_TYPE,
  serviceRequiresDriverLicence,
} from '@xeprime/types';
import { BookingJourney } from '@/features/booking-requests/components/BookingJourney';
import { ROUTES } from '@/constants/routes';
import { BookingReviewCosts } from '@/features/booking-requests/components/BookingReviewCosts';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { readPickupChecklist, writePickupChecklist } from '@/lib/pickup-checklist-memory';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { tripFinanceBreakdown } from '../booking-trip-view';
import type { CustomerTripDetail } from '../types';
import { TripDriverCard } from './TripDriverCard';
import { TripFinanceCard } from './TripFinanceCard';
import { TripHoldPanel } from './TripHoldPanel';
import { TripNotReceivedReport } from './TripNotReceivedReport';
import { TripOwnerActions } from './TripOwnerActions';
import { TripPageHeader, useTripDetailCrumbs } from './TripPageHeader';
import {
  TripColumns,
  TripPlanChangeCard,
  TripRequestPill,
  TripRequestRenterCard,
  TripRequestStatusCard,
  TripRequestTripCard,
  useTripRequestData,
} from './TripRequestLayout';
import layout from './TripRequestLayout.module.css';
import styles from './TripConfirmedView.module.css';

/**
 * Chuyến của KHÁCH đã được xác nhận, chờ ngày nhận xe (chặng `ready`) — Figma `19879:72913`
 * ("Details / Confirm / Done", khung PC 1440), hai cột:
 *
 *  - TRÁI (`19759:40234`): thẻ trạng thái "Hẹn bạn vào ngày nhận xe" (viền nét đứt xanh) · thông
 *    tin chuyến đi (kèm lối nhắn tin cạnh tên chủ xe) · checklist nhận xe · người thuê.
 *  - PHẢI (`19759:40326`): chi phí (số ĐÃ ĐÓNG BĂNG của đơn) · các khoản khác (tiền giữ chỗ "Đã
 *    thanh toán", cọc khi nhận xe) · cần thay đổi kế hoạch.
 *
 * Ranh giới nghiệp vụ, đều do SERVER quyết — màn này chỉ đọc:
 *  - Đơn đã ra đời trong transaction đối soát (ADR 0044 điều 2); số tiền là số đóng băng của đơn
 *    (ADR 0024). Bảng kê chỉ hiện khi server nói nó còn khớp số trên đơn (`finance.breakdown`);
 *    lệch (chủ xe chốt lại phí giao nhận) hay có phát sinh ⇒ thẻ tiền đầy đủ `TripFinanceCard`.
 *  - Kênh liên hệ mở theo `canContact` (ADR 0028 điều 9 · ADR 0056).
 *  - Huỷ theo `canCustomerCancelTrip` (`TripPlanChangeCard`); cửa chặn thật là
 *    `POST /trips/:id/cancel`.
 *  - Checklist là LỜI DẶN cho ngày nhận xe; khách tự tick để nhớ, dấu tick chỉ lưu trong trình
 *    duyệt (`pickup-checklist-memory`), không gửi server — biên bản bàn giao vẫn là nơi chốt.
 *
 * Hình thức thiết kế có lối "Chỉnh sửa" ở thẻ chuyến; chuyến đã xác nhận KHÔNG có đường sửa nào
 * (lịch đã giữ, giá đã chốt) nên lối đó bị ẩn hẳn.
 */
export function TripConfirmedView({
  trip,
  backHref,
}: {
  trip: CustomerTripDetail;
  backHref: string;
}) {
  const t = useTranslations('Trips.confirmed');
  const tDetail = useTranslations('Trips.detail');
  const fmt = useAppFormat();
  const data = useTripRequestData(trip);
  const checklistId = useId();
  const crumbs = useTripDetailCrumbs(ROUTES.TRIPS);
  const now = useNow();

  const hold = trip.hold ?? null;
  const finance = trip.finance ?? null;
  const breakdown =
    finance && finance.surcharges.length === 0 ? tripFinanceBreakdown(finance) : null;

  /*
   * Lời nhắc huỷ theo MỐC ĐÃ LƯU của server (`freeCancelUntil`, ADR 0032 điều 5) — không tính lại từ
   * giờ nhận xe. Chuyến không đi qua khoản giữ chỗ thì không có mốc nào để hứa.
   */
  const policyBody = hold
    ? new Date(hold.freeCancelUntil).getTime() > now
      ? t('policy.bodyFree', { time: fmt.dateTime(hold.freeCancelUntil) })
      : t('policy.bodyAfter', { time: fmt.dateTime(hold.freeCancelUntil) })
    : t('policy.bodyNoHold');

  return (
    <TripColumns
      header={
        <TripPageHeader
          backHref={backHref}
          backLabel={tDetail('back')}
          home={false}
          crumbs={crumbs}
          title={t('page.title')}
          description={t('page.description')}
          aside={<BookingJourney current="confirmed" hasHoldStage={hold != null} complete />}
        />
      }
      lead={
        <TripRequestStatusCard
          variant="confirmed"
          tag={t('status.tag')}
          tone="success"
          title={t('status.title')}
          body={t('status.body', { vehicle: trip.vehicle.name, owner: trip.shop.name })}
        >
          <a href={`#${checklistId}`} className={styles.guideLink}>
            {t('status.guide')}
          </a>
        </TripRequestStatusCard>
      }
      main={
        <>
          <TripRequestTripCard
            trip={trip}
            data={data}
            ownerAction={<TripOwnerActions trip={trip} />}
          />

          {/* Người sẽ đến đón — chuyến có tài xế (ADR 0067). Chuyến khác: khối im lặng. */}
          <TripDriverCard trip={trip} />

          <PickupChecklist trip={trip} data={data} anchorId={checklistId} />

          <TripRequestRenterCard trip={trip} />
        </>
      }
      priority={
        <>
          {/*
            "Chưa nhận được xe" (ADR 0066, lớp 1) — chặng `ready` là đúng lúc khách cần nó nhất: đã
            quá giờ hẹn mà chưa ai bàn giao. Ngoài cửa sổ 120′ (do server tính) khối tự im lặng.
          */}
          <TripNotReceivedReport trip={trip} />

          {/*
            Quay về từ MoMo/VNPAY (ADR 0058) bằng liên kết CŨ `/trips/:id?paymentOrder=` — lượt mở trước
            13/10/2026. Không có tham số thì khối tự im lặng.
          */}
          <TripGatewayReturn tripId={trip.id} />

          {/*
            Chuyển THỪA (trả hai lần, hoặc cả QR lẫn ví) ⇒ có khoản XePrime nợ khách: phải nói ngay và
            mời khai tài khoản nhận hoàn, không đợi tới lúc nhận xe. `TripHoldPanel` đã biết nói từng ca
            của khoản hoàn (kể cả hộp khai tài khoản) — dùng lại nó.
          */}
          {hold?.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}

          {/*
            Đơn KHÔNG đi qua khoản giữ chỗ của XePrime (tuyến gói tắt công tắc thu cọc). Khách phải
            được nói thẳng giới hạn bảo vệ trước khi chuyển tiền cho ai đó ngoài nền tảng (ADR 0028
            điều 9).
          */}
          {trip.depositCollectionMode === DEPOSIT_COLLECTION_MODE.DIRECT ? (
            <Alert
              type="info"
              showIcon
              title={tDetail('directDeposit.title')}
              description={tDetail('directDeposit.body')}
            />
          ) : null}
        </>
      }
      aside={
        <>
          {breakdown ? (
            <BookingReviewCosts
              listing={data.listing}
              breakdown={breakdown}
              loading={false}
              isDelivery={trip.deliveryRequested}
              listedRows={[]}
              holdTag={
                hold?.paidAt ? (
                  <TripRequestPill tone="success" inline>
                    {t('costs.holdTag')}
                  </TripRequestPill>
                ) : undefined
              }
              headingLevel={2}
              surface="trip"
              paidAmount={hold?.paidAt ? hold.paidAmount : null}
              frozen
            />
          ) : finance ? (
            <TripFinanceCard finance={finance} closed={false} />
          ) : (
            <section className={layout.card}>
              <h2 className={layout.cardTitle}>{tDetail('priceBlock')}</h2>
              <p className={layout.cardLead}>{tDetail('priceEmpty')}</p>
            </section>
          )}

          <TripPlanChangeCard trip={trip} body={policyBody} />
        </>
      }
    />
  );
}

/**
 * "Checklist nhận xe" — Figma `19759:40566`: những gì khách phải mang và làm lúc nhận xe, đọc từ
 * CHÍNH chuyến này (dịch vụ có cần bằng lái không, xe điện hay xăng, cọc bao nhiêu, chủ xe đòi giấy
 * tờ gì). Mục không áp dụng thì không vẽ — "nộp cọc 0đ" là một lời dặn sai.
 */
function PickupChecklist({
  trip,
  data,
  anchorId,
}: {
  trip: CustomerTripDetail;
  data: ReturnType<typeof useTripRequestData>;
  anchorId: string;
}) {
  const t = useTranslations('Trips.confirmed.checklist');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const titleId = useId();

  /*
   * Dấu tick là ghi nhớ CÁ NHÂN trong trình duyệt (theo chuyến), không gửi server — biên bản bàn
   * giao vẫn là nơi chốt. Đọc sau khi mount để HTML của server và lượt render đầu khớp nhau.
   */
  const [checked, setChecked] = useState<string[]>([]);
  useEffect(() => {
    setChecked(readPickupChecklist(trip.id));
  }, [trip.id]);
  const toggle = (key: string, on: boolean) => {
    setChecked((prev) => {
      const next = on ? [...prev.filter((k) => k !== key), key] : prev.filter((k) => k !== key);
      writePickupChecklist(trip.id, next);
      return next;
    });
  };

  const terms =
    data.listing?.rentalTerms?.find((term) => term.serviceType === trip.serviceType) ?? null;
  const documents = (terms?.requiredDocuments ?? [])
    .map((doc) => dl('customerDocumentType', doc, doc))
    .join(', ');

  /*
   * Cọc khi nhận xe — tiền đặt lại cho chủ xe, KHÁC tiền giữ chỗ (ADR 0044 điều 9). Số tiền là số
   * của đơn (`depositRequired`); hồ sơ xe nói khi đó là tài sản thế chấp chứ không phải tiền.
   */
  const cashDeposit =
    trip.finance && !isZeroMoney(trip.finance.depositRequired)
      ? trip.finance.depositRequired
      : null;
  const collateral = data.listing?.collateral ?? null;
  const assetDeposit =
    !cashDeposit && collateral?.mode === COLLATERAL_MODE.ASSET && collateral.assetTypes.length > 0
      ? collateral.assetTypes.map((asset) => dl('collateralAssetType', asset)).join(', ')
      : null;

  const items: Array<{ key: string; title: string; body: string }> = [
    ...(serviceRequiresDriverLicence(trip.serviceType)
      ? [{ key: 'licence', title: t('licence.title'), body: t('licence.body') }]
      : []),
    {
      key: 'identity',
      title: t('identity.title'),
      body: documents ? t('identity.bodyDocuments', { documents }) : t('identity.body'),
    },
    {
      key: 'inspect',
      title: t('inspect.title'),
      body: t('inspect.body', {
        energy: trip.vehicle.fuelType === FUEL_TYPE.ELECTRIC ? 'electric' : 'other',
      }),
    },
    { key: 'sign', title: t('sign.title'), body: t('sign.body') },
    ...(cashDeposit
      ? [
          {
            key: 'deposit',
            title: t('deposit.title', { amount: fmt.money(cashDeposit) }),
            body: t('deposit.body'),
          },
        ]
      : assetDeposit
        ? [
            {
              key: 'asset',
              title: t('asset.title'),
              body: t('asset.body', { assets: assetDeposit }),
            },
          ]
        : []),
  ];

  return (
    <section id={anchorId} className={layout.card} aria-labelledby={titleId}>
      <h2 id={titleId} className={layout.cardTitle}>
        {t('title')}
      </h2>
      <p className={layout.cardLead}>{t('lead')}</p>
      <ul className={styles.checklist}>
        {items.map((item) => (
          <li key={item.key}>
            <label className={styles.checkItem}>
              <input
                type="checkbox"
                className={styles.checkBox}
                checked={checked.includes(item.key)}
                onChange={(event) => toggle(item.key, event.target.checked)}
              />
              <span className={styles.checkText}>
                <span className={styles.checkTitle}>{item.title}</span>
                <span className={styles.checkBody}>{item.body}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
