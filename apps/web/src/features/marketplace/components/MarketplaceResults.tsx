'use client';

import { CloseOutlined, EditOutlined, FilterOutlined, ReloadOutlined } from '@ant-design/icons';
import { Badge, Button, Select, Skeleton } from 'antd';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_LISTING_SORT,
  LISTING_AMENITY_LABEL,
  LISTING_AMENITY_VALUES,
  LISTING_SORT_LABEL,
  LISTING_SORT_VALUES,
  ROUTE_TYPE_LABEL,
  SEAT_BUCKET_LABEL,
  SERVICE_TYPE,
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  vehicleFuelTypesFor,
  type ListingSort,
  type RouteType,
  type SeatBucket,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { cx } from '@/lib/cx';
import { formatMoneyVnd } from '@/lib/money';
import { formatDate } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { SERVICE_CHIPS } from '../constants';
import { FACET_FILTER_KEYS } from '../filter-params';
import { UNAVAILABLE_PROVINCE_LABEL, provinceLabelOf } from '../province-options';
import { useDestinations } from '../hooks/use-destinations';
import { useInfinitePublicListings } from '../hooks/use-infinite-listings';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { MarketplaceFilters } from '../types';
import { StickySearchOnly } from '../search/SearchExperience';
import { FilterPanel } from './FilterPanel';
import { SearchDialog } from './SearchDialog';
import { VehicleCard } from './VehicleCard';
import styles from './MarketplaceResults.module.css';

/** Số ô khung chờ — bằng đúng cỡ trang của API để lưới không đổi hình khi dữ liệu về. */
const SKELETON_COUNT = 12;

/**
 * Vùng làm việc của `/search` — Figma `18:567` và bộ frame trạng thái `18:1298…18:1510`,
 * mobile `23:1100…23:1405`. CHỈ dùng cho trang kết quả; trang chủ có `VehiclePreview` riêng —
 * hai màn không chia sẻ nhãn/hành động, chỉ chia sẻ primitive (`VehicleCard`, `FilterPanel`,
 * `SearchDialog`).
 *
 * Kết quả tải VÔ HẠN (`useInfinitePublicListings`): sentinel giao cắt viewport thì nạp trang
 * kế; đổi filter/sort là bộ trang reset về trang 1. Không còn phân trang số.
 */
