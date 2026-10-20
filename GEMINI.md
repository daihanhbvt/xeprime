# XePrime — Antigravity Workspace Guidelines

## 1. Tool Integration: Claude Code & Figma MCP
This repository integrates **Claude Code CLI** and **Figma MCP** with **Antigravity**:
- **Claude Code CLI**: Run via `npx @anthropic-ai/claude-code -p "<prompt>" --dangerously-skip-permissions`.
- **Figma MCP Server**: Configured at `https://mcp.figma.com/mcp` for reading Figma metadata, design context, and variables (`get_metadata`, `get_variable_defs`, `get_design_context`).
- **Skill**: Refer to the skill `figma-claude-pipeline` (`.agents/skills/figma-claude-pipeline/SKILL.md`) whenever the user supplies Figma links/nodes or asks to translate UI designs to code.

## 2. Roles & Division of Strengths
- **Antigravity (Orchestrator & Verifier)**:
  - Directs the pipeline, breaks down tasks, and formulates technical briefs.
  - Triggers Claude Code CLI in headless mode with exact prompts and Figma node IDs.
  - Runs system verification (`pnpm typecheck`, vitest test suites, `theme.test.ts`), reviews `git diff`, and reports to user.
- **Claude Code (Lead Precision Coder & BE Analyst)**:
  - Handles complex business logic and **Backend (BE) analysis & implementation** in `apps/api/src/modules/` (booking-requests, holds, payments, driver-licences, customer-trips, DTOs, database schemas).
  - Queries Figma nodes via Figma MCP (`get_design_context`, `get_variable_defs`, `get_metadata`) and generates/edits CSS Modules, React components, and modals in `apps/web`.

## 3. Architecture & Style Constraints
- Always respect [`CLAUDE.md`](file:///d:/Softrent/Xeprime/CLAUDE.md) and ADRs in `docs/decisions/` (e.g. ADR 0003 for CSS Modules + AntD Tokens, ADR 0062 for Design System v2).
- Never hardcode colors; use canonical tokens from `@xeprime/ui` (`tokens.css` and `tokens/index.ts`).
- Never hardcode user-facing strings; use `packages/domain/messages/{vi,en}/*.json`.
