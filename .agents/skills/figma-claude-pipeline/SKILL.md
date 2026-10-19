---
name: figma-claude-pipeline
description: >-
  Use this skill whenever the user provides a Figma design URL, node ID, or UI/UX and full-stack booking task in XePrime. Coordinates Antigravity as the orchestrator/verifier and Claude Code as the primary engineer for complex business logic, BE analysis/implementation, and Figma MCP reading/coding.
---

# Figma to Code & Full-Stack Pipeline (Antigravity + Claude Code)

This skill formalizes the collaborative workflow between **Antigravity** (Google DeepMind agent) and **Claude Code** (Anthropic CLI with Figma MCP) for translating Figma designs and end-to-end full-stack business flows into code within the XePrime monorepo (`apps/web`, `apps/api`, `packages/*`).

## Division of Responsibilities

### 1. Claude Code (Lead Precision Engineer & BE Analyst)
- **Figma MCP Reader**: Connects to `https://mcp.figma.com/mcp` to inspect metadata (`get_metadata`), design variables (`get_variable_defs`), and component context (`get_design_context`).
- **Backend (BE) Analysis & Implementation**:
  - Inspects `apps/api/src/modules/` (e.g. `booking-requests`, `holds`, `payments`, `customer-trips`, `driver-licences`).
  - Analyzes API endpoints, DTO contracts, Prisma/database schemas, state machines, and business rules.
  - Updates or creates backend endpoints, services, and validation schemas when Figma or business flows require changes.
- **Frontend & Modal Implementation**:
  - Writes React components, CSS Modules, hooks, and modals in `apps/web`.
  - Handles complex edge cases (unauthenticated states, driver license gates, delivery address distance quotes, promo codes, payment states).
  - Adheres strictly to canonical design tokens (`@xeprime/ui`, ADR 0003, ADR 0062).

### 2. Antigravity (Orchestrator & Verifier)
- **Orchestration**:
  - Parses user prompts, Figma URLs, and node IDs.
  - Formulates clear, highly actionable task briefs for Claude Code CLI.
  - Triggers Claude Code CLI in headless mode via `run_command`.
- **System Verification & Guardrails**:
  - Runs full verification commands (`pnpm --filter @xeprime/web typecheck`, `pnpm --filter @xeprime/api typecheck`, vitest test suites, `test:theme`).
  - Inspects `git status` and `git diff` to ensure zero regression.
  - Summarizes progress and presents findings to the user.

---

## Standard Workflow

### Step 1: Parse Figma & Target Modules
- Figma URL format: `https://www.figma.com/design/<fileKey>/<fileName>?node-id=<nodeId>`
  - `fileKey`: e.g. `RHDyFsURFZQ9BC5JCLQzeE`
  - `nodeId`: convert hyphen to colon (e.g. `19727-55409` $\rightarrow$ `19727:55409`)
- Identify target packages:
  - Frontend: `apps/web/src/features/...`
  - Backend: `apps/api/src/modules/...`
  - Types / Contracts: `packages/types/`, `packages/domain/`

### Step 2: Trigger Claude Code CLI Headless
Antigravity invokes Claude Code using `run_command`:
```powershell
npx @anthropic-ai/claude-code -p "<Task_Prompt_With_Figma_Node_And_BE_Context>" --dangerously-skip-permissions
```

#### Task Prompt Types for Claude Code:
1. **BE & Architecture Analysis**:
   ```powershell
   npx @anthropic-ai/claude-code -p "Phân tích backend tại apps/api/src/modules/<module> và đối chiếu với thiết kế Figma node <nodeId> trong file <fileKey>. Đánh giá các trường hợp nghiệp vụ (chưa đăng nhập, chưa bằng lái, tính tiền, giữ chỗ), xác định API hiện tại thiếu/đủ những gì và đề xuất phương án code." --dangerously-skip-permissions
   ```
2. **Direct Implementation (BE & FE)**:
   ```powershell
   npx @anthropic-ai/claude-code -p "Dùng Figma MCP get_design_context cho node <nodeId> trong file <fileKey>. Triển khai/cập nhật component và CSS Module tại <path> cùng logic BE tại apps/api/src/modules/<module> nếu cần. Tuân thủ token CSS XePrime và ADR 0003." --dangerously-skip-permissions
   ```

### Step 3: Verification & Guardrails (Antigravity)
1. Verify Types & Compilation:
   ```powershell
   pnpm --filter @xeprime/web typecheck
   pnpm --filter @xeprime/api typecheck
   ```
2. Run Unit & Integration Tests:
   ```powershell
   pnpm --filter @xeprime/web test
   ```
3. Inspect Git Diff & Report:
   ```powershell
   git status -s
   git diff
   ```
