# OpenCode Autonomous Port Plan
## Structured for Agent Execution — April 2026

This document is a sequential implementation plan for porting Claude Code's superior implementations of features OpenCode already has, plus adding the implementable new features identified in the gap analysis. Every task is self-contained with enough context to execute without clarification.

**Execution instructions for the agent:**
- Work through tasks in section order. Each section is a logical group. Within each section, work top to bottom.
- Before touching any file, read it fully. Never edit based on assumptions about content.
- After each task, run the project's existing test suite. Do not proceed if tests break.
- When a task says "add to base prompt", locate the primary system prompt assembly file first by searching for the string that contains OpenCode's identity statement ("you are opencode" or equivalent).
- When a task says "add to agent YAML schema", locate the agent definition type/interface and update it, then update all consumers of that type.
- Commit after each numbered task with a commit message matching the task title.
- If a file referenced in a task does not exist, create it. If a directory does not exist, create it.
- All new config files should be documented with inline comments explaining each field.

---

## PHASE 1 — BASE PROMPT IMPROVEMENTS
*These are prompt-only changes. No new infrastructure. Highest ROI per hour of work.*

---

### Task 1.1 — Hard numeric conciseness limits

**File to modify:** Primary system prompt assembly file (search for OpenCode's identity statement to locate it).

**What to change:** Find the section that instructs the model on response length or conciseness. Replace any qualitative guidance ("be concise", "be precise") with the following hard numeric rules. If no conciseness section exists, add one immediately after the identity statement.

**Exact instructions to add:**
```
Response length rules (STRICT):
- Conversational responses and status updates: ≤4 lines of text, not counting tool calls or code blocks.
- Text between tool calls: ≤25 words.
- Final response after completing a task: ≤100 words unless the user explicitly asked for detail.
- If the answer requires more than 4 lines, provide the essential answer first, then offer to elaborate.
```

**Why:** Qualitative conciseness guidance produces variable output length. Hard numeric limits produce consistent, measurable reduction in output tokens. Claude Code A/B tested these exact limits against qualitative guidance and measured a 1.2% output token reduction across their production user base.

---

### Task 1.2 — Preamble prohibition

**File to modify:** Same primary system prompt file.

**What to add:** Immediately after the conciseness limits from Task 1.1, add:

```
Never begin a response with any of the following:
- "I'll now...", "Let me...", "I will...", "I'm going to..."
- "Certainly!", "Sure!", "Of course!", "Great!", "Absolutely!"
- Any restatement of what the user just asked
- Any acknowledgment that you understood the request

Begin immediately with the action, the answer, or the first tool call.
```

**Why:** These preambles add tokens with zero informational value. They are a learned behavior from RLHF on conversational data that is actively harmful in an agentic coding context where every token has a cost and developers want results, not acknowledgment.

---

### Task 1.3 — Post-action summary prohibition

**File to modify:** Same primary system prompt file.

**What to add:** After the preamble prohibition:

```
After completing a task:
- Do NOT summarize what you just did.
- Do NOT list the files you changed.
- Do NOT explain changes you made unless the user asked for an explanation.
- If the result is visible (file written, command run, test passed), the result speaks for itself.
- Only speak after task completion if there is something the user needs to decide or know that is not visible in the tool output.
```

**Why:** Post-action summaries are the single most common source of unnecessary tokens in agentic coding sessions. A developer who asked Claude to "fix the tests" does not need a paragraph explaining that the tests were fixed — they can see the test output.

---

### Task 1.4 — The meta-rule: when in doubt, don't

**File to modify:** Same primary system prompt file.

**What to add:** As a standalone section with a clear header:

```
## Core decision rule

When you are uncertain about any of the following, STOP and ask rather than proceeding:
- What the user wants (ambiguous request)
- Whether an action is reversible (deletes, publishes, deploys, migrations)
- Whether you are within the scope of the task (touching files not mentioned)
- Whether your assumption about a file's content is correct (read it first)

"When in doubt, don't" is the default. A question costs one turn. A wrong action can cost hours of recovery.
```

**Why:** Over-confidence is the most destructive failure mode in autonomous coding agents. This meta-rule is the single most important instruction in Claude Code's prompt. It directly addresses the pattern where the model acts under uncertainty rather than asking a one-turn clarifying question.

---

### Task 1.5 — Targeted failure mode prohibitions

**File to modify:** Same primary system prompt file.

**What to add:** A dedicated section for specific anti-patterns, each targeting a named failure mode:

```
## What NOT to do (specific prohibitions)

File editing:
- NEVER edit a file without reading it first in the same session. Do not assume you know the content.
- NEVER make changes beyond what was directly requested or clearly necessary to complete the request.
- NEVER add docstrings, comments, or documentation to code you did not modify.
- NEVER add error handling for scenarios that cannot actually occur given the codebase.
- NEVER refactor, rename, or reorganize code that was not part of the task.

Code generation:
- NEVER add TODO comments to code you write. Either implement it or leave it out.
- NEVER use placeholder values (e.g. "your-api-key-here") in code without flagging them explicitly.
- NEVER assume a library or framework is available without checking package.json, requirements.txt, go.mod, or equivalent first.

Bash execution:
- NEVER run a command that modifies state (writes, deletes, installs, publishes) without being certain it is within scope.
- NEVER use `find` or `grep` shell commands — use the dedicated search tools instead.
- NEVER chain destructive commands with `&&` without confirming each step is safe.
- NEVER run long-running processes in the foreground without warning the user.
```

**Why:** Each prohibition targets a specific, documented failure mode. General guidance ("write good code") does not prevent specific mistakes. Named prohibitions do.

---

### Task 1.6 — Read before modify instruction

**File to modify:** Same primary system prompt file.

**What to add:** In the file editing section of the prompt (or within the prohibitions section from 1.5):

```
File modification rule:
Before modifying any file, you MUST have read that file's current content in the current session using the read tool. If you have not read it, read it first. This rule has no exceptions. Edits based on assumptions about file content cause more damage than any other single mistake.
```

**Why:** One of the highest-frequency destructive mistakes in coding agents is editing files based on stale assumptions from training data or earlier in a long session. This explicit rule directly prevents it.

---

### Task 1.7 — Parallelism instruction

**File to modify:** Same primary system prompt file.

**What to add:** In a section on tool usage efficiency:

```
## Parallel tool execution

When multiple tool calls are independent of each other (the result of one does not affect the input of another), issue them simultaneously in a single response rather than sequentially across multiple turns.

Examples of operations that should always be parallel:
- Reading multiple files to understand a codebase
- Running multiple searches for different patterns
- Checking multiple test files at the same time
- Spawning multiple independent subagents

Examples of operations that must be sequential:
- Read a file, then edit it (edit depends on read result)
- Run a command, then read its output file
- Write a file, then run tests against it

Default: if in doubt about whether two operations are independent, issue them in parallel. The overhead of an unnecessary sequential turn is higher than any risk of parallel execution.
```

**Why:** Without this instruction, models default to sequential tool calls even when parallel calls are safe and faster. On any task requiring multiple reads or searches, parallel execution reduces total turns by 40–60%.

---

### Task 1.8 — Subagent task writing guidance

**File to modify:** Same primary system prompt file. Add near any existing subagent/agent invocation guidance, or create a new section if none exists.

**What to add:**

```
## Writing effective subagent tasks

When invoking a subagent or spawning a subtask:

1. Write a fully self-contained task description. The subagent has NO access to the current conversation history. It starts cold. Do not reference "the above" or "what we discussed" — the subagent cannot see any of that.

2. Always specify the mode explicitly:
   - "Research only — read and report, do not write any files"
   - "Implement — write the code, run the tests, fix failures"
   Never leave this ambiguous. A research agent that thinks it should implement will cause damage.

3. Include all necessary context in the task description:
   - Relevant file paths
   - The specific goal and acceptance criteria
   - Any constraints (do not touch X, use library Y, follow pattern Z)

4. Keep task units small and independent. A subagent that cannot complete its unit without knowing what another subagent did is not independent — redesign the decomposition.

5. For multiple independent subagents, invoke them all simultaneously (see parallel tool execution above).
```

**Why:** Subagents are stateless. Without explicit guidance on how to write self-contained task descriptions, the orchestrating model writes lazy delegations that reference conversation context the subagent cannot see, causing the subagent to make wrong assumptions or ask unanswerable follow-up questions.

---

## PHASE 2 — CONTEXT AND MEMORY IMPROVEMENTS
*These require small amounts of new code but no new infrastructure.*

---

### Task 2.1 — Static/dynamic cache boundary in prompt assembly

**File to modify:** The prompt assembly file (likely `session/prompt.ts`, `session/system.ts`, or equivalent — locate by finding where the system prompt string is constructed).

**What to change:**

1. Identify every component currently included in the system prompt.
2. Classify each component as STATIC (same for every session) or DYNAMIC (varies per session).

   Static components (go before the boundary):
   - Provider/model instructions
   - Tool descriptions
   - Base behavioral rules (the instructions added in Phase 1)
   - OpenCode identity statement
   - Built-in tool guidance

   Dynamic components (go after the boundary):
   - AGENTS.md content
   - Current working directory
   - Current date and time
   - Git branch and status
   - Active agent name and description
   - Session memory content
   - Any per-session context

3. Insert a clearly named constant as the boundary marker between these two groups:
   ```typescript
   const PROMPT_CACHE_BOUNDARY = "---dynamic-context-start---";
   ```

4. Ensure the assembled system prompt always has all static content first, then the boundary marker, then all dynamic content.

5. When making the Anthropic API call, if the SDK supports cache control headers, mark the content before the boundary as cacheable with a long TTL and the content after as non-cacheable or short TTL.

**Why:** Anthropic's prompt caching works by hashing the prefix of the system prompt. If the prefix is identical across requests, the cached version is reused and the cost of processing those tokens drops by ~90%. By keeping all static content at the start and all session-specific content at the end, every user of the same OpenCode version shares the same cache prefix, making the cache maximally effective.

---

### Task 2.2 — AGENTS.md moved to messages array

**File to modify:** Wherever AGENTS.md content is currently injected into the prompt.

**What to change:** If AGENTS.md content is currently part of the system parameter in the API call, move it to the messages array instead. It should be injected as a `<system-reminder>` tagged block in the first or second message of the conversation, not in the system parameter.

The format should be:
```
<system-reminder>
[contents of AGENTS.md here]
</system-reminder>
```

This message should appear in the messages array as a user-role message immediately before the first actual user message, or as a system-role injection if the SDK supports it. The key constraint: it must NOT be in the `system` parameter of the API call.

**Why:** If AGENTS.md is in the system parameter, every user with a different AGENTS.md has a unique system prompt. This means no two users share a cache prefix, making the global prompt cache useless. Moving AGENTS.md to the messages array preserves the shared static system prompt prefix, allowing all users to share the cache. This is how Claude Code achieves global prompt caching despite every project having a different AGENTS.md.

---

### Task 2.3 — Global user-level AGENTS.md

**File to modify:** The AGENTS.md loading code (wherever the current project AGENTS.md is read from disk).

**What to change:** Before loading the project-level AGENTS.md, check for and load `~/.opencode/AGENTS.md` if it exists. Inject it as a `<system-reminder>` block before the project-level AGENTS.md block. The order of injection should be: global user context first, then project context, so that project-specific instructions can override global ones.

Create `~/.opencode/AGENTS.md` if it does not exist during first run, with a comment explaining its purpose:
```markdown
# Global OpenCode Context
# This file is loaded for every project and every session.
# Use it for personal preferences, coding style, preferred libraries,
# and any context that applies across all your projects.
# Project-specific context goes in the project's AGENTS.md instead.
```

**Why:** Developers have personal preferences (preferred libraries, coding style, communication preferences) that should apply across all projects. Without a global context file, they have to repeat this in every project's AGENTS.md or re-explain it every session.

---

### Task 2.4 — Subdirectory AGENTS.md auto-loading

**File to modify:** The file read/edit tool handler.

**What to change:** When any file read or edit tool call is made, extract the directory of the target file. Check if that directory contains an `AGENTS.md` file. If it does and it has not already been injected in the current session, inject its contents as a `<system-reminder>` block in the next model message.

Maintain a set of already-injected directory paths per session to avoid re-injecting the same directory's context multiple times.

The injection should only trigger for AGENTS.md files below the project root — do not load system-level or home-directory AGENTS.md files via this mechanism (those are handled by Task 2.3).

**Why:** Different subsystems in a codebase often have different conventions. An auth module might have specific security rules. A data migration directory might have specific safety requirements. By loading directory-scoped AGENTS.md automatically when entering that directory, the agent gets relevant context exactly when it is needed without polluting the entire session with all context upfront.

---

### Task 2.5 — Path-scoped rules directory

**New directory to create:** `.opencode/rules/` in project root.

**New behavior to implement:**

1. On session start, scan `.opencode/rules/` for `.md` files.
2. Each rules file may have YAML frontmatter with a `paths` field containing glob patterns:
   ```markdown
   ---
   paths:
     - "**/*.py"
     - "src/auth/**"
   ---
   # Python-specific rules
   Always use type hints. Never use `assert` for runtime checks.
   ```
3. When a file read or edit tool call targets a path matching a rule's `paths` patterns, inject that rule as a `<system-reminder>` block.
4. Re-inject the rule on every turn where a matching file is accessed (not just the first time), but deduplicate within a single turn.
5. Rules files without a `paths` field are loaded at session start as global rules (equivalent to AGENTS.md additions).

**Why:** Path-scoped rules provide context-specific instructions at exactly the moment they are relevant. A Python style rule should not appear in the context of a session working only on TypeScript files. This precision reduces context noise and improves adherence to rules because they appear adjacent to the relevant code.

---

### Task 2.6 — Session exit summary

**File to modify:** Session lifecycle / shutdown handler.

**New behavior:**

1. When a session ends (user exits, session times out, or `/exit` is called), and the session contained at least 3 turns, make one final API call to generate a session summary.
2. Use this prompt for the summary call:
   ```
   Summarize this coding session in ≤200 words for future reference. Include:
   - What was worked on (files, features, bugs)
   - Key decisions made and why
   - What was completed and what was left unfinished
   - Any gotchas, constraints, or important discoveries
   - Current state of any in-progress work

   Be specific. Use file names, function names, and concrete details.
   This summary will be injected at the start of the next session for this project.
   Output only the summary, no preamble.
   ```
3. Write the result to `.opencode/last-session.md` in the project root (gitignored by default — add to `.gitignore` if not present).
4. On next session start for the same project, if `.opencode/last-session.md` exists and is less than 7 days old, inject its contents as a `<system-reminder>` block with a header: `## Previous session context`.

**Why:** The single most common friction in multi-session coding work is re-explaining context at the start of each session. A one-turn summary on exit eliminates this. The 7-day TTL prevents stale context from being injected for old sessions.

---

### Task 2.7 — AGENTS.md update suggestion instruction

**File to modify:** Same primary system prompt file.

**What to add:** In the section about AGENTS.md or project context:

```
## Maintaining project context

When you discover something about the project that should persist across sessions — a convention, an architectural decision, a non-obvious constraint, a gotcha — say so explicitly:

"This seems worth adding to AGENTS.md: [specific note]. Should I add it?"

Do NOT add to AGENTS.md without asking. Do ask proactively when you learn something worth preserving.

Examples of things worth suggesting:
- "All database queries must go through the repository layer, never direct SQL"
- "The payment module uses a specific retry strategy — see PaymentService.retry()"
- "Tests use a custom assertion library in test/helpers/assert.ts, not Jest's built-in"
```

**Why:** AGENTS.md is only useful if it stays current. Without an active instruction to suggest updates, the model treats AGENTS.md as read-only and valuable institutional knowledge is lost between sessions.

---

## PHASE 3 — COMPACTION IMPROVEMENTS
*Upgrades to OpenCode's existing compaction system. Locate the compaction code first.*

**Setup:** Before starting Phase 3, locate the compaction implementation by searching for "compact" or "compaction" in the codebase. Identify:
- Where the compaction trigger fires (the token threshold check)
- The compaction prompt that is currently used
- Where the compacted summary is written back into the session

---

### Task 3.1 — Compaction circuit breaker

**File to modify:** The compaction trigger/loop code.

**What to add:** Add a consecutive failure counter at the session level. Wrap the compaction call in try/catch. On failure, increment the counter. On success, reset it to zero. If the counter reaches 3, do NOT retry — instead surface a hard error to the user:

```
"Context compaction has failed 3 times consecutively. The session is approaching its context limit.
Options:
1. Start a new session (your work is saved in files)
2. Type /compact-force to attempt compaction one more time
3. Continue without compaction (session may fail when context is full)"
```

After displaying this message, disable automatic compaction for the remainder of the session. Only re-enable if the user explicitly invokes `/compact-force`.

**Why:** Without a circuit breaker, a broken compaction prompt causes an infinite retry loop. This was responsible for 250,000 wasted API calls per day across Claude Code's user base before they added this fix. The cost is not hypothetical — it happens in production at scale.

---

### Task 3.2 — Structured compaction prompt

**File to modify:** Wherever the current compaction prompt string is defined.

**What to replace it with:**

```
You are a session compaction agent. Your job is to summarize a coding session's conversation history into a structured handoff document that allows a fresh agent instance to continue the work without losing critical context.

The summary must be ≤2000 words and must include every section below. Do not omit sections even if they seem empty — write "None" for empty sections.

## Active task
What is currently being worked on? Be specific: file names, function names, the exact goal.

## Completed work (this session)
What was finished? List with file paths and a one-line description of each change.

## Commands and code executed
Any shell commands run, scripts executed, or code evaluated. Include the commands verbatim if they modified state.

## Unresolved issues
Any errors, failing tests, or problems that were encountered but not yet solved. Include error messages verbatim.

## Dead ends
Approaches that were tried and abandoned, and why. This prevents the next agent from repeating the same mistakes.

## Decisions made
Any architectural or implementation decisions made during the session, and the reasoning.

## Current file states
For any file that was in the middle of being edited when this compaction triggered: describe its current state and what still needs to be done to it.

## Next steps
Ordered list of what should happen next to continue the work.

## Important constraints discovered
Any gotchas, non-obvious constraints, or project-specific rules discovered during the session.

Output only the structured summary. No preamble. No "Here is the summary:" header.
```

**Why:** The quality of the compaction summary directly determines whether the agent can continue coherently after compaction. A generic "summarize the conversation" prompt loses critical details — error messages, commands run, dead ends explored. The structured prompt ensures nothing operationally critical is dropped.

---

### Task 3.3 — AGENTS.md re-injection after compaction

**File to modify:** The post-compaction session resume code — wherever the session is restored from a compaction summary.

**What to add:** Immediately after the compaction summary is written into the session and before the next model turn begins, re-read AGENTS.md from disk and re-inject it as a fresh `<system-reminder>` block. Do not rely on the compaction summary having preserved the AGENTS.md content.

Log to the session (visible in verbose mode): `[compaction] AGENTS.md re-injected from disk`.

**Why:** Compaction summaries may or may not preserve AGENTS.md content depending on how the compaction agent handles it. Making re-injection explicit and unconditional guarantees that project context always survives compaction. Without this, sessions that compact lose their project conventions and start behaving inconsistently.

---

### Task 3.4 — MicroCompact: local stale output pruning

**File to modify:** The message array management code — wherever tool call results are stored in the conversation.

**New behavior to add:** Before triggering full compaction (and also on every turn where context usage exceeds 60%), run a local pruning pass over the messages array:

1. Find all tool call result messages in the array.
2. For each tool result, check if the same tool was called on the same target (same file path, same command, same query) in a later message.
3. If yes, replace the earlier result's content with: `[content pruned — superseded by later call at turn N]`
4. For file listing results (LS tool, directory listing) older than 10 turns, replace with: `[directory listing pruned — re-run if needed]`
5. For search results (grep, glob) older than 15 turns, replace with: `[search results pruned — re-run if needed]`

This runs locally with zero API calls. Log the number of tokens pruned in verbose mode.

**Why:** In a 50-turn session, file listings and search results from turn 5 are almost certainly stale by turn 30 and consume context tokens with zero value. Local pruning before full compaction captures the easy wins cheaply. Claude Code's 84% token reduction in 100-turn evaluations comes partly from this layer.

---

## PHASE 4 — PLAN MODE UPGRADE
*Upgrades to OpenCode's existing plan mode. Locate the plan mode implementation first.*

**Setup:** Before starting Phase 4, locate the plan mode code by searching for "plan" or "planMode" in the codebase. Identify:
- Where the plan mode toggle is stored (the flag or state variable)
- Where it is checked (the tool permission logic)
- The current plan mode prompt addition

---

### Task 4.1 — Tool-level write tool removal in plan mode

**File to modify:** The tool list assembly code — wherever the list of available tools is constructed for the API call.

**What to change:** Currently plan mode likely sets a flag that prevents tool execution after the fact. Change this so that when plan mode is active, write tools are removed from the tool list sent to the API entirely.

Write tools to remove in plan mode:
- Any file write/create/edit tool
- Any file delete tool  
- Any bash/shell execution tool
- Any git commit/push tool
- Any tool that creates external resources (API calls that create or modify)

Read-only tools to keep in plan mode:
- File read tool
- Directory listing tool
- Search/grep/glob tools
- Git status/log/diff read tools
- Any tool that only reads state

**Why:** There is a critical behavioral difference between "the tool is blocked after being called" and "the tool does not exist." When the tool exists but is blocked, the model attempts to call it, receives an error, and spends turns on error recovery. When the tool does not exist in the tool list, the model never attempts to call it — it behaves as a researcher because that is all it can do. This produces better plans and eliminates wasted turns on blocked write attempts.

---

### Task 4.2 — EnterPlanMode and ExitPlanMode as tools

**New tools to create:** Add two new tools to OpenCode's tool registry.

`enter_plan_mode`:
```
Name: enter_plan_mode
Description: Switch to plan mode. In plan mode, all file write, delete, and execution tools are disabled. You can only read, search, and reason. Use this when you need to explore and design before making changes.
Parameters: none
Side effect: Sets plan mode active, removes write tools from subsequent turns
```

`exit_plan_mode`:
```
Name: exit_plan_mode  
Description: Exit plan mode and return to normal execution mode. This is the explicit commit point — call this only when the user has reviewed and approved the plan. After calling this, write tools become available again.
Parameters:
  - plan_summary: string (required) — Brief summary of the plan that was developed, for the session record
Side effect: Sets plan mode inactive, restores write tools for subsequent turns
```

Wire the keyboard shortcut (Tab) to call these tools internally — the shortcut is a convenience wrapper, not a separate code path.

**Why:** Making plan mode transitions observable tool calls enables hooks to fire on them (a PreToolUse hook on `exit_plan_mode` can require explicit user confirmation before execution resumes), enables transcript logging of when plan mode was entered and exited, and enables external systems monitoring via Channels to observe the planning phase.

---

### Task 4.3 — Full plan mode identity section in prompt

**File to modify:** The prompt assembly code. Add a new named section: `PLAN_MODE_IDENTITY`.

**What to add:** When plan mode is active, inject this section into the system prompt (replacing or supplementing the current plan mode constraint line):

```
## Current mode: Research and Planning

You are currently in research and planning mode. Your role is that of an architect and analyst, not an implementer.

Your only job right now is to:
1. Explore the codebase thoroughly to understand the full picture before proposing anything
2. Identify all the places that will need to change
3. Identify risks, dependencies, and non-obvious constraints
4. Produce a clear, ordered, specific implementation plan that another agent could execute

You do NOT have access to write, edit, or execute anything. This is not a limitation — it is the correct mode for producing high-quality plans. Attempting to implement while still discovering requirements produces bad results.

A good plan includes:
- Every file that needs to change, with a description of what changes
- The exact order changes should be made (some changes have dependencies)
- Tests that need to be written or updated
- Any migrations, schema changes, or config changes required
- Estimated risk level for each change (low/medium/high)

When your plan is complete, present it and wait for the user to review and approve before any implementation begins.
```

**Why:** Telling the model "you cannot write files" produces a frustrated executor. Telling the model "your role right now is architect and analyst" produces a thoughtful planner. The identity shift in the prompt produces qualitatively better plans by changing what the model believes its job is.

---

## PHASE 5 — SETTINGS HIERARCHY

---

### Task 5.1 — Local gitignored settings file

**New file to support:** `.opencode/settings.local.json` in project root.

**What to implement:**
1. In the config loading code, after loading `.opencode/settings.json` (project config) and before applying user global config, check for `.opencode/settings.local.json`.
2. If it exists, load it and merge it with project config, with local settings taking precedence over project settings for any key that appears in both.
3. Add `.opencode/settings.local.json` to `.gitignore` automatically when first created (check first that it is not already ignored).
4. Create a CLI command `opencode config local` that opens this file for editing.
5. When initializing a new project (`opencode init`), create an empty `.opencode/settings.local.json` with a comment explaining its purpose.

**Schema:** Same schema as the main settings file. Any setting that can be set globally can be set locally.

**Why:** Developers need per-machine overrides — local paths to MCP servers, personal model preferences, debug flags — that should never be committed to the repo. Without a gitignored local settings layer, developers either commit personal config (polluting the repo) or maintain manual git ignores on the main settings file (fragile and error-prone).

---

### Task 5.2 — Explicit documented settings resolution order

**File to modify:** The config loading code.

**What to add:** Add a comment block at the top of the config loading function that explicitly documents the resolution order:

```typescript
/**
 * Settings resolution order (highest priority first):
 * 1. CLI flags (passed at runtime, override everything)
 * 2. Environment variables (OPENCODE_* prefix)
 * 3. Project local settings (.opencode/settings.local.json — gitignored, per-machine)
 * 4. Project settings (.opencode/settings.json — committed, shared with team)
 * 5. User global settings (~/.opencode/settings.json — applies to all projects)
 *
 * For MCP server configuration: most specific wins (project local > project > user global).
 * For hooks: all hooks from all levels fire (additive, not overriding).
 * For model selection: highest priority source that specifies a model wins.
 *
 * Never change this order without updating this comment and the documentation.
 */
```

Also enforce this order in the actual merging logic if it is not already correct.

**Why:** Without an explicit documented resolution order, the behavior is implementation-dependent and changes unpredictably when settings are added or modified. Developers cannot predict which setting will win. Explicit documentation and enforcement make the system predictable and debuggable.

---

## PHASE 6 — MCP CLIENT IMPROVEMENTS

---

### Task 6.1 — Tool schema caching per session

**File to modify:** The MCP client tool schema loading code.

**What to change:** After tool schemas are loaded from MCP servers at session start, serialize them once to the JSON format required by the API, and cache the serialized result in memory. On every subsequent API call within the same session, use the cached serialization rather than re-serializing.

Invalidate the cache only if:
- An MCP server disconnects and reconnects
- A tool's schema is explicitly refreshed (if there is a refresh mechanism)
- The session ends

Add a session-level counter for cache hits. Log the hit count in verbose mode at session end.

**Why:** Tool schemas are large JSON structures. With 20+ MCP tools configured, re-serializing on every turn adds measurable overhead. This is a pure performance optimization with zero behavioral impact.

---

### Task 6.2 — Category-based lazy tool loading (v1)

**File to modify:** The MCP tool loading and activation code.

**What to implement:** Group MCP tools into categories based on their server name and tool name patterns. Define a default category map:

```typescript
const TOOL_CATEGORIES = {
  filesystem: ["read", "write", "edit", "delete", "list", "glob", "search"],
  git: ["commit", "push", "pull", "branch", "merge", "status", "diff", "log"],
  web: ["fetch", "browse", "search", "scrape", "request"],
  database: ["query", "execute", "migrate", "schema"],
  testing: ["test", "run", "coverage", "benchmark"],
  terminal: ["bash", "exec", "shell", "run"],
};
```

At session start, only activate tools from categories that are:
- Mentioned in AGENTS.md
- Used in the last session summary (from `.opencode/last-session.md`)
- Explicitly enabled in settings

All tools remain available for activation during the session — if the model attempts to call a tool from an inactive category, activate that category and retry. Log the activation in verbose mode.

**Why:** Loading 50 MCP tool schemas at startup can add 30,000–50,000 tokens to every request's overhead. Lazy loading by category reduces this to the tools actually needed for the current project type. A frontend project likely never needs database tools; a backend project likely never needs design tools.

---

## PHASE 7 — AGENT SYSTEM IMPROVEMENTS

---

### Task 7.1 — Per-agent model specification in YAML

**File to modify:** The agent YAML/frontmatter parser and the agent session spawning code.

**What to add to agent YAML schema:**
```yaml
model: claude-haiku-4-5-20251001  # optional, defaults to session model if not specified
```

**What to implement:** When spawning a session for a named agent, check if the agent definition includes a `model` field. If it does, use that model for all API calls within that agent's session. If it does not, inherit the session's configured model.

**Validation:** On agent definition load, validate that the specified model string is a recognized model identifier. Warn (but do not error) if the model is unrecognized — allow it through in case it is a new model the validation list has not been updated for.

**Why:** Different tasks warrant different models. A quick codebase exploration task is well-suited to a fast, cheap model. An architectural design task benefits from a more capable model. Allowing per-agent model specification enables cost-efficient agent orchestration — use the cheapest model that is sufficient for each task type.

---

### Task 7.2 — Per-agent tool allowlist in YAML

**File to modify:** The agent YAML/frontmatter parser and the tool list assembly code.

**What to add to agent YAML schema:**
```yaml
allowed-tools:
  - read_file
  - search_files
  - list_directory
  - bash  # if bash is needed, list it explicitly
```

**What to implement:** When the `allowed-tools` field is present in an agent definition, filter the tool list sent to the API to only include tools whose names match the allowlist. Built-in tools (read, search, list) follow the same allowlist — if they are not in the list, they are not available to that agent.

If `allowed-tools` is absent, the agent inherits all tools available in the parent session (current behavior).

**Enforcement:** The filtering must happen at the API call level (the tool list sent to the model), not just at the execution level. The model should not see tools it is not allowed to use.

**Why:** Principle of least privilege. An agent defined as "research only" should not have access to file write tools even if it is invoked by an orchestrator that does. Restricting the tool list at the API level prevents accidental writes from research agents and makes the security boundary explicit.

---

### Task 7.3 — Background agent support

**File to modify:** Agent spawning code and session management.

**What to add to agent YAML schema:**
```yaml
background: true  # runs without blocking the main session
```

**What to implement:**
1. When `background: true` is set, spawn the agent session in a separate process or async context that does not block the main session's input loop.
2. Assign the background agent a visible identifier (e.g., `bg-1`, `bg-2`).
3. Show a status indicator in the TUI when background agents are running (e.g., `[2 background agents running]` in the status bar).
4. Add a `/agents` command that lists running background agents with their current status and turn count.
5. Add `/agent-kill <id>` to terminate a background agent.
6. When a background agent completes, notify the user in the TUI: `[bg-1 complete: <one-line summary of result>]`.
7. Background agent results are appended to `.opencode/agent-results/<timestamp>-<name>.md` for review.

**Why:** Background agents enable parallel work — the user can continue working in the main session while research agents, test runners, or monitoring agents run concurrently. Without background support, all agent work is blocking and the user cannot interact with the main session during long agent runs.

---

## PHASE 8 — CONTEXT WINDOW VISIBILITY

---

### Task 8.1 — Real-time context usage in TUI

**File to modify:** The TUI status bar / header component, and the API call handler where responses are processed.

**What to implement:**
1. After every API response, read the `usage` field from the response: `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`.
2. Maintain a session-level running total of all input tokens consumed.
3. Look up the context limit for the current model:
   ```typescript
   const MODEL_CONTEXT_LIMITS: Record<string, number> = {
     "claude-opus-4-6": 1_000_000,
     "claude-sonnet-4-6": 1_000_000,
     "claude-haiku-4-5-20251001": 200_000,
     // add others as needed
   };
   ```
4. Display in the TUI status bar: `Context: 45,230 / 200,000 (22%)`
5. Change display color based on usage percentage:
   - 0–60%: normal color
   - 61–80%: yellow
   - 81–95%: orange  
   - 96%+: red, and add a warning message: "Approaching context limit — compaction will trigger soon"
6. Also display per-turn token cost: `+1,240 tokens this turn`

**Why:** Without context usage visibility, developers are surprised by context exhaustion and compaction. Seeing the context fill up allows proactive management — starting a new session before exhaustion, or explicitly triggering compaction at a convenient point rather than having it trigger mid-task.

---

### Task 8.2 — Per-turn token cost breakdown

**File to modify:** The TUI message rendering code.

**What to add:** Below each assistant response (toggled visible with verbose mode from Task 8.3), show:
```
tokens: 1,240 in / 380 out | cache: 890 read / 0 created | est. cost: $0.0021
```

The cost estimate should use current Anthropic pricing for the active model. Store pricing as constants:
```typescript
const MODEL_PRICING = {
  "claude-sonnet-4-6": { input: 3.00, output: 15.00, cache_read: 0.30, cache_write: 3.75 }, // per million tokens
  // add others
};
```

Display the cumulative session cost in the status bar alongside the context usage.

**Why:** Cost visibility enables cost-conscious usage. Developers who can see that a verbose compaction prompt costs $0.08 per invocation will make different decisions than developers who have no visibility. This is especially important for teams managing API budgets.

---

### Task 8.3 — Verbose mode toggle (Ctrl+O)

**File to modify:** TUI input handler and the various points in the codebase where debug information is available but currently suppressed.

**What to implement:**
1. Add `Ctrl+O` as a keyboard shortcut that toggles verbose mode on/off. Display `[verbose mode ON/OFF]` in the TUI when toggled.
2. When verbose mode is ON, additionally display:
   - The full system prompt being sent (collapsed to first 200 chars with expand option)
   - Complete tool call payloads before execution
   - Raw API response headers (including cache status)
   - Per-turn token breakdown (from Task 8.2, shown inline rather than requiring Ctrl)
   - Once hooks are implemented: stdout/stderr from hook script execution
   - Extended thinking content if the model produces it
3. When verbose mode is OFF, suppress all of the above (current behavior).
4. Persist verbose mode preference in local settings (`.opencode/settings.local.json`).

**Why:** Verbose mode is essential for debugging prompt issues, understanding why the model is behaving a certain way, verifying that cache is working, and debugging hook scripts. Without it, debugging requires adding console.log statements to the source code.

---

## PHASE 9 — HOOKS SYSTEM (Core)
*This is the most complex phase. It builds new infrastructure but is the foundation for the most valuable features.*

**Implementation order within this phase is strict — do not skip ahead.**

---

### Task 9.1 — Hook type definitions and registry

**New file to create:** `src/hooks/types.ts` (or equivalent location in OpenCode's source structure).

**What to define:**

```typescript
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionStart"
  | "SessionEnd"
  | "PreCompact"
  | "StopFailure";
// Note: Events requiring subagents/worktrees/teams are excluded here —
// they are added in later phases when those features exist.

export type HookHandlerType = "command" | "http";
// "prompt" and "agent" handler types are added in a later phase.

export type PermissionDecision = "allow" | "deny" | "ask";

export interface HookContext {
  event: HookEvent;
  sessionId: string;
  projectPath: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: unknown;
  toolError?: string;
  userPrompt?: string;
  timestamp: number;
  turnNumber: number;
  env: Record<string, string>;
}

export interface HookResult {
  // PreToolUse only:
  permissionDecision?: PermissionDecision;
  denyReason?: string;
  updatedInput?: Record<string, unknown>;
  // PostToolUse only:
  additionalContext?: string;
  // Stop only:
  forceContinue?: boolean;
  forceContinueReason?: string;
  // UserPromptSubmit only:
  injectContext?: string;
}

export interface HookDefinition {
  event: HookEvent;
  type: HookHandlerType;
  async?: boolean;        // if true, hook runs non-blocking (for logging/notification hooks)
  scope: "global" | "project" | "local";
  matcher?: {
    toolName?: string;    // only fire for this tool name (PreToolUse, PostToolUse)
    toolNamePattern?: string; // regex pattern for tool name matching
  };
  // Handler-specific:
  command?: string;       // for type: "command" — shell command to execute
  url?: string;           // for type: "http" — URL to POST to
  timeoutMs?: number;     // default 30000
}
```

---

### Task 9.2 — Hook configuration in settings

**File to modify:** OpenCode's settings schema and config loading.

**What to add to settings schema:**
```typescript
hooks?: HookDefinition[];
```

This field should be valid in all three settings levels:
- `~/.opencode/settings.json` (global)
- `.opencode/settings.json` (project)
- `.opencode/settings.local.json` (local)

Hooks from all levels are collected and merged — all registered hooks for a given event fire (additive, not overriding). Higher-scope hooks do not prevent lower-scope hooks from firing.

Add a `opencode hooks list` CLI command that shows all currently registered hooks, their source (global/project/local), and their event+matcher.

---

### Task 9.3 — Hook runner: command handler

**New file to create:** `src/hooks/runner.ts`

**What to implement:** A function `runHooks(event: HookEvent, context: HookContext, hooks: HookDefinition[]): Promise<HookResult>` that:

1. Filters hooks to those matching the event and any tool name matchers.
2. Separates async hooks (fire-and-forget) from sync hooks (must complete before proceeding).
3. Runs all sync hooks for the event in parallel (not sequentially).
4. For each `command` type hook:
   - Serialize the `HookContext` to JSON
   - Spawn the command as a child process with the JSON piped to stdin
   - Set environment variables: `OPENCODE_SESSION_ID`, `OPENCODE_PROJECT_PATH`, `OPENCODE_TOOL_NAME` (if applicable)
   - Wait for the process to exit (up to `timeoutMs`)
   - Read stdout as JSON — this is the `HookResult`
   - Read stderr — log it in verbose mode
   - If the process exits non-zero and is a PreToolUse hook, treat as `deny`
   - If the process times out, treat as `allow` and log a timeout warning
5. Aggregate results from all parallel hooks:
   - If any hook returns `deny`, the aggregated result is `deny`
   - If any hook returns `updatedInput`, use the last non-null `updatedInput`
   - Concatenate all `additionalContext` values with newlines
   - If any hook returns `forceContinue: true`, the aggregated result has `forceContinue: true`
6. Fire async hooks in the background — do not await, do not aggregate their results.

---

### Task 9.4 — Hook runner: HTTP handler

**File to modify:** `src/hooks/runner.ts`

**What to add:** Handling for `http` type hooks alongside the command handler:

For each `http` type hook:
1. POST the `HookContext` as JSON to the configured URL.
2. Set headers: `Content-Type: application/json`, `X-OpenCode-Session: <sessionId>`, `X-OpenCode-Event: <event>`.
3. Wait for the response (up to `timeoutMs`).
4. Parse the response body as JSON — this is the `HookResult`.
5. On HTTP error (4xx, 5xx) or network failure:
   - For PreToolUse hooks: treat as `allow` (fail open) and log a warning. This prevents a broken hook server from blocking all tool execution.
   - For other hooks: log and continue.
6. On timeout: treat as `allow` and log a timeout warning.

**Why fail-open on HTTP error for PreToolUse:** A hook service that is down should not block development. Fail-open with visible warnings is safer than silently blocking all tool execution. Teams that need fail-closed behavior can run the hook service on localhost where failures are less likely.

---

### Task 9.5 — Wire hooks into tool execution

**File to modify:** The tool execution dispatcher — wherever tool calls from the model are received and routed to tool implementations.

**What to add:**

Before tool execution (PreToolUse):
```typescript
const hookResult = await runHooks("PreToolUse", {
  event: "PreToolUse",
  toolName: call.name,
  toolInput: call.input,
  // ... other context fields
}, registeredHooks);

if (hookResult.permissionDecision === "deny") {
  return { error: `Blocked by hook: ${hookResult.denyReason ?? "no reason given"}` };
}

if (hookResult.updatedInput) {
  call.input = hookResult.updatedInput; // rewrite tool input
}
```

After successful tool execution (PostToolUse):
```typescript
const hookResult = await runHooks("PostToolUse", {
  event: "PostToolUse",
  toolName: call.name,
  toolInput: call.input,
  toolResult: result,
  // ...
}, registeredHooks);

if (hookResult.additionalContext) {
  result = `${result}\n\n[Hook feedback]: ${hookResult.additionalContext}`;
}
```

After failed tool execution (PostToolUseFailure):
```typescript
await runHooks("PostToolUseFailure", {
  event: "PostToolUseFailure",
  toolName: call.name,
  toolInput: call.input,
  toolError: error.message,
  // ...
}, registeredHooks);
// PostToolUseFailure hooks are observe-only — their result is ignored
```

---

### Task 9.6 — Wire hooks into session lifecycle

**File to modify:** Session start, session end, and the model response handler.

**Session start:** Fire `SessionStart` hooks after session initialization, before the first user turn. These are observe-only.

**Session end:** Fire `SessionEnd` hooks before session cleanup. These are observe-only.

**Stop (model turn complete):** After the model completes a turn with no more tool calls, fire `Stop` hooks. If any hook returns `forceContinue: true`, inject a new user turn with the content: `[System: Continue working. ${hookResult.forceContinueReason ?? ""}]` and resume the model loop.

**PreCompact:** Fire `PreCompact` hooks before compaction is triggered. These are observe-only (for logging/notification).

**StopFailure:** If the session ends in an error state (unhandled exception, context exhaustion without successful compaction, etc.), fire `StopFailure` hooks. These are observe-only and intended for alerting/recovery automation.

**UserPromptSubmit:** Before sending the user's message to the model, fire `UserPromptSubmit` hooks. If any hook returns `injectContext`, append it to the system prompt for that turn as a `<system-reminder>` block.

---

### Task 9.7 — Hook configuration documentation

**New file to create:** `.opencode/hooks-example.json` in the project template (shown when running `opencode init`).

**Contents:**
```json
{
  "hooks": [
    {
      "comment": "Block writes to production config files",
      "event": "PreToolUse",
      "type": "command",
      "matcher": { "toolName": "write_file" },
      "command": "opencode-hook-check-path",
      "async": false
    },
    {
      "comment": "Run linter after any file edit (non-blocking)",
      "event": "PostToolUse",
      "type": "command",
      "matcher": { "toolNamePattern": "^(write|edit)_file$" },
      "command": "npm run lint --silent 2>&1 | head -20",
      "async": true
    },
    {
      "comment": "Notify via webhook when agent stops",
      "event": "Stop",
      "type": "http",
      "url": "https://hooks.example.com/agent-complete",
      "async": true
    },
    {
      "comment": "Prevent agent from running without test suite passing",
      "event": "UserPromptSubmit",
      "type": "command",
      "command": "scripts/check-tests-passing.sh",
      "async": false
    }
  ]
}
```

Include inline comments explaining:
- What each hook event fires on
- The JSON format for HookContext (stdin to command hooks)
- The JSON format for HookResult (stdout from command hooks)
- How permission decisions work (allow/deny/ask)
- How input rewriting works (updatedInput field)

---

## PHASE 10 — TOOL DESCRIPTIONS
*This phase requires access to OpenCode's tool definition files. Locate them first.*

**Setup:** Before starting Phase 10, find all tool definition files by searching for `Tool.define` or equivalent. List every tool and its current description.

---

### Task 10.1 — Audit current tool descriptions

For each tool in OpenCode's tool registry, document:
1. Current description (the string passed to the model)
2. Current parameter descriptions
3. Known failure modes (cases where the model uses this tool incorrectly)

This audit is a prerequisite for Tasks 10.2–10.4. Do not skip it.

---

### Task 10.2 — Add negative constraint framing to all tools

**File to modify:** Each tool definition file.

**Pattern to apply to every tool's description:**

Add a "When NOT to use this tool" section to each tool description, with explicit alternatives:

For the file read tool:
```
Do NOT use this tool to:
- Read an entire large file when you only need specific lines (use line range parameters instead)
- Verify whether a file exists (use the file existence check tool or handle the not-found error)
- Search for content across files (use the search/grep tool instead)
```

For the bash/shell execution tool:
```
Do NOT use this tool to:
- Search for text in files (use the grep/search tool — it is faster and handles binary files correctly)
- Find files by name or pattern (use the glob/find tool)
- Read file contents (use the file read tool — it handles encoding correctly)
- List directory contents (use the directory list tool)
Use bash only for operations that cannot be accomplished with the dedicated tools above.
```

For the file write tool:
```
Do NOT use this tool to:
- Modify an existing file (use the file edit tool — it handles partial updates correctly)
- Create a file you have not yet read in this session (read it first to confirm it does not already exist or contains content you should preserve)
```

Apply this pattern — what it is not for, with explicit alternatives — to every tool.

---

### Task 10.3 — Add failure mode inoculation to all tools

**File to modify:** Each tool definition file.

**Pattern to apply:** For each known failure mode (from the audit in Task 10.1), add a brief inoculation in the tool description that describes the failure before the model encounters it:

For the file edit tool:
```
Common mistakes to avoid:
- Editing a file based on what you think it contains rather than what you have read. Always read the file first in the same session.
- Making edits that depend on a specific line number when the file may have changed. Use content-based matching, not line numbers.
- Replacing a pattern that appears multiple times in the file when you only intend to change one occurrence.
```

For the bash tool:
```
Common mistakes to avoid:
- Running `cat large-file.txt` — this dumps the entire file to stdout and wastes context. Use the file read tool with line ranges.
- Using `ls -la` for directory inspection — the directory list tool produces structured output that is easier to process.
- Chaining commands with && without considering what happens if the first command fails.
- Running a process that waits for input — always use non-interactive flags or provide input via piping.
```

---

### Task 10.4 — Add decision trees for ambiguous tool selection

**File to modify:** Each tool definition file where tool selection is ambiguous.

For the bash vs. dedicated tools decision:
```
Decision rule for bash vs. dedicated tools:
- Is there a dedicated tool that does what you need? Use the dedicated tool.
- Dedicated tools: file read, file write, file edit, file delete, search/grep, glob, directory list, git operations.
- Only use bash when the operation genuinely requires shell execution: running build commands, installing packages, executing scripts, starting servers, running tests.
- When in doubt: dedicated tool first, bash as fallback.
```

For the search vs. read decision:
```
Decision rule for search vs. read:
- Do you know the exact file and need its content? Use read.
- Do you know what you are looking for but not where it is? Use search/grep.
- Do you know the file name pattern but not the full path? Use glob.
- Are you exploring an unfamiliar codebase? Use search and glob before reading individual files.
```

---

## PHASE 11 — FORMAL TASK COMPLETION SIGNAL

---

### Task 11.1 — Task completion state

**File to modify:** The model response processing code — wherever the decision is made that the model has finished its current response.

**What to add:** Distinguish between two types of turn endings:

1. **Turn complete, task ongoing:** The model stopped generating but may have more work to do (it used tools, it is mid-task, it asked a question).
2. **Task complete:** The model stopped generating with no pending tool calls, no trailing questions, and no incomplete work.

**Heuristic for task completion detection:** A turn is task-complete if:
- The final message contains no tool calls
- The final message does not end with a question directed at the user
- The final message does not contain phrases indicating ongoing work ("working on", "next I will", "still need to")
- The model has not been in an error recovery state in the last 2 turns

**What to do when task-complete is detected:**
1. Mark the session turn with a `completed` status in the session state.
2. Display a visible completion indicator in the TUI (a checkmark or distinct color on the final message).
3. Fire `Stop` hooks (Task 9.6 wires this up).
4. Update the session summary file (`.opencode/last-session.md`) with a brief note of what was completed.

**Why:** The formal completion signal is the foundation for automation — CI jobs that wait for agent completion, Dispatch jobs that poll for status, and Stop hooks that can trigger downstream workflows. Without it, external systems cannot reliably know when the agent is done.

---

## PHASE 12 — GIT WORKTREE ISOLATION

---

### Task 12.1 — Core worktree creation

**New file to create:** `src/worktree/manager.ts` (or equivalent)

**What to implement:**

A `WorktreeManager` class with the following methods:

`create(name: string, baseBranch?: string): Promise<WorktreeInfo>`
- Runs `git worktree add .opencode/worktrees/<name> -b worktree-<name> [baseBranch]`
- Creates the `.opencode/worktrees/` directory if it does not exist
- After creation, detects large directories (node_modules, .venv, dist, build, .next) and creates symlinks pointing to the main repo's copies instead of copying them
- Returns the worktree path and branch name
- Adds `.opencode/worktrees/` to `.gitignore`

`remove(name: string, force?: boolean): Promise<void>`
- Runs `git worktree remove .opencode/worktrees/<name>` 
- If `force` is false (default), only removes if the worktree has no uncommitted changes
- If `force` is true, runs `git worktree remove --force`

`list(): Promise<WorktreeInfo[]>`
- Returns all active worktrees with their name, path, branch, and whether they have uncommitted changes

`autoCleanup(name: string): Promise<void>`
- Called on session end for worktree sessions
- If the worktree has no commits ahead of the base branch, remove it automatically
- If it has commits, preserve it and notify the user

```typescript
interface WorktreeInfo {
  name: string;
  path: string;
  branch: string;
  baseBranch: string;
  hasChanges: boolean;
  sessionId?: string;
  createdAt: number;
}
```

---

### Task 12.2 — --worktree CLI flag

**File to modify:** The CLI argument parser and session initialization code.

**What to add:** A `--worktree <name>` flag (shorthand `-w`) that:
1. Creates a new worktree with the given name using WorktreeManager.create()
2. Sets the session's working directory to the worktree path
3. Registers an auto-cleanup hook on session end via SessionEnd hook
4. Stores the worktree info in the session state so it can be displayed in status

If the worktree name is omitted, generate one from the current timestamp: `wt-<YYYYMMDD-HHMM>`.

**Also add:** A `--worktree-branch <branch>` flag to specify which branch to base the worktree on (defaults to current branch).

---

### Task 12.3 — Worktree status in TUI

**File to modify:** The TUI status bar.

**What to add:** When a session is running in a worktree, display in the status bar:
```
[worktree: my-feature-branch] Context: 12% | $0.03
```

Also add a `/worktrees` command that lists all active worktrees with their sessions and status.

---

## PHASE 13 — SESSION CHECKPOINTING

---

### Task 13.1 — Checkpoint creation

**New file to create:** `src/checkpoints/manager.ts`

**What to implement:**

A `CheckpointManager` class:

`createCheckpoint(sessionId: string, turnNumber: number, reason: string): Promise<CheckpointInfo>`
- Creates `.opencode/checkpoints/<sessionId>/turn-<turnNumber>/`
- Copies all files that have been modified in the current session (track this list in session state) to the checkpoint directory, preserving relative paths
- Writes a `checkpoint.json` manifest with: sessionId, turnNumber, timestamp, reason, list of files included
- Keeps the last 10 checkpoints per session, deleting older ones

`restoreCheckpoint(sessionId: string, turnNumber: number): Promise<void>`
- Reads the checkpoint manifest
- Restores each file from the checkpoint to its original path
- Logs each restored file

`listCheckpoints(sessionId: string): Promise<CheckpointInfo[]>`
- Returns all checkpoints for the session, newest first

```typescript
interface CheckpointInfo {
  sessionId: string;
  turnNumber: number;
  timestamp: number;
  reason: string;
  files: string[];
}
```

---

### Task 13.2 — Automatic checkpoint triggering

**File to modify:** The tool execution dispatcher (same file as Task 9.5).

**What to add:** Before executing any tool that matches the following criteria, call `checkpointManager.createCheckpoint()`:

Trigger checkpoint before:
- Any file delete operation
- Any bash/shell command that contains: `rm`, `mv`, `dd`, `truncate`, `> ` (output redirect overwrite), `DROP`, `DELETE FROM`, `UPDATE` (SQL keywords in bash context)
- Any tool that writes more than 3 files in a single call
- Any git operation that modifies history: `git reset`, `git rebase`, `git push --force`

Do NOT checkpoint before:
- File reads
- Searches
- Git status/log/diff reads
- Individual file writes (the overhead is too high — checkpoint at higher-impact operations only)

Log in verbose mode: `[checkpoint created: turn-42, reason: "pre-delete", files: 3]`

---

### Task 13.3 — /restore command

**New command to add:** `/restore [turn-number]`

**Behavior:**
- With no argument: list available checkpoints for the current session
- With a turn number: restore files from that checkpoint, prompting for confirmation first
- Display: `Restoring 4 files to state from turn 42 (3 minutes ago). Proceed? [y/N]`
- After restore: display which files were restored and their sizes

---

## APPENDIX A — IMPLEMENTATION SEQUENCE SUMMARY

Execute phases in this order. Within each phase, execute tasks top to bottom.

| Phase | Tasks | Est. Time | Value |
|---|---|---|---|
| Phase 1 — Base prompt | 1.1–1.8 | 2 days | Immediate behavioral improvement |
| Phase 2 — Context & memory | 2.1–2.7 | 4 days | Cost reduction + session continuity |
| Phase 3 — Compaction | 3.1–3.4 | 3 days | Reliability + cost reduction |
| Phase 4 — Plan mode | 4.1–4.3 | 3 days | Correctness + token efficiency |
| Phase 5 — Settings | 5.1–5.2 | 1 day | Developer workflow |
| Phase 6 — MCP client | 6.1–6.2 | 2 days | Performance |
| Phase 7 — Agent system | 7.1–7.3 | 4 days | Agent architecture |
| Phase 8 — Context visibility | 8.1–8.3 | 2 days | Developer ergonomics |
| Phase 9 — Hooks system | 9.1–9.7 | 10 days | Enterprise + automation foundation |
| Phase 10 — Tool descriptions | 10.1–10.4 | 5 days | Core behavioral quality |
| Phase 11 — Completion signal | 11.1 | 2 days | Automation foundation |
| Phase 12 — Worktrees | 12.1–12.3 | 8 days | Safe parallel operation |
| Phase 13 — Checkpointing | 13.1–13.3 | 5 days | Safety net for long runs |

**Total estimated time, single developer:** 8–10 weeks

---

## APPENDIX B — THINGS DELIBERATELY EXCLUDED FROM THIS PLAN

The following gaps from the full analysis are NOT included because they require new infrastructure, ML work, or external dependencies that go beyond a straightforward port:

- Auto Mode safety classifier — requires training a separate reasoning-blind classifier model
- Fine-tuned model access — requires Anthropic partnership
- Remote Control bridge — requires managed infrastructure and security design
- Managed cloud sessions — requires cloud infrastructure
- Computer Use — requires a separate multi-month project
- Voice mode — requires audio I/O infrastructure
- Agent Teams (peer-to-peer) — requires distributed coordination layer
- Enterprise admin panel — requires web application infrastructure
- PII detection — requires ML classifier with acceptable false positive rate
- Evaluation infrastructure — requires separate eval framework project
- Mobile app integration — requires mobile app development

All items in the main plan above are implementable by a single TypeScript developer working against the existing OpenCode codebase with no external infrastructure dependencies beyond what OpenCode already uses.
