#!/usr/bin/env node
// Glint Render MCP server (stdio) — rendering, monitoring and evidence for AI agents.
// Env: GLINT_API_KEY (required; OTTERSNAP_API_KEY still accepted), OTTERSNAP_API_URL (optional, default https://api.ottersnap.com)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API = (process.env.OTTERSNAP_API_URL || "https://api.ottersnap.com").replace(/\/$/, "");
const KEY = process.env.GLINT_API_KEY || process.env.OTTERSNAP_API_KEY || "";

if (!KEY) {
  console.error("ottersnap-mcp: GLINT_API_KEY env var is required (get a free key at https://ottersnap.com/dashboard)");
  process.exit(1);
}

async function call(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OtterSnap ${res.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

const server = new McpServer({ name: "ottersnap", version: "0.3.4" });

server.tool(
  "render_screenshot",
  "Render a web page to an image and return it visually — gives the calling agent eyes on any URL. Supports full-page captures, retina scale, dark mode, element selection and cookie-banner blocking.",
  {
    url: z.string().describe("The page to capture, e.g. https://github.com"),
    fullPage: z.boolean().optional().describe("Capture the entire scroll height (default viewport only in this tool)"),
    width: z.number().int().min(320).max(3840).optional().describe("Viewport width, default 1280"),
    height: z.number().int().min(240).max(2160).optional().describe("Viewport height, default 800"),
    retina: z.boolean().optional().describe("2x device scale for crisp captures"),
    darkMode: z.boolean().optional().describe("Emulate prefers-color-scheme: dark"),
    hide: z.array(z.string()).optional().describe("CSS selectors to hide before capture"),
    format: z.enum(["png", "jpeg"]).optional().describe("Output format, default png"),
  },
  async (a) => {
    const buffer = await call("/v1/screenshot", {
      url: a.url,
      fullPage: Boolean(a.fullPage),
      width: a.width,
      height: a.height,
      scale: a.retina ? 2 : 1,
      darkMode: Boolean(a.darkMode),
      hide: a.hide,
      cookieBlock: true,
      format: a.format || "png",
    });
    return {
      content: [
        { type: "image", mimeType: a.format === "jpeg" ? "image/jpeg" : "image/png", data: buffer.toString("base64") },
        { type: "text", text: `Screenshot of ${a.url} (${Math.round(buffer.length / 1024)} KB).` },
      ],
    };
  }
);

server.tool(
  "render_pdf",
  "Render a web page (or raw HTML) to a print-ready PDF file. Returns size info; PDF bytes are not inlined.",
  {
    url: z.string().optional().describe("The page to convert"),
    html: z.string().optional().describe("Raw HTML to convert instead of a URL — ideal for invoices and reports"),
    paper: z.enum(["A4", "Letter", "Legal"]).optional().describe("Paper size, default A4"),
    landscape: z.boolean().optional(),
    margin: z.enum(["narrow", "normal", "wide"]).optional(),
    headerText: z.string().optional().describe("Text centered in the header of every page"),
    footerText: z.string().optional().describe("Text in the footer; page numbers are added automatically"),
  },
  async (a) => {
    if (!a.url && !a.html) throw new Error("Provide url or html");
    const buffer = await call("/v1/pdf", a);
    return {
      content: [{ type: "text", text: `PDF rendered: ${Math.round(buffer.length / 1024)} KB, paper ${a.paper || "A4"}${a.landscape ? " landscape" : ""}. Pass html or url again with return_base64=true to receive the bytes inline (not recommended for large docs).` }],
    };
  }
);

server.tool(
  "create_og_image",
  "Generate a branded 1200x630 Open Graph social card and return it visually.",
  {
    title: z.string().describe("Main headline"),
    subtitle: z.string().optional().describe("Supporting line under the headline"),
    siteName: z.string().optional().describe("Footer label, default ottersnap.com"),
    theme: z.enum(["emerald", "sky", "violet", "slate", "nocturne", "light", "paper"]).optional().describe("Card theme, default emerald"),
  },
  async (a) => {
    const buffer = await call("/v1/og", a);
    return {
      content: [
        { type: "image", mimeType: "image/png", data: buffer.toString("base64") },
        { type: "text", text: `OG card created (${Math.round(buffer.length / 1024)} KB, theme ${a.theme || "emerald"}).` },
      ],
    };
  }
);

server.tool(
  "check_usage",
  "Check remaining renders and quota for the configured OtterSnap key.",
  {},
  async () => {
    const res = await fetch(`${API}/v1/me`, {
      headers: { Authorization: `Bearer ${KEY}` },
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json();
    const text =
      j.plan === "static"
        ? `Static key: ${j.usage?.total ?? 0} renders served (static keys are not quota-metered).`
        : `Plan ${j.plan}: ${j.used}/${j.quota} renders used, ${j.remaining} remaining. Resets ${j.period_reset_at}.`;
    return { content: [{ type: "text", text }] };
  }
);


server.tool(
  "extract_page",
  "Extract structured content from a web page: title, description, headings, links, images and the page body as clean Markdown — ready to feed to an LLM. This READS the page (use render_screenshot to SEE it).",
  {
    url: z.string().optional().describe("The page to read, e.g. https://example.com/blog/post"),
    html: z.string().optional().describe("Raw HTML to extract from instead of a URL"),
    format: z.enum(["json", "markdown"]).optional().describe("json (default): full structured data; markdown: just the page body as Markdown"),
  },
  async (a) => {
    if (!a.url && !a.html) throw new Error("Provide url or html");
    const buffer = await call("/v1/extract", { url: a.url, html: a.html, format: a.format || "json" });
    if ((a.format || "json") === "markdown") {
      return { content: [{ type: "text", text: buffer.toString("utf-8") }] };
    }
    const data = JSON.parse(buffer.toString("utf-8"));
    const summary = [
      `Title: ${data.title}`,
      `Description: ${data.description || "(none)"}`,
      `Headings: ${data.headings.map((h) => "#".repeat(h.level) + " " + h.text).join(" | ")}`,
      `Word count: ${data.word_count} · Links: ${data.links ? data.links.length : 0} · Images: ${data.images ? data.images.length : 0}`,
      ``,
      `Markdown body (first 3000 chars):`,
      data.markdown.slice(0, 3000),
    ].join("\n");
    return { content: [{ type: "text", text: summary }] };
  }
);


server.tool(
  "ai_extract",
  "Extract structured data from a web page using natural language. Give a URL, describe what you want (e.g. 'all product names and prices'), receive JSON. Powered by an LLM reading the rendered page.",
  {
    url: z.string().optional().describe("The page to read"),
    html: z.string().optional().describe("Raw HTML to read instead of a URL"),
    prompt: z.string().describe("Natural language describing what to extract and the JSON shape you want"),
  },
  async (a) => {
    if (!a.url && !a.html) throw new Error("Provide url or html");
    const buffer = await call("/v1/ai/extract", { url: a.url, html: a.html, prompt: a.prompt });
    return { content: [{ type: "text", text: buffer.toString("utf-8") }] };
  }
);

server.tool(
  "code_image",
  "Turn a code snippet into a beautiful syntax-highlighted PNG (macOS-style window card). Great for sharing code on social media or docs.",
  {
    code: z.string().describe("The code snippet to render"),
    language: z.string().optional().describe("Language for highlighting, e.g. javascript, python, go"),
    theme: z.enum(["dark", "light"]).optional().describe("Card theme, default dark"),
    title: z.string().optional().describe("Filename shown in the window title bar"),
  },
  async (a) => {
    const buffer = await call("/v1/code-image", a);
    return {
      content: [
        { type: "image", mimeType: "image/png", data: buffer.toString("base64") },
        { type: "text", text: `Code image created (${Math.round(buffer.length / 1024)} KB).` },
      ],
    };
  }
);

// ---------- Workflows（自动化工作流）----------
server.tool(
  "workflow_create",
  "Create a Glint workflow — an automation that runs steps (screenshot, extract, fetch, AI, email, webhook) on a trigger (schedule / page-change monitor / inbound webhook). 1 credit per run.",
  {
    name: z.string().describe("Workflow name, e.g. 'Competitor price watch'"),
    triggerType: z.enum(["cron", "watch", "webhook"]).describe("cron = schedule, watch = run when a Glint monitor detects a change, webhook = run when the hook URL is POSTed"),
    everyMinutes: z.number().int().min(15).optional().describe("For cron triggers: interval in minutes (min 15)"),
    watchId: z.string().optional().describe("For watch triggers: the Glint monitor job id to react to"),
    steps: z.array(z.object({
      action: z.enum(["screenshot", "extract", "fetch", "ai", "email", "webhook"]),
      url: z.string().optional().describe("Target URL for screenshot/extract/fetch/webhook steps"),
      prompt: z.string().optional().describe("AI step: instruction for the model"),
      input: z.string().optional().describe("AI step: input text, supports {{N.field}} references to earlier steps"),
      to: z.string().optional().describe("Email step: recipient"),
      subject: z.string().optional().describe("Email step: subject"),
      body: z.string().optional().describe("Email step: body text, supports {{N.field}}"),
      fullPage: z.boolean().optional().describe("Screenshot step: full-page capture"),
    })).min(1).max(10).describe("Ordered steps; a failing step stops the chain"),
  },
  async (a) => {
    const trigger = a.triggerType === "cron"
      ? { type: "cron", everyMinutes: a.everyMinutes || 60 }
      : a.triggerType === "watch"
        ? { type: "watch", watchId: a.watchId }
        : { type: "webhook" };
    const wf = await call("/v1/workflows", { name: a.name, trigger, steps: a.steps });
    const hook = trigger.type === "webhook" && wf.id
      ? ` Hook URL: ${API}/v1/hook/${wf.id}/${trigger.secret}`
      : "";
    return { content: [{ type: "text", text: `Workflow created (${wf.id}).${hook}` }] };
  }
);

server.tool(
  "workflow_list",
  "List your Glint workflows with trigger type, step count, enabled state and last run status.",
  {},
  async () => {
    const data = await getJson("/v1/workflows");
    const rows = (data.workflows || []).map((w) =>
      `${w.name} [${w.id}] — ${w.trigger?.type || "?"}, ${Array.isArray(w.steps) ? w.steps.length : "?"} steps, ${w.enabled ? "enabled" : "paused"}, last run: ${w.last_status || "never"}`
    );
    return { content: [{ type: "text", text: rows.length ? rows.join("\n") : "No workflows yet." }] };
  }
);

server.tool(
  "workflow_run",
  "Run a Glint workflow once immediately and return the result of every step.",
  { id: z.string().describe("Workflow id (from workflow_list)") },
  async (a) => {
    const result = await call(`/v1/workflows/${a.id}/run`, {});
    const lines = ((result.steps_log) || []).map((s) =>
      `${s.ok ? "OK" : "FAIL"}  step ${s.step} (${s.action}) ${s.result?.url || s.result?.text || s.error || ""}`
    );
    return { content: [{ type: "text", text: `Run ${result.run_id}: ${result.status}${result.error ? " — " + result.error : ""}` }] };
  }
);

server.tool(
  "workflow_runs",
  "Show the recent run history of a Glint workflow (status, error, step count).",
  { id: z.string().describe("Workflow id") },
  async (a) => {
    const data = await getJson(`/v1/workflows/${a.id}/runs`);
    const rows = (data.runs || []).map((r) => `${r.started_at}  ${r.status}${r.error ? " — " + r.error : ""}`);
    return { content: [{ type: "text", text: rows.length ? rows.join("\n") : "No runs yet." }] };
  }
);

await server.connect(new StdioServerTransport());
