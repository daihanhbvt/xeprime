import reactHooks from 'eslint-plugin-react-hooks';

import base from './base.mjs';
import { noDirectDayjsImport } from './datetime.mjs';

/**
 * Rule cho code React, dùng chung cho apps/web và apps/mobile.
 *
 * Tách rời khỏi `base` và CỐ Ý không gắn `files`: root config áp chúng cho nhiều app với
 * glob khác nhau, còn `eslint.config.mjs` của từng app dùng bản `default` bên dưới. Đừng
 * đọc mảng này bằng chỉ số — thêm một overlay là mọi chỉ số cứng lệch đi trong im lặng.
 *
 * `eslint-config-next` cũng nạp react-hooks cho apps/web, nhưng apps/mobile thì không có
 * gì cả — thiếu overlay này là `exhaustive-deps` không chạy ở toàn bộ code React Native.
 */
export const reactOverlays = [
  // `configs.flat.*` chứ không `configs.recommended` — bản không có `flat` vẫn là định dạng
  // eslintrc (`plugins` là mảng chuỗi) và ESLint 9 từ chối nạp.
  reactHooks.configs.flat['recommended-latest'],
  {
    rules: {
      // ADR 0003 + CLAUDE.md mục 5: styling đi qua CSS Modules + AntD token.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'styled-components',
              message: 'ADR 0003: dùng CSS Modules + AntD token, không dùng styled-components.',
            },
            {
              name: 'lucide-react',
              message: 'CLAUDE.md mục 4: chỉ dùng @ant-design/icons.',
            },
            {
              name: 'redux-saga',
              message: 'CLAUDE.md mục 5: không dùng redux-saga ở MVP.',
            },
            {
              name: 'react-big-calendar',
              message: 'CLAUDE.md mục 5: màn lịch dùng custom scheduler.',
            },
          ],
          patterns: [
            {
              group: ['@fullcalendar/*', '@bryntum/*'],
              message: 'CLAUDE.md mục 5: không dùng thư viện calendar tính phí.',
            },
          ],
        },
      ],
    },
  },
  noDirectDayjsImport,
];

export default [
  ...base,
  ...reactOverlays.map((overlay) => ({ files: ['**/*.{ts,tsx}'], ...overlay })),
];
