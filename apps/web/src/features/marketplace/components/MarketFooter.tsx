'use client';

import { useCallback } from 'react';
import {
  ArrowRightOutlined,
  ArrowUpOutlined,
  FacebookFilled,
  InstagramOutlined,
  TikTokOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { ROUTES } from '@/constants/routes';
import { resolveWorkspaceHref } from '@/features/auth/post-auth-destination';
import { AppStoreQr } from '@/features/content-page/components/AppStoreQr';
import { useCurrentUser } from '@/hooks/use-current-user';
import { isActivePath } from '@/lib/active-path';
import { cx } from '@/lib/cx';
import { FOOTER_COLUMNS, FOOTER_SERVICE_LINKS } from '../constants';
import styles from './MarketFooter.module.css';

/** Tên mạng xã hội là DANH TỪ RIÊNG — không dịch, và cũng không cần khoá message. */
const SOCIALS = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookFilled },
  { key: 'instagram', label: 'Instagram', Icon: InstagramOutlined },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokOutlined },
] as const satisfies ReadonlyArray<{ key: SocialKey; label: string; Icon: typeof FacebookFilled }>;

/** Khoá phải khớp lớp nền thương hiệu ở `MarketFooter.module.css` (`.socialFacebook`…). */
type SocialKey = 'facebook' | 'instagram' | 'tiktok';

/**
 * Lớp nền riêng của từng mạng — màu nhận diện của HỌ, không phải token XePrime.
 *
 * Đây là ngoại lệ có chủ đích với quy tắc "màu lấy từ token": #1877F2 là màu của Facebook,
 * không phải một bậc trong bảng màu XePrime, và đưa nó vào `tokens.css` là nói dối về nguồn
 * gốc của nó. Cùng lý do với việc `AUTH_PROVIDER_LABEL` giữ nguyên chữ "Google".
 */
const SOCIAL_CLASS: Record<SocialKey, string | undefined> = {
  facebook: styles.socialFacebook,
  instagram: styles.socialInstagram,
  tiktok: styles.socialTiktok,
};

/**
 * Năm bản quyền lấy khi render — hằng `2026` viết cứng sẽ sai ngay 01/01 năm sau.
 * Truyền dạng CHUỖI: ICU sẽ định dạng số có phân tách nhóm và biến 2026 thành "2.026".
 */
const COPYRIGHT_YEAR = String(new Date().getFullYear());

/**
 * Chân trang marketplace — MỘT dải, lưới bất đối xứng ba vùng.
 *
 * ── Vì sao bố cục này ───────────────────────────────────────────────────────
 *
 * Bản trước là bốn dải xếp chồng (CTA · thương hiệu+cột · thẻ ứng dụng · chân) cao gần 800px,
 * và mỗi dải có nền riêng nên chúng đọc thành bốn section rời chứ không phải một chân trang.
 * Bản này gộp ba dải đầu vào MỘT lưới:
 *
 *     ┌─────────────── dải CTA gọn (~96px) ───────────────┐
 *     ├──────────────┬──────────────────────┬─────────────┤
 *     │  THƯƠNG HIỆU │  3 CỘT ĐIỀU HƯỚNG    │ ỨNG DỤNG    │
 *     │  logo        │  Chủ xe · Khám phá   │ 2 QR nhỏ    │
 *     │  tagline     │  · Pháp lý           │ (không nhãn) │
 *     │  ● ● ●       │                      │             │
 *     ├──────────────┴──────────────────────┴─────────────┤
 *     │ © · quốc gia      Trợ giúp · [VI] · Lên đầu trang │
 *     └───────────────────────────────────────────────────┘
 *
 * Ba quyết định đáng ghi lại:
 *
 *  1. **CTA dùng chung nền với chân trang**, chỉ khác ở quầng sáng vàng và một đường chỉ dưới.
 *     Bản trước tô nó bằng bề mặt nổi nên nó nhìn như một banner ghép vào — đúng thứ cần bỏ.
 *  2. **Vùng ứng dụng không còn là một cái hộp**: nó được ngăn bằng MỘT đường kẻ dọc mảnh, cùng
 *     thủ pháp với cột thứ ba của một trang báo. Từ 23/09/2026 nó KHÔNG còn nhãn trạng thái
 *     nào — chỗ nói app đang phát triển là trang `/app`, nơi có đủ chỗ nói cho tử tế.
 *  3. **Ba cột thay vì bốn** — lý do ở docblock `FOOTER_COLUMNS`.
 *
 * ── Cá tính ─────────────────────────────────────────────────────────────────
 *
 * Trang công khai mở bằng một hero nền tối ấm có quầng vàng; chân trang là đầu kia của cặp đó.
 * Bốn chi tiết ký tên, tất cả dựng từ token có sẵn: tiêu đề CTA dùng `--xp-font-family-display`
 * (Playfair — bộ chữ đã có trong hệ thống mà gần như chưa nơi nào dùng), quầng vàng radial ở
 * mép trên, vạch vàng 18px đội trên mỗi tiêu đề cột, và gạch vàng mọc ra khi rê chuột vào một
 * liên kết.
 *
 * ── Ghi chú kỹ thuật ────────────────────────────────────────────────────────
 *
 * `'use client'` là bắt buộc: `@ant-design/icons`, `QRCode` và `LocaleSwitcher` đều gọi
 * `React.createContext` nội bộ. Nội dung vẫn render sẵn ra HTML ở server nên mười liên kết vẫn
 * nằm trong HTML tĩnh cho bot đọc.
 *
 * Mũi tên gập/mở của accordion KHÔNG dùng `@ant-design/icons`: AntD tiêm `.anticon { ... }` vào
 * `<head>` LÚC CHẠY, tức sau file CSS Module, và hai selector cùng độ ưu tiên (0,1,0) nên bản
 * của AntD thắng — `display: none` của ta bị lơ và mũi tên vẫn hiện ở desktop. Vẽ bằng CSS
 * (`.caret`) là hết chuyện.
 *
 * **Mọi liên kết trỏ tới một trang CÓ THẬT.** Mạng xã hội chưa có đích thật nên cố ý KHÔNG
 * phải phần tử bấm được (không `<a>`, không con trỏ bàn tay) và có một câu ngay dưới nói rõ.
 */
