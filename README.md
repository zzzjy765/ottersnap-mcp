# ottersnap-mcp

MCP (Model Context Protocol) server for **[Glint Render](https://ottersnap.com)** — the web rendering & evidence platform by Moyu. — give Claude, Cursor, Codex and other AI agents **eyes on any web page**: pixel-perfect screenshots, print-ready PDFs and branded OG images from natural language.

## Quick start

Get a free API key at [ottersnap.com/dashboard](https://ottersnap.com/dashboard) (100 renders/month, no credit card), then add to your MCP client config:

```json
{
  "mcpServers": {
    "glint-render": {
      "command": "npx",
      "args": ["-y", "ottersnap-mcp"],
      "env": {
        "GLINT_API_KEY": "otter_live_your_key_here"
      }
    }
  }
}
```

Or install globally:

```bash
npm install -g ottersnap-mcp
export OTTERSNAP_API_KEY=otter_live_your_key_here
ottersnap-mcp
```

## Tools

| Tool | What it does |
|---|---|
| `render_screenshot` | Renders any URL and **returns the image visually** — the agent can actually read the page. Supports full-page, retina 2×, dark mode, element hiding, cookie-banner blocking, iPhone/iPad/Android presets. |
| `render_pdf` | URL or raw HTML → print-ready PDF (A4/Letter/Legal, landscape, margins, header/footer with page numbers). |
| `create_og_image` | Branded 1200×630 social card, returned visually. Seven themes. |
| `extract_page` | URL → structured JSON (title, description, headings, links, images, word count) or clean Markdown — built for RAG and agent pipelines. |
| `ai_extract` | URL + natural-language prompt → structured JSON extracted by LLM. |
| `code_image` | Code snippet → macOS-window syntax-highlighted PNG. |
| `check_usage` | Remaining renders for the configured key. |

## Example prompts

- "Screenshot github.com/trending and tell me which repos mention Rust"
- "Take a dark-mode full-page capture of my landing page and check the footer renders"
- "Extract every heading and link from https://example.com/docs as markdown"
- "Scrape the product name, price and rating from this URL into JSON"
- "Make an OG image for my blog post titled 'Shipping fast with Redis'"
- "Show this Python function as a pretty code card"
- "How many OtterSnap renders do I have left?"

## Environment

| Var | Required | Description |
|---|---|---|
| `GLINT_API_KEY` | yes | Your API key ([get one free](https://ottersnap.com/dashboard)). `OTTERSNAP_API_KEY` is still accepted for compatibility. |
| `OTTERSNAP_API_URL` | no | Override for self-hosting / testing |

## License

MIT
