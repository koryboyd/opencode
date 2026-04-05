<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center"><strong>⚠️ WORK IN PROGRESS — Active Development Branch ⚠️</strong></p>
<p align="center">This fork is implementing comprehensive improvements based on the <a href="https://github.com/koryboyd/opencode/blob/dev/opencode-port-plan.md">OpenCode Port Plan</a>.</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### 🔧 Active Development: OpenCode Port Plan

This branch contains work-in-progress implementation of the [OpenCode Port Plan](opencode-port-plan.md), a comprehensive upgrade to OpenCode inspired by Claude Code's superior implementations.

**⚠️ This codebase has errors and will not run as-is.** All features are represented in the codebase but are scaffolding/partial implementations that need completion.

---

### 📋 Phase 1: Base Prompt Improvements

Hard numeric limits and explicit prohibitions to reduce unnecessary token usage:

| Feature | Description |
|---------|-------------|
| **Conciseness Rules** | Hard numeric limits: ≤4 lines for conversational responses, ≤25 words between tool calls, ≤100 words final responses |
| **Preamble Prohibition** | No "I'll now...", "Let me...", "Certainly!" — begin immediately with action |
| **Post-Action Summary Prohibition** | No summarizing what was done — results speak for themselves |
| **Meta-Rule: When in Doubt, Don't** | Explicit instruction to ask rather than proceed under uncertainty |
| **Targeted Failure Mode Prohibitions** | Specific prohibitions: no edits without reading first, no adding docstrings to unmodified code, no TODO comments |
| **Read Before Modify** | Explicit rule: must read file in current session before editing |
| **Parallelism Instruction** | Issue independent tool calls simultaneously, not sequentially |
| **Subagent Task Writing** | Guidance for writing self-contained subagent prompts |

**Files:** `packages/opencode/src/session/prompt/assembly.ts`, prompt templates

---

### 🧠 Phase 2: Context & Memory Improvements

Multi-layered context system for better prompt caching and session continuity:

| Feature | Description |
|---------|-------------|
| **Static/Dynamic Cache Boundary** | Static prompt content (rules, identity) before dynamic content (session-specific) for 90% cache cost reduction |
| **AGENTS.md in Messages Array** | Move project AGENTS.md to messages array instead of system prompt, preserving shared cache prefix |
| **Global User AGENTS.md** | `~/.opencode/AGENTS.md` loaded for all projects, project-level overrides global |
| **Subdirectory AGENTS.md** | Auto-load `AGENTS.md` from subdirectories when entering that context |
| **Path-Scoped Rules** | `.opencode/rules/` with YAML frontmatter for path-specific rules (auto-triggered on file access) |
| **Session Exit Summary** | Generate ≤200 word summary on exit, inject at next session start (7-day TTL) |
| **AGENTS.md Update Suggestions** | Prompt to suggest AGENTS.md updates when discovering project conventions |

**Files:** `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/exit-summary.ts`, skill system

---

### 📦 Phase 3: Compaction Upgrades

Smarter context management when approaching context limits:

| Feature | Description |
|---------|-------------|
| **Circuit Breaker** | Stop retrying after 3 consecutive compaction failures, surface error to user |
| **Structured Compaction Prompt** | 9-section structured format: Active task, Completed work, Commands executed, Unresolved issues, Dead ends, Decisions made, Current file states, Next steps, Important constraints |
| **AGENTS.md Re-injection** | Explicitly re-inject AGENTS.md after compaction (not rely on summary preserving it) |
| **MicroCompact** | Local stale output pruning before full compaction: superseded tool results, aged listings (10+ turns), aged search results (15+ turns) |

**Files:** `packages/opencode/src/session/compaction.ts`

---

### 📐 Phase 4: Plan Mode Upgrade

Tool-level plan mode enforcement and explicit enter/exit transitions:

| Feature | Description |
|---------|-------------|
| **Tool-Level Write Removal** | Write tools removed from tool list entirely in plan mode (not just blocked) |
| **enter_plan_mode Tool** | Explicit tool call to enter plan mode with clear identity |
| **exit_plan_mode Tool** | Explicit tool call to exit plan mode (requires plan_summary parameter) |
| **Plan Mode Identity Section** | "Your role is architect and analyst, not implementor" — qualitative identity shift |

**Files:** `packages/opencode/src/session/prompt.ts` (PROMPT_PLAN), permission system

---

### ⚙️ Phase 5: Settings Hierarchy

Per-machine configuration that never gets committed:

| Feature | Description |
|---------|-------------|
| **Local Gitignored Settings** | `.opencode/settings.local.json` — per-machine overrides |
| **Explicit Resolution Order** | Documented priority: CLI flags > ENV > local > project > global |
| **CLI Command** | `opencode config local` to edit local settings |

**Files:** `packages/opencode/src/config/config.ts`

---

### 🔌 Phase 6: MCP Client Improvements

Optimized MCP tool loading:

| Feature | Description |
|---------|-------------|
| **Tool Schema Caching** | Serialize MCP tool schemas once at session start, reuse across API calls |
| **Category-Based Lazy Loading** | Group tools by category (filesystem, git, web, database, testing, terminal), load on-demand |

