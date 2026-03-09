# OpenCode UI

A modern desktop UI for the OpenCode AI coding agent, built with React + Tauri.

## Features

- **Modern Chat Interface**: Clean, responsive chat UI with markdown and code syntax highlighting
- **Agent Selection**: Switch between build, plan, general, and explore agents
- **Session Management**: Create, list, and switch between conversations
- **Real-time Streaming**: Live streaming responses from the AI
- **Dark/Light Theme**: Full theme support with system preference detection
- **Settings**: Configure server URL, working directory, and authentication

## Prerequisites

- Node.js 18+
- Bun (recommended) or npm
- Rust (for Tauri)
- OpenCode server running locally

## Quick Start

```bash
cd opencode-ui

# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Running with Tauri

```bash
# Install Tauri CLI
npm install -D @tauri-apps/cli

# Run in development (with Tauri)
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Configuration

The UI connects to an OpenCode server. By default, it expects the server at `http://localhost:4096`.

### Environment Variables

- `VITE_OPENCODE_URL` - Server URL (default: http://localhost:4096)

### Settings

Configure via the Settings modal:

- **Server URL**: OpenCode server address (e.g., http://localhost:4096)
- **Working Directory**: Project directory for the agent
- **Authentication**: Optional username/password for secured servers
- **Theme**: Light, Dark, or System

## Architecture

```
opencode-ui/
├── src/
│   ├── components/     # React components
│   │   ├── ui/        # Base UI components (Button, Input, etc.)
│   │   ├── Sidebar.tsx
│   │   ├── ChatArea.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── InputBar.tsx
│   │   └── SettingsModal.tsx
│   ├── hooks/         # Custom React hooks
│   │   ├── useOpenCode.ts
│   │   └── useTheme.ts
│   ├── lib/           # Utilities and API
│   │   ├── api.ts     # OpenCode client
│   │   ├── types.ts   # TypeScript types
│   │   └── utils.ts
│   ├── stores/        # Zustand state management
│   │   ├── chatStore.ts
│   │   ├── connectionStore.ts
│   │   └── uiStore.ts
│   ├── App.tsx
│   └── main.tsx
├── src-tauri/         # Tauri Rust backend
├── package.json
└── vite.config.ts
```

## API Integration

The UI communicates with the OpenCode server via:

- **REST API**: For CRUD operations (sessions, messages)
- **SSE (Server-Sent Events)**: For real-time updates and streaming

### Key Endpoints

- `GET /agent` - List available agents
- `GET /session` - List sessions
- `POST /session` - Create new session
- `POST /session/:id/message` - Send message (streaming)
- `GET /event` - SSE for real-time updates

## Protocol Assumptions

1. Server runs on configurable localhost port (default 4096)
2. Optional basic auth via `Authorization` header
3. Working directory passed via `X-Opencode-Directory` header
4. Events streamed via `/event` SSE endpoint
5. Messages use the `MessageV2` format with parts (text, reasoning, tool, snapshot, patch)

## Building

```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Package with Tauri
npm run tauri:build
```

## Troubleshooting

- **Connection refused**: Ensure OpenCode server is running (`opencode serve`)
- **Authentication errors**: Check username/password in settings
- **CORS errors**: Server must allow localhost origins

## Next Steps

- [ ] Full file explorer in sidebar
- [ ] Inline diff viewer for patches
- [ ] Keyboard shortcuts
- [ ] Command palette
- [ ] Export/import sessions
