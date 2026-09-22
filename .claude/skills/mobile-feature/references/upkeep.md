# Kỷ luật chú thích và cập nhật tài liệu khi đổi HÌNH DẠNG

> Tài liệu tham chiếu của skill `mobile-feature`. Đọc khi công việc chạm tới phần này.

## Kỷ luật chú thích

Comments explain **why**, never **what**. The code already says what it does.

Write a comment only when a reader who knows React Native would otherwise get it wrong:

* A **trap** — code that looks redundant or wrong but is load-bearing (a side-effect import, a
  config flag that breaks pnpm resolution if flipped).
* A **domain invariant** — cite the ADR (`ADR 0011: return date = pickup date + N calendar months,
  not N×30`).
* A **non-obvious choice** where the obvious alternative is broken, with the failure named.

Do **not** write:

* Docblocks that restate the signature or the JSX tree (`/** Shared QueryClient for the app. */`,
  `/** Root layout — sets up the providers. */`).
* Comments on self-evident config (`staleTime: 30_000, // cache for 30 seconds`).
* Section banners, `// ===== Helpers =====`, author/date headers.
* Placeholder comments for features not written yet (`// TODO: booking goes here`).

Prefer a better name over a comment. Prefer deleting the comment over updating it.

Keep the form tight: one or two lines, inline, directly above what it explains. A `/** */` block is
for an exported symbol whose contract is genuinely not obvious — not for narration.

**Example — cut this:**

```ts
/**
 * Shared QueryClient for the whole app.
 *
 * `refetchOnWindowFocus` is off because React Native has no window focus — refetching when
 * the app returns to the foreground (AppState) and when the network comes back (NetInfo)
 * will be wired up with the first feature that calls the API.
 */
export const queryClient = new QueryClient({ ... });
```

**Down to this:**

```ts
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // React Native has no window focus — AppState/NetInfo refetching is wired up later.
      refetchOnWindowFocus: false,
    },
  },
});
```

---

## Đổi hình dạng thì sửa thứ mô tả nó

Writing a feature touches code only. Changing **shape** — adding, deleting, renaming or moving a
module; changing how a layer is wired; changing a boundary — also invalidates the files that
*describe* that shape, and nothing in the toolchain will tell you.

**A stale diagram is worse than no diagram.** This already happened here: after the interceptor layer
was deleted, `apps/mobile/README.md` still drew `SessionBoundary → registers errorInterceptor 401`.
The next reader either hunts for a module that no longer exists, or rebuilds it — and rebuilding
that particular one reintroduces the reset-refetch-401 loop the new design removed. Typecheck cannot
catch this. Only you can.

Ask after every change: **did the shape change, or only the behaviour inside it?** If the shape
changed, update the row that applies:

| What you changed | Also update |
| --- | --- |
| Added / deleted / renamed a module in `src/lib` or `src/features/*` | `apps/mobile/README.md` — folder table **and** any mermaid diagram naming it · `docs/CODEMAP.md` |
| Added a variant to `AppHeader`, or a component to `src/components/ui/` | `apps/mobile/README.md` §8 · §4 of this skill — otherwise the next screen will rebuild the very thing you just added |
| How the API client is configured, or what `@xeprime/api-client` exposes | `packages/api-client/README.md` · `apps/mobile/README.md` §4 · §1 of this skill |
| The auth / token / session flow | `apps/mobile/README.md` §5 — diagram **and** the numbered rules · `packages/api-client/README.md` · §3C of this skill |
| A state boundary (what belongs in Redux vs TanStack Query vs RHF) | §2 of this skill |
| Design tokens, or how native reads them | `packages/ui` · `src/theme/*` · §1 of this skill |
| Added a message namespace | `apps/web/src/i18n/namespaces.ts` · both gather tables · run `i18n:check` |
| A decision that contradicts an existing doc | Write an **ADR** in `docs/decisions/`. Per CLAUDE.md the ADR wins over every other document — editing prose without one leaves two docs disagreeing |
| Finished a phase or milestone | `docs/completion-roadmap.md` · `docs/mobile-readiness-audit.md` |

**Verify instead of remembering.** After deleting or renaming anything exported, grep the docs for
the old name — the point is to find *prose and diagrams*, which no compiler checks:

```bash
rg -n 'OldName|old-file-name' apps/mobile/README.md packages/*/README.md docs/ .claude/ CLAUDE.md
```

Two habits that keep this cheap:

* **Delete beats update.** If a paragraph exists only to explain what the code used to be, remove it
  — git history already holds it, and archaeology in a README rots faster than anything else.
* **Docs go in the same commit as the change.** A follow-up commit "fix docs" never arrives, and in
  between, the repository is actively lying to whoever reads it next.

---
