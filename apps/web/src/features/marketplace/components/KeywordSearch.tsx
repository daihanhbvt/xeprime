'use client';

import { EnterOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { AutoComplete, type AutoCompleteProps, type GetRef } from 'antd';
import {
  LIST_SEPARATOR,
  SEARCH_QUERY_MAX_LENGTH,
  highlightSearchMatch,
  searchTokens,
} from '@xeprime/domain';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from 'react';
import { VerifiedMark } from '@/components/common/VerifiedMark';
import { shopPath } from '@/constants/routes';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useShopSuggestions } from '../hooks/use-shop-suggestions';
import type { PublicShopSummary } from '../types';
import styles from './KeywordSearch.module.css';

/** Nhịp gõ → URL: đủ dài để không bắn một truy vấn mỗi phím, đủ ngắn để kết quả chạy "theo tay". */
const APPLY_DELAY_MS = 400;
/** Gợi ý nhanh hơn lưới — nó rẻ (≤ 5 dòng) và là phản hồi đầu tiên khách nhìn thấy. */
const SUGGEST_DELAY_MS = 200;

/** Tiền tố giá trị option — tách hẳn khỏi chữ khách gõ, để chọn gợi ý không bao giờ thành từ khoá. */
const HOST_OPTION_PREFIX = 'host:';

interface KeywordSearchProps {
  /** Từ khoá ĐANG ÁP DỤNG (đọc từ URL). */
  value: string | undefined;
  /** Ghi từ khoá lên URL; `undefined` = bỏ từ khoá. */
  onApply: (q: string | undefined) => void;
  className?: string;
}

/** Chuỗi gõ → giá trị lên URL: cắt khoảng trắng hai đầu, cắt trần độ dài, rỗng ⇒ bỏ. */
function toAppliedKeyword(raw: string): string | undefined {
  return raw.trim().slice(0, SEARCH_QUERY_MAX_LENGTH) || undefined;
}

/**
 * Ô từ khoá của `/search` — tìm theo tên xe / hãng / model hoặc tên chủ xe, gian hàng.
 *
 * ## Hai thứ xảy ra khi gõ, ở hai nhịp
 *
 *   - **Lưới kết quả lọc theo** sau {@link APPLY_DELAY_MS} (ghi `q` lên URL — ADR 0004, link chia
 *     sẻ được, F5 không mất). Enter áp ngay không chờ; xoá trắng ô cũng áp ngay.
 *   - **Danh sách thả xuống gợi ý CHỦ XE / GIAN HÀNG** khớp tên — chọn là sang thẳng trang của
 *     họ. Chỉ hiện khi CÓ người khớp: không có thì lưới bên dưới đã là câu trả lời.
 *
 * Luật khớp (không dấu, khớp đầu từ, viết liền "saigon" vẫn ra "Sài Gòn") nằm ở server; phần tô
 * đậm trong gợi ý dùng CÙNG luật (`highlightSearchMatch`), nên khách thấy đúng lý do một tên hiện
 * ra.
 *
 * ## URL ↔ ô nhập
 *
 * URL đổi từ nơi khác (back/forward, nút "Xoá từ khoá" ở trạng thái rỗng) thì ô nhập theo URL —
 * NHƯNG chỉ khi khách không đang gõ: lúc đang gõ, ô nhập là nguồn sự thật, và một URL tới trễ
 * của nhịp gõ trước không được phép đè lên chữ vừa gõ.
 */
