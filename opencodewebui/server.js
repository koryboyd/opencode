const express = require("express")
const path = require("path")
const { createProxyMiddleware } = require("http-proxy-middleware")

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

// Proxy all OpenCode API
app.use(
  "/api",
  createProxyMiddleware({
    target: "http://localhost:3000",
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    onError: (err, req, res) => {
      res.status(503).json({ error: "OpenCode server unavailable", message: "Start with: opencode --port 3000" })
    },
  }),
)

// Proxy Ollama (optional)
app.use(
  "/ollama",
  createProxyMiddleware({
    target: "http://localhost:11434",
    changeOrigin: true,
    pathRewrite: { "^/ollama": "" },
  }),
)

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.listen(PORT, () => {
  console.log(`\n🚀 OpenCode UI running on http://localhost:${PORT}`)
  console.log(`   Proxying → http://localhost:3000\n`)
})
