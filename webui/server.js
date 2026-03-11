const express = require("express")
const path = require("path")
const { createProxyMiddleware } = require("http-proxy-middleware")
const cors = require("cors")

const app = express()
const PORT = process.env.PORT || 3001

// Enable CORS for all routes
app.use(cors())

// Parse JSON bodies
app.use(express.json())

// Serve static files from public directory
app.use(express.static(path.join(__dirname, "public")))

// Proxy Ollama API
app.use(
  "/api/ollama",
  createProxyMiddleware({
    target: "http://localhost:11434",
    changeOrigin: true,
    pathRewrite: { "^/api/ollama": "" },
    onError: (err, req, res) => {
      console.error("Ollama proxy error:", err.message)
      res.status(503).json({ error: "Ollama unavailable" })
    },
  }),
)

// Proxy OpenCode API
app.use(
  "/api/opencode",
  createProxyMiddleware({
    target: "http://localhost:3000",
    changeOrigin: true,
    pathRewrite: { "^/api/opencode": "" },
    onError: (err, req, res) => {
      console.error("OpenCode proxy error:", err.message)
      res.status(503).json({ error: "OpenCode server unavailable" })
    },
  }),
)

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      opencode: "proxied",
      ollama: "proxied",
    },
  })
})

// OpenCode status endpoint
app.get("/api/status", async (req, res) => {
  try {
    const ocRes = await fetch("http://localhost:3000/api/health")
    const ocStatus = ocRes.ok ? "online" : "offline"

    const ollamaRes = await fetch("http://localhost:11434/api/tags")
    const ollamaStatus = ollamaRes.ok ? "online" : "offline"

    res.json({
      opencode: ocStatus,
      ollama: ollamaStatus,
      proxy: "online",
    })
  } catch (e) {
    res.json({
      opencode: "unknown",
      ollama: "unknown",
      proxy: "online",
    })
  }
})

app.listen(PORT, () => {
  console.log(`\n🦞 OpenCode Web UI running on http://localhost:${PORT}`)
  console.log(`   Proxying OpenCode → http://localhost:3000`)
  console.log(`   Proxying Ollama  → http://localhost:11434`)
  console.log(`\nOpen your browser to: http://localhost:${PORT}\n`)
})
