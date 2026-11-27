import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { renderWithIntl } from '@/i18n/test-utils';
import { LegalDocLink } from './LegalDocLink';

/**
 * Liên kết văn bản pháp lý giữa luồng đặt xe: bấm thường mở hộp xem nhanh TOÀN VĂN, không rời
 * trang; Ctrl/Cmd + bấm vẫn là liên kết thật sang `/legal/<doc>`.
 */
afterEach(() => cleanup());

describe('LegalDocLink', () => {
  it('là liên kết thật tới trang văn bản (mở tab mới khi Ctrl/Cmd + bấm hoặc chưa có JS)', () => {
    render(<LegalDocLink doc={LEGAL_DOC.CANCELLATION}>Chính sách huỷ chuyến</LegalDocLink>);
    const link = screen.getByRole('link', { name: 'Chính sách huỷ chuyến' });
    expect(link.getAttribute('href')).toBe(legalPath.doc(LEGAL_DOC.CANCELLATION));
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('bấm thường mở hộp xem nhanh với toàn văn, kể cả bảng ma trận huỷ', () => {
    render(<LegalDocLink doc={LEGAL_DOC.CANCELLATION}>Chính sách huỷ chuyến</LegalDocLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Chính sách huỷ chuyến' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Chính sách huỷ chuyến và hoàn tiền')).toBeTruthy();
    expect(within(dialog).getByText('Khách huỷ trong thời gian huỷ miễn phí')).toBeTruthy();
    // Lối sang trang đầy đủ (lưu, in, gửi đường dẫn).
    expect(
      within(dialog)
        .getByRole('link', { name: /Mở trang đầy đủ/ })
        .getAttribute('href'),
    ).toBe(legalPath.doc(LEGAL_DOC.CANCELLATION));
  });

  it('Ctrl + bấm không mở hộp (để trình duyệt mở tab mới)', () => {
    render(<LegalDocLink doc={LEGAL_DOC.TERMS}>Điều khoản sử dụng</LegalDocLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Điều khoản sử dụng' }), { ctrlKey: true });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('tiếng Anh: hộp hiện đúng bản tiếng Anh', () => {
    renderWithIntl(<LegalDocLink doc={LEGAL_DOC.PAYMENT}>Payment policy</LegalDocLink>, {
      locale: 'en',
    });
    fireEvent.click(screen.getByRole('link', { name: 'Payment policy' }));
    expect(
      within(screen.getByRole('dialog')).getByText('Payment and Points Wallet Policy'),
    ).toBeTruthy();
  });
});
