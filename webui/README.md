# OpenCode Web UI (OpenNBT-style)

A custom web interface for OpenCode with OpenNBT branding and full feature set.

## Features

- **Lab Mode**: Multi-agent pipeline execution with 8 specialized agents
- **Chat Mode**: Conversational AI with context injection (@lab, @re, @file)
- **RE Mode**: Reverse engineering tools (disassembly, vuln intel, attack maps, etc.)
- **Mission Mode**: Autonomous execution with OpenCode
- **Self-Mod Mode**: Live source editing with AI patches
- **OC Mode**: Agent, Terminal, File Explorer with real tool execution
- **Audit Trail**: Complete logging of all actions
- **Terminal**: Full shell access via OpenCode
- **File Explorer**: Browse and edit project files

## Prerequisites

- Node.js 18+
- OpenCode server running on `localhost:3000`
- Ollama running on `localhost:11434`

## Installation

```bash
cd webui
npm install
```

## Usage

```bash
npm start
```

Then open http://localhost:3001 in your browser.

## Architecture

This is a standalone proxy server that:

1. Serves the OpenNBT-style UI from `public/`
2. Proxies API requests to:
   - OpenCode server (`/api/opencode/*` → `http://localhost:3000/*`)
   - Ollama (`/api/ollama/*` → `http://localhost:11434/*`)
3. Handles CORS and provides a unified origin

## Configuration

Environment variables:

- `PORT` - Server port (default: 3001)
- `OPENCODE_URL` - OpenCode server URL (default: http://localhost:3000)
- `OLLAMA_URL` - Ollama server URL (default: http://localhost:11434)

## Development

This is an experimental test branch. The UI is a single-page application.
To modify, edit `public/index.html` directly.

## Notes

- The UI uses the OpenNBT branding and assets from https://nobanthanks.com
- All AI calls are proxied through this server to avoid CORS issues
- OpenCode must be running for agent/terminal/file operations
- Ollama is required for AI features
- This is a test branch for evaluating a new web UI approach
