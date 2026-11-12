'use client';

import { CarOutlined, HolderOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { RENTAL_STAGE, isRentalStage, type RentalStage } from '@/constants/rental-stages';
import type { BookingRequestItem } from '@/features/booking-requests/types';
import { usePrefersReducedMotion } from '@/hooks/use-media-query';
import { useScrollingFlag } from '@/hooks/use-scrolling-flag';
import { cx } from '@/lib/cx';
import { boardDropVerdict, type BoardDropVerdict } from '../../rentals-board-rules';
import type { BookingListItem } from '../../types';
import { RentalStageHeading } from '../RentalStageHeading';
import styles from './RentalsBoard.module.css';

export type BoardItem = BookingRequestItem | BookingListItem;

/** Một cột đã chuẩn hoá — cùng hình cho hai cột YÊU CẦU và hai cột ĐƠN. */
export interface BoardColumn {
  stage: RentalStage;
  items: readonly BoardItem[];
  count: number | undefined;
  /** Lần tải đầu, chưa có dữ liệu nào. */
  loading: boolean;
  error: boolean;
  /** Đang hiện dữ liệu CŨ trong lúc tải bộ lọc mới — mờ đi; làm mới nền thì không. */
  stale: boolean;
  hasNext: boolean;
  loadingMore: boolean;
  loadMoreError: boolean;
  loadMore: () => void;
  refetch: () => void;
}

interface ActiveCard {
  stage: RentalStage;
  item: BoardItem;
}

interface Props {
  columns: readonly BoardColumn[];
  /** Thẻ của một chuyến ở dạng `board` — `dragHandle` vắng khi thẻ không kéo được. */
  renderCard: (stage: RentalStage, item: BoardItem, dragHandle: ReactNode | undefined) => ReactNode;
  /** Thẻ này có kéo được sang bước kế không (quyền + trạng thái) — vắng tay nắm khi không. */
  canDrag: (stage: RentalStage, item: BoardItem) => boolean;
  /** Chỉ gọi với lượt thả `allowed` — mở ĐÚNG chỗ nút trên thẻ mở, không đổi trạng thái. */
  onDrop: (from: RentalStage, to: RentalStage, item: BoardItem) => void;
  /** Bật/tắt làm mới nền của nơi gọi trong lúc đang cầm thẻ. */
  onDraggingChange: (dragging: boolean) => void;
  filtered: boolean;
  onClearFilters: () => void;
}

const cardKey = (stage: RentalStage, item: BoardItem) => `${stage}:${item.id}`;

/** Chuột ưu tiên; bàn phím (không có con trỏ) rơi về phép giao hình chữ nhật của thẻ đang cầm. */
const collision: CollisionDetection = (args) => {
  const byPointer = pointerWithin(args);
  return byPointer.length > 0 ? byPointer : rectIntersection(args);
};

/**
 * Bàn phím: mũi tên trái/phải nhảy THẲNG sang tâm cột kế bên (mặc định của dnd-kit dịch 25px một
 * lần — đi qua bốn cột rộng 320px là ~50 lần bấm). Lên/xuống không làm gì: thứ tự trong cột do server.
 */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { context, currentCoordinates },
) => {
  const step = event.code === 'ArrowRight' ? 1 : event.code === 'ArrowLeft' ? -1 : 0;
  if (step === 0) return undefined;
  event.preventDefault();
  const { collisionRect, droppableRects } = context;
  if (!collisionRect) return undefined;
  const centerX = collisionRect.left + collisionRect.width / 2;
  const rects = [...droppableRects.values()].sort((a, b) => a.left - b.left);
  const target =
    step > 0
      ? rects.find((rect) => rect.left > centerX)
      : [...rects].reverse().find((rect) => rect.left + rect.width < centerX);
  if (!target) return currentCoordinates;
  return {
    x: currentCoordinates.x + (target.left + target.width / 2 - centerX),
    y: currentCoordinates.y,
  };
};

/**
 * Bảng KANBAN của màn "Đơn thuê xe" (Figma Partner-XePrime "Rental Request - Kanban" `23895:15181`,
 * 05/11/2026) — bốn cột theo chặng, mỗi cột cuộn tới đâu tải trang kế tới đó (server-side).
 *
 * Kéo thả là LỐI TẮT của nút trên thẻ, không phải một đường đổi trạng thái thứ hai (sổ cái §3.2b):
 * thả vào bước kế chỉ MỞ đúng chỗ nút mở — hộp Phê duyệt (Cần xử lý → Chờ khách thanh toán), trang
 * chi tiết để giao xe (Chờ giao xe → Đang thuê). Thẻ nằm nguyên cột cũ cho tới khi server xác nhận;
 * bấm Huỷ trong hộp là thẻ vẫn ở đó. "Chờ khách thanh toán" → "Chờ giao xe" bị khoá: đơn chỉ ra đời
 * khi đối soát xác nhận đủ tiền (ADR 0044 điều 2). Thứ tự trong cột do server quyết — không sắp xếp
 * tay, không lưu vị trí.
 */