**Files:** `packages/opencode/src/mcp/index.ts`

---

### 🤖 Phase 7: Agent System

Rich per-agent configuration:

| Feature | Description |
|---------|-------------|
| **Per-Agent Model** | `model:` field in agent YAML — different models for different tasks |
| **Per-Agent Tool Allowlist** | `allowedTools:` field — restrict tools at API level |
| **Per-Agent Tool Denylist** | `disallowedTools:` field — block specific tools |
| **Background Agents** | `background: true` — non-blocking subagent execution |
| **Max Turns Per Agent** | `maxTurns:` — limit agent iterations |
| **Worktree Isolation** | `isolation: worktree` — isolated git worktree per agent |
| **Scoped Lifecycle Hooks** | Agent-specific hooks via YAML |

**Files:** `packages/opencode/src/agent/agent.ts`, `packages/opencode/src/agent/subagent.ts`

---

### 📊 Phase 8: Context Window Visibility

Real-time token tracking:

| Feature | Description |
|---------|-------------|
| **Context Usage Bar** | TUI status: `Context: 45,230 / 200,000 (22%)` with color warnings |
| **Per-Turn Token Breakdown** | `+1,240 tokens this turn` with cache read/write stats |
| **Cost Estimation** | Estimated cost per turn and cumulative session cost |
| **Verbose Mode Toggle** | `Ctrl+O` to show system prompt, tool payloads, cache status |

---

### 🪝 Phase 9: Hooks System

Extensible lifecycle events:

| Feature | Description |
|---------|-------------|
| **PreToolUse Hook** | Block/modify tool calls before execution |
| **PostToolUse Hook** | Inject context after successful tool execution |
| **PostToolUseFailure Hook** | Observe and log failed tool calls |
| **UserPromptSubmit Hook** | Inject context before sending to model |
| **SessionStart/End Hooks** | Lifecycle observability |
| **Stop Hook** | Inject continuation after model turn |
| **PreCompact Hook** | Observe compaction triggers |
| **Hook Types** | Command hooks (shell), HTTP hooks (webhook), Prompt hooks (inject), Agent hooks (spawn) |
| **Tool Name Matching** | Regex patterns to scope hooks to specific tools |

**Files:** `packages/opencode/src/config/config.ts` (hooks schema)

---

### 🧠 Bonus: Memory System

Session memory and knowledge management:

| Feature | Description |
|---------|-------------|
| **AutoDream** | Idle-time memory consolidation — merges observations, removes contradictions |
| **Skeptical Memory** | Ephemeral claims with verification obligations, auto-promote verified claims to persistent layer |
| **Tool Observation Capture** | Auto-capture notable read/bash/grep results as raw observations |
| **Session Exit Summary** | Generate and persist summary for next session continuity |

**Files:** Memory modules, `packages/opencode/src/session/exit-summary.ts`

---

### 📁 Key Files Modified

```
packages/opencode/src/
├── agent/
│   ├── agent.ts           # Per-agent config (model, tools, background)
│   └── subagent.ts        # Isolated subagent spawning
├── config/
│   └── config.ts          # Settings hierarchy, hooks schema
├── mcp/
│   └── index.ts           # Tool caching, category lazy loading
├── session/
│   ├── compaction.ts      # Circuit breaker, structured prompt, MicroCompact
│   ├── exit-summary.ts    # Session exit summaries
│   ├── llm.ts            # Static/dynamic prompt boundary
│   ├── prompt.ts          # Plan mode, reminders, tool resolution
│   └── (prompt/)          # Prompt assembly and templates
├── skill/
│   └── index.ts           # Enhanced skill metadata (model, allowedTools, paths)
└── (memory modules)       # AutoDream, Skeptical Memory
```

---

See [opencode-port-plan.md](opencode-port-plan.md) for full implementation tasks.

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

OpenCode is also available as a desktop application. Download directly from the [releases page](https://github.com/anomalyco/opencode/releases) or [opencode.ai/download](https://opencode.ai/download).

| Platform              | Download                              |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-darwin-aarch64.dmg` |
| macOS (Intel)         | `opencode-desktop-darwin-x64.dmg`     |
| Windows               | `opencode-desktop-windows-x64.exe`    |
| Linux                 | `.deb`, `.rpm`, or AppImage           |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$OPENCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.opencode/bin` - Default fallback

```bash
# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

### FAQ

#### How is this different from Claude Code?

It's very similar to Claude Code in terms of capability. Here are the key differences:

- 100% open source
- Not coupled to any provider. Although we recommend the models we provide through [OpenCode Zen](https://opencode.ai/zen), OpenCode can be used with Claude, OpenAI, Google, or even local models. As models evolve, the gaps between them will close and pricing will drop, so being provider-agnostic is important.
- Out-of-the-box LSP support
- A focus on TUI. OpenCode is built by neovim users and the creators of [terminal.shop](https://terminal.shop); we are going to push the limits of what's possible in the terminal.
- A client/server architecture. This, for example, can allow OpenCode to run on your computer while you drive it remotely from a mobile app, meaning that the TUI frontend is just one of the possible clients.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)
