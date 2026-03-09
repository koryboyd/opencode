import { useState, useCallback, useRef, useEffect } from "react"
import hljs from "highlight.js"
import { Copy, Check } from "lucide-react"
import { Button } from "./button"
import { cn } from "@/lib/utils"

interface CodeBlockProps {
  code: string
  language?: string
}

export function CodeBlock({ code, language = "" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const codeRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current)
    }
  }, [code, language])

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  return (
    <div className="relative group my-2 overflow-hidden rounded-md border">
      <div className="flex items-center justify-between bg-muted px-3 py-1.5">
        <span className="text-xs text-muted-foreground">{language || "text"}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code ref={codeRef} className={language ? `language-${language}` : ""}>
          {code}
        </code>
      </pre>
    </div>
  )
}