export function RentalsBoard({
  columns,
  renderCard,
  canDrag,
  onDrop,
  onDraggingChange,
  filtered,
  onClearFilters,
}: Props) {
  const t = useTranslations('Bookings.board.kanban');
  const tBoard = useTranslations('Bookings.board');
  const tBookings = useTranslations('Bookings');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState<ActiveCard | null>(null);

  const sensors = useSensors(
    // Kéo từ TAY NẮM, vượt 6px mới tính là kéo — bấm tay nắm không mở nhầm gì.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const stageName = (stage: unknown) => (isRentalStage(stage) ? tBoard(`stage.${stage}`) : '');
  const itemName = (data: unknown) => (data as ActiveCard | undefined)?.item.vehicleName ?? '';

  const announcements: Announcements = {
    onDragStart: ({ active: dragged }) =>
      t('dnd.pickedUp', {
        item: itemName(dragged.data.current),
        from: stageName((dragged.data.current as ActiveCard | undefined)?.stage),
      }),
    onDragOver: ({ active: dragged, over }) =>
      over
        ? t('dnd.over', { item: itemName(dragged.data.current), to: stageName(over.id) })
        : t('dnd.overNone', { item: itemName(dragged.data.current) }),
    onDragEnd: ({ active: dragged, over }) =>
      over
        ? t('dnd.dropped', { item: itemName(dragged.data.current), to: stageName(over.id) })
        : t('dnd.droppedNone', { item: itemName(dragged.data.current) }),
    onDragCancel: ({ active: dragged }) =>
      t('dnd.cancelled', { item: itemName(dragged.data.current) }),
  };

  function finish() {
    setActive(null);
    onDraggingChange(false);
  }

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ActiveCard | undefined;
    if (!data) return;
    setActive(data);
    onDraggingChange(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const data = event.active.data.current as ActiveCard | undefined;
    const to = event.over?.id;
    finish();
    if (!data || !isRentalStage(to)) return;
    const verdict = boardDropVerdict(data.stage, to);
    if (verdict === 'allowed') onDrop(data.stage, to, data.item);
    else if (verdict === 'locked') message.info(t('dropped.locked'));
    else if (verdict === 'not_next') message.info(t('dropped.notNext'));
  }

  const loaded = columns.every((column) => !column.loading);
  if (columns.length > 0 && columns.every((column) => column.loading)) {
    return <LoadingState variant="cards" rows={3} label={tBoard('title')} />;
  }
  if (columns.length > 0 && columns.every((column) => column.error)) {
    return (
      <EmptyState
        variant="error"
        title={tBookings('list.errorTitle')}
        description={tCommon('states.errorHint')}
        onRetry={() => columns.forEach((column) => column.refetch())}
      />
    );
  }
  if (filtered && loaded && columns.every((column) => !column.error && column.items.length === 0)) {
    return (
      <EmptyState
        variant="no-results"
        title={tBookings('list.emptyFilteredTitle')}
        description={tBookings('list.emptyFilteredBody')}
        action={<Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={finish}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('dnd.instructions') },
      }}
    >
      <div className={styles.board} role="region" aria-label={t('label')}>
        {columns.map((column) => (
          <BoardColumnView
            key={column.stage}
            column={column}
            active={active}
            renderCard={renderCard}
            canDrag={canDrag}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {active ? <DragPreview card={active} /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumnView({
  column,
  active,
  renderCard,
  canDrag,
}: {
  column: BoardColumn;
  active: ActiveCard | null;
  renderCard: Props['renderCard'];
  canDrag: Props['canDrag'];
}) {
  const t = useTranslations('Bookings.board.kanban');
  const tBoard = useTranslations('Bookings.board');
  const { setNodeRef, isOver } = useDroppable({ id: column.stage });
  const scrollRef = useRef<HTMLDivElement>(null);
  useScrollingFlag(scrollRef);
  const verdict = active ? boardDropVerdict(active.stage, column.stage) : null;
  const headingId = `rentals-board-${column.stage}`;

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cx(
        styles.column,
        verdict === 'allowed' && styles.dropAllowed,
        verdict === 'locked' && styles.dropLocked,
        verdict === 'not_next' && styles.dropNotNext,
        isOver && verdict !== 'same' && styles.over,
      )}
    >
      <RentalStageHeading id={headingId} stage={column.stage} count={column.count} />
      <DropHint stage={column.stage} verdict={verdict} isOver={isOver} />
      <div ref={scrollRef} className={styles.columnBody}>
        {column.loading ? (
          <LoadingState variant="cards" rows={2} label={tBoard(`stage.${column.stage}`)} />
        ) : column.error ? (
          <div className={styles.columnNote} role="alert">
            <p>{t('columnError')}</p>
            <Button size="small" onClick={column.refetch}>
              {t('retry')}
            </Button>
          </div>
        ) : column.items.length === 0 ? (
          <p className={styles.columnEmpty}>{tBoard(`stageEmpty.${column.stage}.title`)}</p>
        ) : (
          <ul
            className={column.stale ? styles.cardsBusy : styles.cards}
            aria-busy={column.stale || undefined}
          >
            {column.items.map((item) => (
              <BoardCard
                key={cardKey(column.stage, item)}
                stage={column.stage}
                item={item}
                draggable={canDrag(column.stage, item)}
                renderCard={renderCard}
              />
            ))}
          </ul>
        )}
        {column.items.length > 0 ? <LoadMore column={column} rootRef={scrollRef} /> : null}
      </div>
    </section>
  );
}

/** Câu trong khung nét đứt đầu cột khi đang cầm thẻ — nói trước điều sẽ xảy ra nếu thả vào đây. */
function DropHint({
  stage,
  verdict,
  isOver,
}: {
  stage: RentalStage;
  verdict: BoardDropVerdict | null;
  isOver: boolean;
}) {
  const t = useTranslations('Bookings.board.kanban');
  if (verdict === 'allowed') {
    return (
      <p className={styles.hintAllowed}>
        {stage === RENTAL_STAGE.AWAITING_PAYMENT ? t('drop.approve') : t('drop.pickup')}
      </p>
    );
  }
  if (verdict === 'locked') return <p className={styles.hintLocked}>{t('drop.locked')}</p>;
  if (verdict === 'not_next' && isOver) {
    return <p className={styles.hintLocked}>{t('drop.notNext')}</p>;
  }
  return null;
}

function BoardCard({
  stage,
  item,
  draggable,
  renderCard,
}: {
  stage: RentalStage;
  item: BoardItem;
  draggable: boolean;
  renderCard: Props['renderCard'];
}) {
  const t = useTranslations('Bookings.board.kanban');
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: cardKey(stage, item),
    data: { stage, item } satisfies ActiveCard,
    disabled: !draggable,
  });
  const handle = draggable ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.handle}
      {...attributes}
      {...listeners}
      aria-label={t('handle', { vehicle: item.vehicleName })}
    >
      <HolderOutlined aria-hidden="true" />
    </button>
  ) : undefined;
  return (
    <li ref={setNodeRef} className={isDragging ? styles.cardDragging : undefined}>
      {renderCard(stage, item, handle)}
    </li>
  );
}

