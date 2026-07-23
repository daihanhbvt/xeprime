import base from './base.mjs';

/**
 * Frontend rules layered on top of the base config.
 *
 * `eslint-config-next` is applied by apps/web itself (it needs to resolve the Next
 * plugin relative to that app), so this file only carries the XePrime-specific rules.
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx}'],
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
];