export function KeywordSearch({ value, onApply, className }: KeywordSearchProps) {
  const t = useTranslations('Marketplace.results.keyword');
  const router = useRouter();
  const inputRef = useRef<GetRef<typeof AutoComplete>>(null);

  const appliedQ = value ?? '';
  const [text, setText] = useState(appliedQ);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  /** Option đang được trỏ (bàn phím/chuột) — Enter lúc đó là CHỌN gợi ý, không phải áp từ khoá. */
  const [activeOption, setActiveOption] = useState<string | null>(null);

  // URL → ô nhập, đồng bộ ngay trong render (derived state — không setState trong effect).
  const [syncedQ, setSyncedQ] = useState(appliedQ);
  if (appliedQ !== syncedQ) {
    setSyncedQ(appliedQ);
    if (!focused) setText(appliedQ);
  }

  /*
   * Giá trị đã GỬI lên URL gần nhất. Enter áp ngay rồi thu bàn phím ⇒ blur cũng áp, rồi nhịp gõ
   * tới hạn cũng áp — ba lần cho cùng một chữ trong khi URL chưa kịp đổi. So với `value` thôi
   * thì cả ba đều thấy "khác URL" và cùng ghi. Theo `value` mỗi khi URL đổi (kể cả từ nơi khác).
   */
  const lastSentRef = useRef(value);
  useEffect(() => {
    lastSentRef.current = value;
  }, [value]);
  /*
   * Đã chọn một chủ xe ⇒ đang rời trang. Nhịp gõ còn treo hoặc blur lúc gỡ ô nhập vẫn sẽ gọi áp
   * từ khoá — và lần ghi URL đó (đồng bộ) tới SAU lượt điều hướng, kéo khách ngược về /search.
   */
  const leavingRef = useRef(false);

  const applyIfChanged = (raw: string) => {
    if (leavingRef.current) return;
    const next = toAppliedKeyword(raw);
    if (next === lastSentRef.current) return;
    lastSentRef.current = next;
    onApply(next);
  };

  // Nhịp gõ → URL. Effect event đọc `onApply` MỚI NHẤT: nó dựng URL từ searchParams hiện tại,
  // nên một bản cũ bắt trong closure sẽ xoá mất chip khách vừa bấm trong lúc chờ nhịp gõ.
  const debouncedText = useDebouncedValue(text, APPLY_DELAY_MS);
  const onDebouncedText = useEffectEvent((raw: string) => applyIfChanged(raw));
  useEffect(() => {
    onDebouncedText(debouncedText);
  }, [debouncedText]);

  const tokens = searchTokens(text);
  const suggestKeyword = useDebouncedValue(text, SUGGEST_DELAY_MS);
  // Chỉ hỏi khi ô đang được dùng — mở trang với `?q=` sẵn có thì chưa ai cần danh sách thả xuống.
  const { data: suggestions } = useShopSuggestions(suggestKeyword, { enabled: focused });
  // Ô đã xoá trắng thì không giữ gợi ý cũ (`keepPreviousData` của hook là cho lúc ĐANG gõ).
  const hosts = tokens.length > 0 ? (suggestions ?? []) : [];

  const options: AutoCompleteProps['options'] =
    hosts.length > 0
      ? [
          {
            label: <span className={styles.groupTitle}>{t('hostsGroup')}</span>,
            title: t('hostsGroup'),
            options: hosts.map((host) => ({
              value: `${HOST_OPTION_PREFIX}${host.slug}`,
              label: <HostSuggestion host={host} tokens={tokens} />,
            })),
          },
        ]
      : [];

  function handleType(next: string) {
    setText(next);
    setOpen(true);
    // Xoá trắng = bỏ lọc NGAY: chờ nhịp gõ ở đây chỉ để khách nhìn lưới rỗng thêm nửa giây.
    if (!next.trim()) applyIfChanged('');
  }

  function applyNow() {
    applyIfChanged(text);
    setOpen(false);
    // Thu bàn phím ảo trên di động để lưới kết quả hiện ra; trên desktop thì vô hại.
    inputRef.current?.blur();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !(open && hosts.length > 0 && activeOption)) {
      event.preventDefault();
      applyNow();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  function handleSelect(selected: string) {
    if (!selected.startsWith(HOST_OPTION_PREFIX)) return;
    leavingRef.current = true;
    setOpen(false);
    router.push(shopPath.detail(selected.slice(HOST_OPTION_PREFIX.length)));
  }

  return (
    <AutoComplete
      ref={inputRef}
      className={cx(styles.root, className)}
      classNames={{ input: styles.input, popup: { root: styles.popup } }}
      value={text}
      options={options}
      open={open && hosts.length > 0}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setActiveOption(null);
      }}
      onSearch={handleType}
      onClear={() => handleType('')}
      onSelect={handleSelect}
      onActive={(active: string | null) => setActiveOption(active)}
      onInputKeyDown={handleKeyDown}
      onFocus={() => {
        setFocused(true);
        if (tokens.length > 0) setOpen(true);
      }}
      onBlur={() => {
        setFocused(false);
        // Rời ô = chốt chữ đang có, không bắt khách chờ nhịp gõ khi đã bấm sang chỗ khác.
        applyIfChanged(text);
      }}
      defaultActiveFirstOption={false}
      // Tối đa SHOP_SUGGESTION_LIMIT dòng — danh sách ảo chỉ thêm một lớp đo đạc vô ích.
      virtual={false}
      prefix={<SearchOutlined className={styles.icon} aria-hidden />}
      placeholder={t('placeholder')}
      aria-label={t('ariaLabel')}
      maxLength={SEARCH_QUERY_MAX_LENGTH}
      variant="borderless"
      allowClear
      popupRender={(menu) => (
        <div>
          {menu}
          <button
            type="button"
            className={styles.searchAll}
            // `mousedown` thay vì `click`: click tới SAU blur, và blur đã đóng danh sách.
            onMouseDown={(event) => {
              event.preventDefault();
              applyNow();
            }}
          >
            <SearchOutlined aria-hidden />
            <span className={styles.searchAllText}>{t('searchAll', { q: text.trim() })}</span>
            <EnterOutlined className={styles.enterHint} aria-hidden />
          </button>
        </div>
      )}
    />
  );
}

/** Một dòng gợi ý: ảnh/chữ cái đầu · tên (tô phần khớp) + dấu xác thực · nhãn · số xe · tỉnh. */
function HostSuggestion({ host, tokens }: { host: PublicShopSummary; tokens: string[] }) {
  const t = useTranslations('Marketplace.results.keyword');
  const meta = [
    t(host.verified ? 'shop' : 'owner'),
    t('vehicleCount', { count: host.vehicleCount }),
    host.provinceName,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return (
    <span className={styles.host}>
      <span className={cx(styles.avatar, host.verified && styles.avatarShop)} aria-hidden>
        {host.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh từ storage ngoài, chưa qua next/image
          <img src={host.logoUrl} alt="" loading="lazy" />
        ) : (
          initialOf(host.name)
        )}
      </span>
      <span className={styles.hostBody}>
        <span className={styles.hostNameRow}>
          <span className={styles.hostName}>
            {highlightSearchMatch(host.name, tokens).map((part, index) =>
              part.match ? (
                <mark key={index} className={styles.mark}>
                  {part.text}
                </mark>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </span>
          {host.verified ? <VerifiedMark label={t('verified')} size={13} /> : null}
        </span>
        <span className={styles.hostMeta}>{meta}</span>
      </span>
      <RightOutlined className={styles.chevron} aria-hidden />
    </span>
  );
}