/**
 * Cuối cột: tải trang kế khi mép dưới cột vào gần khung nhìn (`IntersectionObserver`, cùng cách với
 * danh sách hội thoại) — lỗi thì nút thử lại, không tự dội request.
 */
function LoadMore({
  column,
  rootRef,
}: {
  column: BoardColumn;
  rootRef: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('Bookings.board.kanban');
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { hasNext, loadingMore, loadMoreError, loadMore } = column;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNext || loadingMore || loadMoreError) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      },
      { root: rootRef.current, rootMargin: '240px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNext, loadingMore, loadMoreError, loadMore, rootRef]);

  if (!hasNext) return null;
  return (
    <div ref={sentinelRef} className={styles.loadMore}>
      {loadMoreError ? (
        <>
          <span>{t('loadMoreError')}</span>
          <Button size="small" onClick={loadMore}>
            {t('retry')}
          </Button>
        </>
      ) : loadingMore ? (
        <span role="status">{t('loadingMore')}</span>
      ) : (
        <Button size="small" type="text" onClick={loadMore}>
          {t('loadMore')}
        </Button>
      )}
    </div>
  );
}

/** Bóng thẻ đang cầm — gọn (xe · khách), không lặp lại cả thẻ với link và nút bên trong. */
function DragPreview({ card }: { card: ActiveCard }) {
  const tBoard = useTranslations('Bookings.board');
  const { item, stage } = card;
  return (
    <div className={styles.preview}>
      <span className={styles.previewThumb}>
        {item.vehicleImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.vehicleImageUrl} alt="" />
        ) : (
          <CarOutlined aria-hidden="true" />
        )}
      </span>
      <span className={styles.previewText}>
        <strong>{item.vehicleName}</strong>
        <span>{item.customerName}</span>
        <span className={styles.previewStage}>{tBoard(`stage.${stage}`)}</span>
      </span>
    </div>
  );
}