export function MarketplaceResults() {
  const { filters, setFilters } = useMarketplaceFilters();
  // Cùng nguồn với các bộ chọn địa điểm khác — dùng để dịch mã tỉnh sang tên hiển thị.
  const { data: destinations } = useDestinations(34);
  const [filterOpen, setFilterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel } = useCatalogLabels();

  const {
    listings,
    total,
    isInitialLoading,
    initialError,
    appendError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    retryInitial,
    retryNextPage,
  } = useInfinitePublicListings(filters);

  // --- Sentinel tải trang kế -------------------------------------------------------------
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Nạp TRƯỚC khi chạm đáy 800px; guard trùng/hết trang nằm trong hook.
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, listings.length]);

  // --- Chip filter ĐANG ÁP DỤNG (Figma: Sedan ⊗ · 5 chỗ ⊗ · Xăng ⊗ · Xoá tất cả) ---------
  const appliedChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const removeFrom = (field: keyof MarketplaceFilters, value: string) => () =>
      setFilters({ [field]: (filters[field] as string[]).filter((v) => v !== value) });

    for (const v of filters.bodyType ?? [])
      chips.push({
        key: `body-${v}`,
        label: bodyTypeLabel(v) ?? v,
        onRemove: removeFrom('bodyType', v),
      });
    for (const v of filters.brand ?? [])
      chips.push({
        key: `brand-${v}`,
        label: brandLabel(v) ?? v,
        onRemove: removeFrom('brand', v),
      });
    for (const v of filters.seats ?? [])
      chips.push({
        key: `seats-${v}`,
        label: SEAT_BUCKET_LABEL[v as SeatBucket] ?? `${v} chỗ`,
        onRemove: removeFrom('seats', v),
      });
    for (const v of filters.fuelType ?? [])
      chips.push({
        key: `fuel-${v}`,
        label: fuelTypeLabel(v) ?? v,
        onRemove: removeFrom('fuelType', v),
      });
    for (const v of filters.features ?? [])
      chips.push({ key: `feat-${v}`, label: featureLabel(v), onRemove: removeFrom('features', v) });
    for (const amenity of LISTING_AMENITY_VALUES)
      if (filters[amenity])
        chips.push({
          key: `amenity-${amenity}`,
          label: LISTING_AMENITY_LABEL[amenity],
          onRemove: () => setFilters({ [amenity]: undefined }),
        });
    if (filters.priceMin != null || filters.priceMax != null)
      chips.push({
        key: 'price',
        label: `${filters.priceMin != null ? formatMoneyVnd(String(filters.priceMin)) : '0 ₫'} – ${
          filters.priceMax != null ? formatMoneyVnd(String(filters.priceMax)) : '∞'
        }`,
        onRemove: () => setFilters({ priceMin: undefined, priceMax: undefined }),
      });
    return chips;
  }, [filters, setFilters, brandLabel, bodyTypeLabel, fuelTypeLabel, featureLabel]);

  /** Xoá đúng nhóm chip của panel Bộ lọc — giữ ngữ cảnh tìm kiếm (tỉnh/ngày/loại xe/dịch vụ). */
  function clearFacets() {
    setFilters(Object.fromEntries(FACET_FILTER_KEYS.map((key) => [key, undefined])));
  }

  /** Có đang lọc/tìm gì không — quyết định "rỗng vì bộ lọc" hay "hệ thống chưa có xe". */
  const hasActiveQuery = Boolean(
    appliedChips.length > 0 ||
    filters.provinceCode ||
    filters.province ||
    filters.vehicleType ||
    filters.serviceType ||
    filters.pickupAt,
  );

  // --- Thanh ngữ cảnh tìm kiếm (Figma: "Ô tô · TP. Hồ Chí Minh · 09/08 – 12/08" + Chỉnh sửa) --
  const days =
    filters.pickupAt && filters.returnAt
      ? Math.max(
          1,
          Math.ceil(
            (new Date(filters.returnAt).getTime() - new Date(filters.pickupAt).getTime()) /
              86_400_000,
          ),
        )
      : null;
  const contextSummary = [
    filters.vehicleType
      ? (VEHICLE_TYPE_LABEL[filters.vehicleType as VehicleType] ?? 'Xe')
      : 'Tất cả xe',
    // Dịch vụ vào summary — người đến từ tab trang chủ đọc được ngay mình đang tìm gì.
    filters.serviceType
      ? (SERVICE_TYPE_LABEL[filters.serviceType as ServiceType] ?? null)
      : null,
    // Lộ trình (ngữ cảnh có tài xế) đi kèm ngay sau dịch vụ.
    filters.serviceType === SERVICE_TYPE.WITH_DRIVER && filters.routeType
      ? (ROUTE_TYPE_LABEL[filters.routeType as RouteType] ?? null)
      : null,
    // Địa điểm hiện TÊN tra từ danh sách điểm đến; mã không phải thứ để người dùng đọc. Lựa chọn
    // cũ không còn khả dụng thì nói thẳng, KHÔNG âm thầm hiện "Toàn quốc" trong khi vẫn đang lọc.
    provinceLabelOf(destinations, filters.provinceCode) ??
      (filters.provinceCode || filters.province ? UNAVAILABLE_PROVINCE_LABEL : 'Toàn quốc'),
    filters.pickupAt && filters.returnAt
      ? `${formatDate(filters.pickupAt)} – ${formatDate(filters.returnAt)}${days ? ` (${days} ngày)` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sort = filters.sort ?? DEFAULT_LISTING_SORT;

  return (
    <section className={styles.workspace} aria-labelledby="search-title">
      <h1 id="search-title" className={styles.srOnly}>
        Tìm xe cho thuê
      </h1>

      {/*
       * Thanh ngữ cảnh tìm kiếm (loại xe · dịch vụ · địa điểm · thời gian) là MỘT NÚT — bấm bất
       * kỳ đâu trong vùng đều mở hộp chỉnh sửa, không phải nhắm trúng chữ "Chỉnh sửa". Ô từ khoá
       * đã bỏ (yêu cầu 17/08) — mọi tiêu chí đều có cấu trúc: chip nhanh, hộp chỉnh sửa, panel
       * Bộ lọc.
       *
       * `StickySearchOnly` KHÔNG đổi gì ở thanh này; nó chỉ lấy thanh làm mốc quan sát và bung
       * cụm tìm kiếm thu gọn (giống trang chủ) khi thanh đã cuộn khuất sau header.
       */}
      <StickySearchOnly>
        <div className={styles.searchBar}>
          <button
            type="button"
            className={styles.contextZone}
            onClick={() => setEditOpen(true)}
            aria-label={`Chỉnh sửa tìm kiếm: ${contextSummary}`}
          >
            <span className={styles.contextText}>{contextSummary}</span>
            <span className={styles.contextEdit}>
              <EditOutlined /> Chỉnh sửa
            </span>
          </button>
        </div>
      </StickySearchOnly>

      {/* Hàng đếm + lọc nhanh + Bộ lọc + Sắp xếp (Figma `18:567`). */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.count} aria-live="polite">
            {/* Lỗi trang đầu thì KHÔNG ghi "0 xe khả dụng" — chưa biết có bao nhiêu xe. */}
            {initialError ? '—' : isInitialLoading ? 'Đang tìm xe…' : `${total} xe khả dụng`}
          </span>
          {appliedChips.length > 0 ? (
            <span className={styles.filterCountBadge}>{appliedChips.length} bộ lọc</span>
          ) : null}
        </div>

        <div className={styles.quickChips} role="tablist" aria-label="Loại xe và dịch vụ">
          {VEHICLE_TYPE_VALUES.map((type) => (
            <Chip
              key={type}
              active={filters.vehicleType === type}
              onClick={() => {
                const nextType = filters.vehicleType === type ? undefined : type;
                const allowed = nextType ? vehicleFuelTypesFor(nextType) : null;
                setFilters({
                  vehicleType: nextType,
                  bodyType: nextType === VEHICLE_TYPE.MOTORBIKE ? undefined : filters.bodyType,
                  fuelType: allowed
                    ? filters.fuelType?.filter((fuel) =>
                        allowed.some((allowedFuel) => allowedFuel === fuel),
                      )
                    : filters.fuelType,
                });
              }}
            >
              {VEHICLE_TYPE_LABEL[type]}
            </Chip>
          ))}
          <span className={styles.chipDivider} aria-hidden="true" />
          {/*
            Bộ chọn dịch vụ là LỰA CHỌN ĐỘC QUYỀN tường minh (17/08): "Tất cả" là một lựa
            chọn thật, không phải hành vi ẩn "bấm lại chip đang chọn để bỏ lọc".
          */}
          <Chip
            active={!filters.serviceType}
            onClick={() => setFilters({ serviceType: undefined, routeType: undefined })}
          >
            Tất cả
          </Chip>
          {SERVICE_CHIPS.map((s) => (
            <Chip
              key={s.key}
              active={filters.serviceType === s.key}
              onClick={() =>
                setFilters({
                  serviceType: s.key,
                  // Lộ trình là ngữ cảnh CÓ TÀI XẾ — rời dịch vụ đó thì xoá khỏi URL.
                  routeType: s.key === SERVICE_TYPE.WITH_DRIVER ? filters.routeType : undefined,
                })
              }
            >
              {s.label}
            </Chip>
          ))}
        </div>

        <div className={styles.toolbarRight}>
          <Badge count={appliedChips.length} size="small" offset={[-4, 4]}>
            <Button icon={<FilterOutlined />} onClick={() => setFilterOpen(true)}>
              Bộ lọc
            </Button>
          </Badge>
          <label className={styles.sort}>
            <span className={styles.sortLabel}>Sắp xếp:</span>
            <Select
              value={sort}
              onChange={(value: ListingSort) =>
                setFilters({ sort: value === DEFAULT_LISTING_SORT ? undefined : value })
              }
              options={LISTING_SORT_VALUES.map((value) => ({
                value,
                label: LISTING_SORT_LABEL[value],
              }))}
              variant="borderless"
              popupMatchSelectWidth={false}
              aria-label="Sắp xếp kết quả"
            />
          </label>
        </div>
      </div>

      {/* Chip đang áp dụng — gỡ từng cái hoặc xoá cả nhóm. */}
      {appliedChips.length > 0 ? (
        <div className={styles.appliedRow}>
          {appliedChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={styles.appliedChip}
              onClick={chip.onRemove}
              aria-label={`Bỏ lọc ${chip.label}`}
            >
              {chip.label} <CloseOutlined className={styles.appliedX} />
            </button>
          ))}
          <button type="button" className={styles.clearAll} onClick={clearFacets}>
            Xoá tất cả
          </button>
        </div>
      ) : null}

      {/* --- Thân kết quả: 4 trạng thái loại trừ nhau ------------------------------------- */}
      {initialError ? (
        <div className={styles.stateBox} role="alert">
          <div className={styles.stateIcon}>
            <ReloadOutlined />
          </div>
          <h2 className={styles.stateTitle}>Không tải được danh sách xe</h2>
          <p className={styles.stateDesc}>{getErrorMessage(initialError)}</p>
          {/* Filter trên URL còn nguyên — thử lại chạy đúng truy vấn đang xem. */}
          <Button type="primary" onClick={retryInitial}>
            Thử lại
          </Button>
        </div>
      ) : isInitialLoading ? (
        <div className={styles.grid} aria-busy="true" aria-label="Đang tải kết quả">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        hasActiveQuery ? (
          /* RỖNG VÌ BỘ LỌC (Figma `18:1449`) — giữ nguyên truy vấn, đưa lối thoát. */
          <div className={styles.stateBox}>
            <div className={styles.stateIcon} aria-hidden>
              <FilterOutlined />
            </div>
            <h2 className={styles.stateTitle}>Không tìm thấy xe phù hợp</h2>
            <p className={styles.stateDesc}>
              Không có xe nào khớp với bộ lọc hiện tại của bạn. Thử thay đổi tiêu chí, nới lỏng bộ
              lọc hoặc cập nhật lịch trình đi chuyến khác.
            </p>
            <Button type="primary" onClick={clearFacets}>
              Xoá bộ lọc
            </Button>
            <button type="button" className={styles.stateLink} onClick={() => setEditOpen(true)}>
              Thay đổi thời gian hoặc địa điểm
            </button>
          </div>
        ) : (
          /* HỆ THỐNG CHƯA CÓ XE — không đổ lỗi cho bộ lọc vì không có bộ lọc nào đang bật. */
          <div className={styles.stateBox}>
            <div className={styles.stateIcon} aria-hidden>
              <FilterOutlined />
            </div>
            <h2 className={styles.stateTitle}>Chưa có xe nào được đăng cho thuê</h2>
            <p className={styles.stateDesc}>
              Các gian hàng chưa đăng xe công khai. Vui lòng quay lại sau — xe mới xuất hiện ngay
              khi được duyệt.
            </p>
          </div>
        )
      ) : (
        <>
          <ul className={styles.grid}>
            {listings.map((listing) => (
              <li key={listing.id} className={styles.cell}>
                <VehicleCard listing={listing} />
              </li>
            ))}
            {/* Đang nạp trang kế: giữ nguyên thẻ cũ, nối khung chờ vào đáy lưới. */}
            {isFetchingNextPage
              ? Array.from({ length: 4 }, (_, i) => (
                  <li key={`sk-${i}`} className={styles.cell}>
                    <CardSkeleton />
                  </li>
                ))
              : null}
          </ul>

          {/* Vùng đáy: sentinel + fallback bấm tay + lỗi trang kế + hết kết quả. */}
          <div className={styles.footerZone}>
            <div ref={sentinelRef} className={styles.sentinel} aria-hidden />
            <span className={styles.srOnly} aria-live="polite">
              {isFetchingNextPage ? 'Đang tải thêm xe' : ''}
            </span>

            {appendError ? (
              <div className={styles.appendError} role="alert">
                <span>Không tải được trang tiếp theo. {getErrorMessage(appendError)}</span>
                <Button size="small" onClick={retryNextPage}>
                  Thử lại
                </Button>
              </div>
            ) : hasNextPage ? (
              /* Fallback tường minh cho bàn phím/screen reader — sentinel chỉ là đường tắt. */
              <Button loading={isFetchingNextPage} onClick={fetchNextPage}>
                Tải thêm xe
              </Button>
            ) : listings.length > SKELETON_COUNT ? (
              <p className={styles.endNote}>Đã hiển thị tất cả {total} xe</p>
            ) : null}
          </div>
        </>
      )}

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} />
      {editOpen ? (
        <SearchDialog
          open
          initial={filters}
          onClose={() => setEditOpen(false)}
          onSubmit={(values) => {
            setEditOpen(false);
            // Ghi đè NGỮ CẢNH thuê; facet Bộ lọc giữ nguyên.
            setFilters({
              vehicleType: values.vehicleType,
              provinceCode: values.provinceCode,
              // Xoá tham số tên cũ khỏi URL khi người dùng vừa chọn lại địa điểm — từ đây URL
              // chỉ còn mang mã.
              province: undefined,
              pickupAt: values.pickupAt,
              returnAt: values.returnAt,
              hourly: values.hourly,
              routeType: values.routeType,
            });
          }}
        />
      ) : null}
    </section>
  );
}

/** Khung chờ đúng hình học thẻ thật (ảnh 16/10 + 3 dòng) — dữ liệu về không giật layout. */
function CardSkeleton() {
  return (
    <div className={styles.skeletonCard} aria-hidden>
      <div className={styles.skeletonMedia}>
        <Skeleton.Image active className={styles.skeletonImg} />
      </div>
      <Skeleton active paragraph={{ rows: 2 }} title={{ width: '70%' }} />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cx(styles.chip, active && styles.chipActive)}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