export function MarketFooter() {
  const t = useTranslations('Marketplace.footer');
  const tService = useTranslations('HomeSearch.service');
  const { data: user } = useCurrentUser();
  const pathname = usePathname();
  const exploreTitle = t('columns.explore.title');

  /*
   * Mục ĐANG XEM được đánh dấu bằng chữ vàng + nét đậm hơn, cộng `aria-current="page"` cho
   * trình đọc màn hình. Cố ý KHÔNG mượn gạch vàng của trạng thái rê chuột: hai trạng thái khác
   * nhau mà trông giống hệt nhau thì không còn là dấu hiệu nữa.
   *
   * Vì sao ba mục dịch vụ (`/search?serviceType=…`) không bao giờ sáng: xem `isActivePath`.
   */
  const active = (href: string) => isActivePath(pathname, href);

  /*
   * Lời mời "Đăng xe cho thuê" chỉ dành cho người CHƯA cho thuê xe.
   *
   * `resolveWorkspaceHref` khác `null` đúng khi người này đã có khu làm việc — gian hàng trả
   * phí, nhân viên gian hàng, hay chủ xe tuyến hoa hồng (`resolveWorkspaceTarget` trả `null`
   * khi và chỉ khi không có tenant). Mời họ "đăng xe cho thuê" là mời một việc họ làm xong rồi,
   * và nút đó dẫn tới landing giới thiệu chứ không phải chỗ họ cần.
   *
   * Dùng hàm dùng chung thay vì tự so `user?.tenant != null`: cùng một câu hỏi đã có một nơi
   * trả lời (xem docblock `resolveWorkspaceHref`), và tự so sẽ trôi khỏi nó ngay lần ADR sau.
   *
   * Lúc render ở server `user` còn `undefined` nên dải CTA NẰM TRONG HTML tĩnh — đúng ý: bot và
   * khách vãng lai phải thấy nó. Người đã là chủ xe mất nó sau khi `/auth/me` trả lời.
   */
  const isHost = resolveWorkspaceHref(user ?? null) != null;

  /*
   * Cuộn mượt, TRỪ KHI người dùng đã tắt hiệu ứng chuyển động ở hệ điều hành. `globals.css` đã
   * vô hiệu hoá `transition`/`animation` cho nhóm này, nhưng `scrollTo({behavior:'smooth'})` là
   * API JavaScript nên CSS không với tới — phải hỏi lại `matchMedia` ở đây.
   */
  const scrollToTop = useCallback(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, []);

  return (
    <footer className={styles.footer}>
      {/* ─── Dải mời đăng xe — gọn, cùng nền với chân trang ─────────────── */}
      {!isHost && (
        <section className={styles.cta} aria-labelledby="xp-footer-cta">
          <div className={styles.ctaInner}>
            <div className={styles.ctaCopy}>
              <p className={styles.eyebrow}>{t('cta.eyebrow')}</p>
              <h2 id="xp-footer-cta" className={styles.ctaTitle}>
                {t('cta.title')}
              </h2>
            </div>
            <p className={styles.ctaBody}>{t('cta.body')}</p>
            <Link href={ROUTES.LIST_YOUR_VEHICLE.ROOT} className={styles.ctaAction}>
              <span>{t('cta.action')}</span>
              <ArrowRightOutlined className={styles.ctaArrow} aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      {/* ─── Lưới ba vùng ───────────────────────────────────────────────── */}
      <div className={styles.grid}>
        <div className={styles.brandZone}>
          <Logo size="md" />
          <p className={styles.tagline}>{t('tagline')}</p>

          {/*
            KHÔNG phải liên kết: XePrime chưa công bố kênh chính thức nào. Đây là `<span>` không
            bắt sự kiện, không con trỏ bàn tay, và có một câu ngay dưới nói rõ — thay vì ba vòng
            tròn trông bấm được mà bấm không đi đâu.
          */}
          <div className={styles.socials} role="group" aria-label={t('socialsLabel')}>
            {SOCIALS.map(({ key, label, Icon }) => (
              <span
                key={key}
                className={cx(styles.social, SOCIAL_CLASS[key])}
                role="img"
                aria-label={label}
              >
                <Icon aria-hidden="true" />
              </span>
            ))}
          </div>
          <p className={styles.socialsNote}>{t('socialsNote')}</p>
        </div>

        <nav className={styles.navZone} aria-label={exploreTitle}>
          {/*
            Cột dịch vụ dựng riêng chứ không nhét vào `FOOTER_COLUMNS`: nhãn của nó đến từ
            namespace KHÁC (`HomeSearch.service`, dùng chung với tab tìm kiếm trang chủ), còn
            mọi mục trong `FOOTER_COLUMNS` đọc nhãn từ `Marketplace.footer`. Gộp lại sẽ phải
            gắn tên namespace vào từng mục — cả một cơ chế cho đúng một cột.
          */}
          <details className={styles.col}>
            <summary className={styles.colTitle}>
              <span className={styles.colTitleText}>{exploreTitle}</span>
              <span className={styles.caret} aria-hidden="true" />
            </summary>
            <ul className={styles.colLinks}>
              {FOOTER_SERVICE_LINKS.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className={styles.link}>
                    <span className={styles.linkDash} aria-hidden="true" />
                    <span>{tService(link.labelKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>

          {FOOTER_COLUMNS.map((col) => (
            <details key={col.key} className={styles.col}>
              <summary className={styles.colTitle}>
                <span className={styles.colTitleText}>{t(col.titleKey)}</span>
                <span className={styles.caret} aria-hidden="true" />
              </summary>
              <ul className={styles.colLinks}>
                {col.links.map((link) => {
                  const current = active(link.href);
                  return (
                    <li key={link.key}>
                      <Link
                        href={link.href}
                        className={cx(styles.link, current && styles.linkActive)}
                        aria-current={current ? 'page' : undefined}
                      >
                        <span className={styles.linkDash} aria-hidden="true" />
                        <span>{t(link.key)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </nav>

        {/*
          Cụm mã QR dùng CHUNG với trang `/app` (`AppStoreQr`): khi app lên store thì chỉ có một
          chỗ phải sửa. Tiêu đề vùng là LIÊN KẾT sang trang đó — chân trang không đủ chỗ để nói
          app làm được gì, nên nó chỉ đưa đường.
        */}
        <section className={styles.appZone} aria-labelledby="xp-footer-apps">
          <h2 id="xp-footer-apps" className={styles.appTitle}>
            <Link
              href={ROUTES.APP}
              className={cx(styles.appTitleLink, active(ROUTES.APP) && styles.appTitleCurrent)}
              aria-current={active(ROUTES.APP) ? 'page' : undefined}
            >
              {t('apps.heading')}
              <span className={styles.appTitleArrow} aria-hidden="true" />
            </Link>
          </h2>
          <AppStoreQr size={72} tone="dark" className={styles.qrList} />
        </section>
      </div>

      {/* ─── Thanh tiện ích ─────────────────────────────────────────────── */}
      <div className={styles.bottom}>
        <div className={styles.bottomInner}>
          <span className={styles.copyright}>{t('copyright', { year: COPYRIGHT_YEAR })}</span>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.country}>{t('country')}</span>

          <div className={styles.tools}>
            {/*
              Bộ đổi ngôn ngữ THẬT (Server Action ghi cookie `XP_LOCALE`, ADR 0012) — không phải
              trang trí. Header chỉ hiện nó cho khách chưa đăng nhập, nên đây là chỗ duy nhất
              người đã đăng nhập đổi được ngôn ngữ mà không phải mở menu tài khoản.
            */}
            <LocaleSwitcher className={styles.localeBtn} />
            <button
              type="button"
              className={styles.toTop}
              onClick={scrollToTop}
              aria-label={t('backToTop')}
            >
              <ArrowUpOutlined aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
