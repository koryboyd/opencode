# OpenCode Web UI (OpenNBT-style)

Custom web interface for OpenCode with full functionality.

## Quick Start

1. **Start OpenCode server** (if not running):

   ```bash
   opencode --port 3000
   ```

2. **Start Ollama** (if not running):

   ```bash
   ollama serve
   ```

3. **Start Web UI**:

   ```bash
   cd opencodewebui
   npm install
   npm start
   ```

4. Open browser: **http://localhost:3001**

## Features

- **Lab Mode**: Run AI agent pipelines
- **Chat Mode**: Conversational AI with history
- **RE Mode**: Reverse engineering analysis
- **Mission Mode**: Autonomous task execution
- **OC Mode**: OpenCode agent with real tool execution

## Architecture

```
localhost:3001 (This UI)
  ├─ Serves static HTML/JS
  ├─ Proxies /api/opencode/* → http://localhost:3000
  └─ Proxies /api/ollama/* → http://localhost:11434
```

## Troubleshooting

### "Cannot read 'image.png' (this model does not support image input)"

Your selected Ollama model is text-only. Switch to a multimodal model (llava, moondream) or ignore - image features are optional.

### "Cannot find module 'express'"

Run `npm install` in the opencodewebui directory.

### OpenCode not connecting

Ensure OpenCode server is running on port 3000:

```bash
opencode --port 3000
```

### Ollama not connecting

Ensure Ollama is running and has at least one model:

```bash
ollama serve
ollama pull llama2
```

## Files

- `server.js` - Express proxy server
- `public/index.html` - Complete UI (inline JS)
- `package.json` - Dependencies

All API calls are proxied through `/api/opencode` and `/api/ollama` to avoid CORS.
