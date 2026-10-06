'use client';

import { useEffect, useRef } from 'react';

/**
 * Cuộn tới section đang chọn của một trang nhiều section (`SectionNav` + `SectionCard`) và đưa
 * TIÊU ĐIỂM vào nó.
 *
 * Tiêu điểm là nửa thường bị quên: cuộn không thôi thì người dùng bàn phím vẫn đứng ở cột mục
 * lục, và phím Tab tiếp theo đưa họ sang mục kế của mục lục chứ không vào nội dung vừa mở.
 *
 * Lần vẽ ĐẦU chỉ cuộn khi `?section=` thật sự có trong URL (`scrollOnMount`). Đó là đường của
 * redirect cũ và của một link chia sẻ — cả hai đều hứa "mở ra ở đúng phần này". Người vào trang
 * trần thì không: một cú nhảy ngay khi trang vừa hiện là trang tự ý đưa họ đi đâu đó.
 *
 * Kiểu cuộn khác nhau theo lần: lần đầu nhảy thẳng, vì cuộn mượt từ đầu trang xuống cuối là một
 * đoạn hoạt hình dài không ai xin. Đổi section trong lúc đọc thì mượt — để người dùng thấy mình
 * vừa đi từ đâu tới đâu.
 *
 * Nhớ id ĐÃ XỬ LÝ chứ không nhớ cờ "lần đầu": StrictMode (dev) chạy effect hai lần liền nhau, và
 * với một cờ thì lần chạy thứ hai tưởng người dùng vừa đổi section — trang tự cuộn và focus khối
 * đầu tiên ngay khi mở. So id thì lần chạy lặp lại thấy "không có gì đổi" và đứng yên.
 *
 * @param domId id DOM của section đang chọn — đổi giá trị này là lệnh cuộn.
 */
export function useScrollToSection(domId: string, scrollOnMount: boolean): void {
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (handled.current === domId) return;
    const isFirst = handled.current === null;
    handled.current = domId;
    if (isFirst && !scrollOnMount) return;

    const el = document.getElementById(domId);
    if (!el) return;
    el.scrollIntoView({ behavior: isFirst ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    // `scrollOnMount` cố ý KHÔNG nằm trong deps: nó chỉ có nghĩa ở lần vẽ đầu, và đưa vào đây
    // sẽ khiến effect chạy lại đúng lúc người dùng bấm mục lục lần đầu (query từ vắng thành có).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domId]);
}
