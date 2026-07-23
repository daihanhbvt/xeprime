import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import styles from './MarketFooter.module.css';

const COLUMNS = [
  {
    title: 'Về XePrime',
    links: ['Giới thiệu', 'Tuyển dụng', 'Điều khoản', 'Bảo mật'],
  },
  {
    title: 'Hỗ trợ',
    links: ['Trung tâm trợ giúp', 'Hướng dẫn thuê xe', 'Câu hỏi thường gặp', 'Liên hệ'],
  },
  {
    title: 'Chủ xe',
    links: ['Đăng xe cho thuê', 'Quản lý gian hàng', 'Chính sách chủ xe'],
  },
];

export function MarketFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <Logo size="sm" />
          <p className={styles.tagline}>Nâng tầm giá trị mỗi hành trình.</p>
          <p className={styles.hours}>Hỗ trợ 7:00 – 22:00 mỗi ngày</p>
        </div>

        <div className={styles.cols}>
          {COLUMNS.map((col) => (
            <nav key={col.title} className={styles.col} aria-label={col.title}>
              <h3 className={styles.colTitle}>{col.title}</h3>
              {col.links.map((label) => (
                <Link key={label} href={ROUTES.HOME} className={styles.link}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div className={styles.bottom}>
        <span>© 2026 XePrime · Softrent</span>
        <span>Nền tảng cho thuê xe tại Việt Nam</span>
      </div>
    </footer>
  );
}
