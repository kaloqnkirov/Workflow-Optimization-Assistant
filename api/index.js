/**
 * Single Vercel Serverless Function — stays under Hobby plan (max 12 functions).
 * vercel.json rewrites /api/* → /api?path=* ; routeKeyFromReq() reads req.query.path.
 */
import crypto from "crypto";

function md5HexLower(s) {
  return crypto.createHash("md5").update(String(s).toLowerCase().trim(), "utf8").digest("hex");
}

function mailchimpDcFromKey(apiKey) {
  const s = String(apiKey || "");
  const i = s.lastIndexOf("-");
  if (i >= 0 && i < s.length - 1) return s.slice(i + 1);
  return process.env.MAILCHIMP_SERVER || "us1";
}

function mailchimpAuthHeader(apiKey) {
  const b = Buffer.from(`anystring:${String(apiKey)}`, "utf8").toString("base64");
  return `Basic ${b}`;
}

function stripMarkdownFence(s) {
  let t = String(s || "").trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-z]*\n?/i, "").replace(/\n?```\s*$/i, "");
  }
  return t.trim();
}

function normalizeToneOfVoice(raw) {
  const t = String(raw || "professional")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (t === "aggressive" || t === "aggressiveoptimizer") return "aggressive_optimizer";
  if (t === "creative") return "creative";
  return "professional";
}

/** Prepends global app voice to system prompts (JSON/schema rules stay in base). */
function mergeSystemContent(base, toneRaw) {
  const v = normalizeToneOfVoice(toneRaw);
  let prefix;
  if (v === "creative") {
    prefix =
      "Global voice — Creative: use vivid, distinctive language and memorable phrasing inside JSON string values; unexpected angles are welcome. Still obey every format rule below. ";
  } else if (v === "aggressive_optimizer") {
    prefix =
      "Global voice — Aggressive optimizer: prioritize ROI, velocity, and measurable lift; direct, urgent wording in JSON strings; challenge waste and weak assumptions. Still obey every format rule below. ";
  } else {
    prefix =
      "Global voice — Professional: clear, precise, business-appropriate wording in JSON string values. Still obey every format rule below. ";
  }
  return prefix + base;
}

function toneImagePromptPrefix(toneRaw) {
  const v = normalizeToneOfVoice(toneRaw);
  if (v === "creative") return "[Creative bold visual direction] ";
  if (v === "aggressive_optimizer") return "[High-conversion aggressive commercial look] ";
  return "[Clean professional marketing visual] ";
}

function routeKeyFromReq(req) {
  const q = req.query || {};
  const named = q.path ?? q.slug ?? q.catchall;
  if (named !== undefined && named !== null) {
    if (Array.isArray(named)) return named.filter(Boolean).join("/");
    return String(named);
  }
  try {
    const host = req.headers?.host || "localhost";
    const raw = (req.url || "").split("?")[0];
    const u = new URL(raw, `http://${host}`);
    const m = u.pathname.match(/^\/api\/(.+)$/);
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    const m = String(req.url || "").split("?")[0].match(/^\/api\/(.+)$/);
    return m ? m[1] : "";
  }
}

async function openaiJson(apiKey, userPrompt, temperature = 0.7, toneOfVoice) {
  const base =
    "You reply with JSON only — a single JSON object or array as requested. No markdown code fences, no commentary.";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: mergeSystemContent(base, toneOfVoice),
        },
        { role: "user", content: userPrompt },
      ],
      temperature,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt.slice(0, 2000));
  }
  const data = await r.json();
  const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
  return JSON.parse(text);
}

function buildEventsPrompt(events, clients) {
  return [
    `Clients: ${Array.isArray(clients) ? clients.slice(0, 50).join(", ") : ""}`,
    "Events (most recent first):",
    JSON.stringify(Array.isArray(events) ? events.slice(0, 100) : []),
  ].join("\n");
}

const handlers = {
  "generate-leads": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }
    const {
      niche = "",
      country = "",
      where = "",
      city = "",
      companySize = "",
      role = "",
      language = "",
      company = "",
      industry = "",
      website = "",
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Generate exactly 5 realistic B2B lead rows as JSON.",
      "Return only JSON, no markdown.",
      "Each lead must have: company, meta (e.g. 'SaaS - US'), role, fit ('High'|'Med'|'Low'), intent (0-100 integer).",
      "Make them plausible and varied.",
      niche ? `Niche: ${niche}` : "",
      country ? `Country: ${country}` : "",
      city ? `City/Region: ${city}` : "",
      where ? `Where to search: ${where}` : "",
      companySize ? `Preferred company size: ${companySize}` : "",
      role ? `Target contact role: ${role}` : "",
      language ? `Output language: ${language}` : "",
      company ? `Client company (we are generating leads for): ${company}` : "",
      industry ? `Client industry: ${industry}` : "",
      website ? `Client website: ${website}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent(
              "You reply with JSON only — a single JSON array. No markdown code fences, no commentary.",
              toneOfVoice,
            ),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");

    let leads;
    try {
      leads = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (!Array.isArray(leads) || leads.length !== 5) {
      res.status(500).json({ error: "Expected array of 5 leads", raw: leads });
      return;
    }

    res.status(200).json({ leads });
  },

  suggest: async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const { kind = "funnel", brandContext = "", toneOfVoice } = req.body || {};
    const k = String(kind).toLowerCase();
    const bc = String(brandContext || "").trim();
    const prefix = bc ? `${bc}\n\n` : "";

    if (k === "conversions") {
      const { industry = "", goal = "book_demo", channels = ["meta", "email"] } = req.body || {};
      const prompt = prefix + [
        "Suggest conversion tracking settings and KPIs.",
        "Return only JSON, no markdown.",
        "JSON shape: {\"primaryEvent\": string, \"attribution\": string, \"channel\": string, \"utmPreset\": string, \"kpis\": string[]}.",
        `Industry: ${industry || "unknown"}`,
        `Goal: ${goal}`,
        `Channels: ${Array.isArray(channels) ? channels.join(", ") : String(channels)}`,
        "Allowed primaryEvent values: lead, purchase, signup, book_demo, add_to_cart",
        "Allowed attribution values: 7d_click_1d_view, 1d_click, 7d_click, 28d_click_1d_view",
        "Allowed channel values: meta, google, linkedin, email, sms",
        "Allowed utmPreset values: standard, minimal, none",
      ].join("\n");

      try {
        const out = await openaiJson(apiKey, prompt, 0.6, toneOfVoice);
        res.status(200).json(out);
      } catch (e) {
        res.status(500).json({ error: "OpenAI error", detail: String(e?.message || e).slice(0, 2000) });
      }
      return;
    }

    const { templateId = "lead_magnet", trigger = "new_lead", goal = "book_demo", channels = ["email"] } = req.body || {};

    const prompt =
      prefix +
      [
        "Suggest a funnel as JSON.",
        "Return only JSON, no markdown.",
        "JSON must be: {\"steps\": [{\"delayMinutes\": number, \"action\": string, \"note\": string}]}",
        "Keep it realistic and actionable. 4-8 steps.",
        `Template: ${templateId}`,
        `Trigger: ${trigger}`,
        `Goal: ${goal}`,
        `Channels: ${Array.isArray(channels) ? channels.join(", ") : String(channels)}`,
      ].join("\n");

    try {
      const out = await openaiJson(apiKey, prompt, 0.7, toneOfVoice);
      const steps = out && Array.isArray(out.steps) ? out.steps : null;
      if (!steps) {
        res.status(500).json({ error: "Invalid steps", raw: out });
        return;
      }
      res.status(200).json({ steps });
    } catch (e) {
      res.status(500).json({ error: "Model did not return valid JSON", detail: String(e?.message || e).slice(0, 2000) });
    }
  },

  integrations: async (req, res) => {
    const { target = "" } = req.body || {};
    const t = String(target).toLowerCase();

    if (t === "slack") {
      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (!webhookUrl) {
        res.status(500).json({ error: "Missing SLACK_WEBHOOK_URL on server" });
        return;
      }
      const { event = "", companyName = "", channel = "", payload = {} } = req.body || {};
      const text = [
        "*AI Marketing Automation*",
        companyName ? `Company: *${companyName}*` : "",
        event ? `Event: \`${event}\`` : "",
        channel ? `Channel: \`${channel}\`` : "",
        payload && typeof payload === "object" ? `Payload: \`${JSON.stringify(payload).slice(0, 900)}\`` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        res.status(500).json({ error: "Slack webhook error", detail: txt.slice(0, 2000) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    if (t === "trello") {
      const key = process.env.TRELLO_KEY;
      const token = process.env.TRELLO_TOKEN;
      const listId = process.env.TRELLO_LIST_ID;
      if (!key || !token || !listId) {
        res.status(500).json({ error: "Missing TRELLO_KEY / TRELLO_TOKEN / TRELLO_LIST_ID on server" });
        return;
      }
      const { event = "", companyName = "", payload = {} } = req.body || {};
      const name = `${companyName || "Company"} — ${event || "event"}`;
      const desc = payload && typeof payload === "object" ? JSON.stringify(payload, null, 2).slice(0, 8000) : "";
      const url =
        "https://api.trello.com/1/cards?" +
        new URLSearchParams({ idList: listId, key, token, name, desc }).toString();
      const r = await fetch(url, { method: "POST" });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        res.status(500).json({ error: "Trello error", detail: txt.slice(0, 2000) });
        return;
      }
      const data = await r.json().catch(() => ({}));
      res.status(200).json({ ok: true, cardId: data.id || null, url: data.url || null });
      return;
    }

    if (t === "zapier") {
      const { webhook: webhookFromBody = "", format = "json", target: _t, ...rest } = req.body || {};
      const webhookUrl = webhookFromBody || process.env.ZAPIER_WEBHOOK_URL;
      if (!webhookUrl) {
        res.status(500).json({ error: "Missing ZAPIER_WEBHOOK_URL (or webhook in body)" });
        return;
      }
      const body =
        format === "form"
          ? new URLSearchParams({ data: JSON.stringify(rest) }).toString()
          : JSON.stringify(rest);
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": format === "form" ? "application/x-www-form-urlencoded" : "application/json" },
        body,
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        res.status(500).json({ error: "Zapier webhook error", detail: txt.slice(0, 2000) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: "Invalid target", hint: "Use target: slack | trello | zapier" });
  },

  "analyze-tracking": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const { events = [], clients = [], brandContext = "", expertMode = false, toneOfVoice } = req.body || {};
    const bc = String(brandContext || "").trim();

    const expertModeOn = !!expertMode;

    let prompt;
    let systemContent;

    if (expertModeOn) {
      prompt = [
        "Analyze the same marketing tracking data from THREE professional viewpoints. Each viewpoint must be distinct.",
        "Return only JSON, no markdown code fences.",
        "",
        "Required JSON shape:",
        "{",
        '  "expertMode": true,',
        '  "perspectives": [',
        "    {",
        '      "id": "project_manager",',
        '      "label": "Project Manager",',
        '      "focus": "speed",',
        '      "summary": string,',
        '      "optimizationSteps": [ { "step": number, "title": string, "detail": string, "iconHint": string } ],',
        '      "insights": string[]',
        "    },",
        "    {",
        '      "id": "financial_officer",',
        '      "label": "Financial Officer",',
        '      "focus": "cost",',
        '      "summary": string,',
        '      "optimizationSteps": [ ... ],',
        '      "insights": string[]',
        "    },",
        "    {",
        '      "id": "tech_lead",',
        '      "label": "Tech Lead",',
        '      "focus": "scalability",',
        '      "summary": string,',
        '      "optimizationSteps": [ ... ],',
        '      "insights": string[]',
        "    }",
        "  ]",
        "}",
        "",
        "Rules:",
        "- perspectives MUST contain exactly 3 objects in this order: Project Manager, Financial Officer, Tech Lead.",
        "- Project Manager: prioritize velocity, milestones, prioritization, cross-team handoffs, time-to-value.",
        "- Financial Officer: prioritize budget, ROI, CAC efficiency, channel unit economics, waste reduction.",
        "- Tech Lead: prioritize scalable architecture, integrations, data pipelines, reliability, technical debt vs growth.",
        "- Each optimizationSteps array: 4–6 items; step numbers start at 1 within that persona.",
        "- iconHint: same allowed values as standard mode (target, analytics, creative, audience, conversion, email, ops, speed, growth, launch, measurement).",
        "- summaries must reference the actual events/clients when possible.",
        "",
        buildEventsPrompt(events, clients),
      ].join("\n");

      systemContent = mergeSystemContent(
        "You reply with JSON only — one object with expertMode true and exactly three perspectives. No markdown fences, no commentary outside JSON.",
        toneOfVoice,
      );

      if (bc) prompt = `${bc}\n\n${prompt}`;
    } else {
      prompt = [
        "Analyze marketing tracking events and produce a structured optimization plan.",
        "Return only JSON, no markdown code fences.",
        "",
        "Required JSON shape:",
        "{",
        '  "summary": string,',
        '  "optimizationSteps": [',
        "    {",
        '      "step": number,',
        '      "title": string,',
        '      "detail": string,',
        '      "iconHint": "target" | "analytics" | "creative" | "audience" | "conversion" | "email" | "ops" | "speed" | "growth" | "launch" | "measurement"',
        "    }",
        "  ],",
        '  "insights": string[]',
        "}",
        "",
        "Rules:",
        "- optimizationSteps MUST contain between 5 and 8 items.",
        '- step MUST be sequential integers: 1, 2, 3, … (use "Step 1", "Step 2" style ordering in content).',
        "- title: short, action-oriented (max ~90 characters).",
        "- detail: 1–3 sentences, specific to the supplied events and clients.",
        "- iconHint: one value per step; choose the best semantic match for that step.",
        "- insights: 0–5 short bullets with evidence or patterns (optional but preferred).",
        "- Put the full actionable plan only in optimizationSteps; do not use a separate nextActions field.",
        "",
        buildEventsPrompt(events, clients),
      ].join("\n");

      systemContent = mergeSystemContent(
        "You reply with JSON only — one object matching the user's schema. Include optimizationSteps as the primary deliverable. No markdown fences, no commentary outside JSON.",
        toneOfVoice,
      );

      if (bc) prompt = `${bc}\n\n${prompt}`;
    }

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: systemContent,
          },
          { role: "user", content: prompt },
        ],
        temperature: expertModeOn ? 0.55 : 0.5,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (expertModeOn) {
      const perspectives = Array.isArray(out.perspectives) ? out.perspectives : [];
      if (perspectives.length < 3) {
        res.status(500).json({
          error: "Expert mode requires three perspectives",
          detail: "Expected perspectives: Project Manager, Financial Officer, Tech Lead",
          raw: text.slice(0, 2000),
        });
        return;
      }
      for (let i = 0; i < 3; i++) {
        const steps = Array.isArray(perspectives[i].optimizationSteps) ? perspectives[i].optimizationSteps : [];
        if (steps.length < 2) {
          res.status(500).json({
            error: "Too few steps for a persona",
            detail: `Persona index ${i} needs at least 2 optimization steps`,
            raw: text.slice(0, 1500),
          });
          return;
        }
      }
      out.expertMode = true;
      res.status(200).json(out);
      return;
    }

    const steps = Array.isArray(out.optimizationSteps) ? out.optimizationSteps : [];
    if (steps.length < 2) {
      res.status(500).json({
        error: "Model returned too few optimization steps",
        detail: "Expected optimizationSteps with at least 2 items (Step 1, Step 2, …)",
        raw: text.slice(0, 1500),
      });
      return;
    }

    res.status(200).json(out);
  },

  "generate-media": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      kind = "image",
      brandContext = "",
      prompt = "",
      platform = "Instagram",
      durationSec = 15,
      toneOfVoice,
    } = req.body || {};
    const k = String(kind).toLowerCase();

    if (k === "video" || k === "video_script") {
      if (!prompt || String(prompt).trim().length < 5) {
        res.status(400).json({ error: "Prompt too short" });
        return;
      }
      const bc = String(brandContext || "").trim();
      const instruction = [
        bc ? `Brand context: ${bc}` : "",
        "Write a short video ad script + storyboard.",
        "Return only JSON, no markdown.",
        "JSON shape: {\"script\": string, \"shots\": [{\"sec\": number, \"visual\": string, \"onScreenText\": string, \"voiceover\": string}]}",
        `Platform: ${platform}`,
        `Duration seconds: ${durationSec}`,
        "Keep it actionable for filming/editing.",
        "Prompt:",
        String(prompt).trim().slice(0, 4000),
      ]
        .filter(Boolean)
        .join("\n");

      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content: mergeSystemContent(
                "You reply with JSON only — one object with script and shots. No markdown fences.",
                toneOfVoice,
              ),
            },
            { role: "user", content: instruction },
          ],
          temperature: 0.7,
        }),
      });

      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
        return;
      }

      const data = await r.json();
      const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
      let out;
      try {
        out = JSON.parse(text);
      } catch {
        res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
        return;
      }

      res.status(200).json(out);
      return;
    }

    const imagePromptRaw = String(prompt || "").trim();
    if (imagePromptRaw.length < 5) {
      res.status(400).json({ error: "Prompt too short" });
      return;
    }
    const bc = String(brandContext || "").trim();
    const imagePrompt = bc
      ? `${toneImagePromptPrefix(toneOfVoice)}${bc}\n\n${imagePromptRaw}`
      : `${toneImagePromptPrefix(toneOfVoice)}${imagePromptRaw}`;

    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: imagePrompt,
        size: "1024x1024",
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      res.status(500).json({ error: "No image returned" });
      return;
    }

    res.status(200).json({ dataUrl: `data:image/png;base64,${b64}` });
  },

  "write-email": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      goal = "book_demo",
      industry = "",
      product = "",
      promo = "",
      url = "",
      tone = "professional",
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Write one marketing email as JSON.",
      "Return only JSON, no markdown.",
      "JSON must be: {\"subject\": string, \"body\": string}.",
      "Body should be plain text with short paragraphs and a clear CTA. No HTML.",
      `Tone: ${tone}`,
      `Goal: ${goal}`,
      industry ? `Industry: ${industry}` : "",
      product ? `Product/offer: ${product}` : "",
      promo ? `Promo code: ${promo}` : "",
      url ? `CTA URL: ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent(
              "You reply with JSON only — one object with subject and body. No markdown fences.",
              toneOfVoice,
            ),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (!out || typeof out.subject !== "string" || typeof out.body !== "string") {
      res.status(500).json({ error: "Invalid email shape", raw: out });
      return;
    }

    res.status(200).json({ subject: out.subject, body: out.body });
  },

  "write-sms": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      goal = "follow_up",
      industry = "",
      product = "",
      promo = "",
      url = "",
      tone = "friendly",
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Write one SMS message as JSON.",
      "Return only JSON, no markdown.",
      "JSON must be: {\"body\": string}.",
      "Constraints: 1-2 short sentences, clear CTA, no spammy language.",
      `Tone: ${tone}`,
      `Goal: ${goal}`,
      industry ? `Industry: ${industry}` : "",
      product ? `Product/offer: ${product}` : "",
      promo ? `Promo code: ${promo}` : "",
      url ? `URL (optional): ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent(
              "You reply with JSON only — one object with a body field. No markdown fences.",
              toneOfVoice,
            ),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (!out || typeof out.body !== "string") {
      res.status(500).json({ error: "Invalid SMS shape", raw: out });
      return;
    }

    res.status(200).json({ body: out.body });
  },

  "write-funnel-copy": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      templateId = "lead_magnet",
      goal = "book_demo",
      trigger = "new_lead",
      industry = "",
      steps = [],
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Write short funnel copy suggestions.",
      "Return only JSON, no markdown.",
      "JSON shape: {\"headline\": string, \"cta\": string, \"emailAngles\": string[], \"smsAngles\": string[]}.",
      `Template: ${templateId}`,
      `Trigger: ${trigger}`,
      `Goal: ${goal}`,
      industry ? `Industry: ${industry}` : "",
      "Steps:",
      JSON.stringify(Array.isArray(steps) ? steps.slice(0, 10) : []),
    ].join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent("You reply with JSON only — one object. No markdown fences.", toneOfVoice),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    res.status(200).json(out);
  },

  "plan-campaign": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      type = "nurture",
      channel = "email",
      audienceSize = 0,
      schedule = {},
      industry = "",
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Create a concise campaign plan.",
      "Return only JSON, no markdown.",
      "JSON shape: {\"plan\": string, \"segments\": string[], \"sendOrder\": string[], \"tips\": string[]}.",
      `Type: ${type}`,
      `Channel: ${channel}`,
      `Audience size: ${audienceSize}`,
      `Industry: ${industry || "unknown"}`,
      `Schedule: ${JSON.stringify(schedule)}`,
    ].join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent("You reply with JSON only — one object. No markdown fences.", toneOfVoice),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.6,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    res.status(200).json(out);
  },

  "write-newsletter": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      topic = "",
      industry = "",
      product = "",
      promo = "",
      url = "",
      tone = "professional",
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Write one skimmable newsletter as JSON.",
      "Return only JSON, no markdown.",
      "JSON must be: {\"title\": string, \"body\": string}.",
      "Body should be plain text with short sections and bullet points.",
      `Tone: ${tone}`,
      topic ? `Topic: ${topic}` : "",
      industry ? `Industry: ${industry}` : "",
      product ? `Product/offer to mention: ${product}` : "",
      promo ? `Promo code (optional): ${promo}` : "",
      url ? `Link (optional): ${url}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent(
              "You reply with JSON only — one object with title and body. No markdown fences.",
              toneOfVoice,
            ),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (!out || typeof out.title !== "string" || typeof out.body !== "string") {
      res.status(500).json({ error: "Invalid newsletter shape", raw: out });
      return;
    }

    res.status(200).json({ title: out.title, body: out.body });
  },

  "generate-ads": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }

    const {
      scenario = "",
      product = "",
      promo = "",
      url = "",
      platforms = ["Facebook", "Instagram"],
      useEmoji = true,
      brandContext = "",
      toneOfVoice,
    } = req.body || {};

    let prompt = [
      "Generate ad variants as JSON.",
      "Return only JSON, no markdown.",
      "Output must be an array of ad objects with shape:",
      "{\"platform\": string, \"headline\": string, \"primaryText\": string, \"cta\": string, \"hashtags\": string[] }",
      "Generate 2 variants per platform. Keep X (Twitter) shorter.",
      useEmoji ? "You may use a small number of emojis." : "Do not use emojis.",
      product ? `Product/offer: ${product}` : "",
      promo ? `Promo code: ${promo}` : "",
      url ? `Landing URL: ${url}` : "",
      `Platforms: ${Array.isArray(platforms) ? platforms.join(", ") : String(platforms)}`,
      "Scenario/script:",
      String(scenario).trim().slice(0, 4000),
    ]
      .filter(Boolean)
      .join("\n");

    const bc = String(brandContext || "").trim();
    if (bc) prompt = `${bc}\n\n${prompt}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: mergeSystemContent(
              "You reply with JSON only — a JSON array of ad objects. No markdown fences.",
              toneOfVoice,
            ),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const text = stripMarkdownFence(data?.choices?.[0]?.message?.content || "");
    let out;
    try {
      out = JSON.parse(text);
    } catch {
      res.status(500).json({ error: "Model did not return valid JSON", raw: text.slice(0, 2000) });
      return;
    }

    if (!Array.isArray(out)) {
      res.status(500).json({ error: "Expected JSON array", raw: out });
      return;
    }

    res.status(200).json({ ads: out });
  },

  "help-assistant": async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "Missing OPENAI_API_KEY on server" });
      return;
    }
    const { question = "", section = "", uiLanguage = "en", toneOfVoice } = req.body || {};
    const q = String(question).trim().slice(0, 4000);
    if (!q) {
      res.status(400).json({ error: "Question required" });
      return;
    }
    const lang = String(uiLanguage || "en").slice(0, 24);
    const base = `You are the in-app help assistant for "Marketing OS", a browser-based local-first marketing workspace.

Main areas:
• Lead Finder — AI lead generation, scoring table, CRM stages/tags, Interested list, CSV export
• Funnel Builder — templates, AI Suggest Steps / Write Copy, journey canvas, tracking import, AI Analyze (optimization, expert PM/Finance/Tech), PDF report
• Business Hub — pipeline Kanban, calendar, segments, A/B tests, metrics, client report
• Email Campaigns — email/SMS templates, campaigns, schedule, conversions AI, newsletter, global schedule
• Ad Creator — FB/IG/X ad AI, image & video script
• Integrations — Slack/Trello/Zapier; Email platforms (Klaviyo/Mailchimp/SendGrid via /api/marketing-esps + Vercel keys); Trello Markdown export

Reply in the user's UI language when possible (preferred locale: ${lang}). Be concise; use short numbered or bullet steps. If unclear, ask one clarifying question.`;

    const userMsg = `User question:\n${q}\n\nCurrent section (if any): ${String(section).slice(0, 200)}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: mergeSystemContent(base, toneOfVoice) },
          { role: "user", content: userMsg },
        ],
        temperature: 0.45,
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(500).json({ error: "OpenAI error", detail: txt.slice(0, 2000) });
      return;
    }

    const data = await r.json();
    const answer = String(data?.choices?.[0]?.message?.content || "").trim();
    res.status(200).json({ answer: answer || "No response." });
  },

  /**
   * ESP / marketing platforms — keys only in Vercel env:
   * KLAVIYO_PRIVATE_API_KEY, MAILCHIMP_API_KEY, SENDGRID_API_KEY (optional MAILCHIMP_SERVER).
   * Body: { provider: "klaviyo"|"mailchimp"|"sendgrid", action: "ping"|"push_subscribers"|"pull_subscribers", listId?, subscribers?, limit? }
   */
  "marketing-esps": async (req, res) => {
    const body = req.body || {};
    const provider = String(body.provider || "klaviyo").toLowerCase().trim();
    const action = String(body.action || "").toLowerCase().trim();
    const listId = String(body.listId || "").trim();
    const subscribers = Array.isArray(body.subscribers) ? body.subscribers : [];
    const limit = Math.min(500, Math.max(1, Number(body.limit) || 100));

    const klaviyoHeaders = (key) => ({
      Authorization: `Klaviyo-API-Key ${key}`,
      revision: "2024-10-15",
      "Content-Type": "application/json",
    });

    try {
      if (action === "ping") {
        if (provider === "klaviyo") {
          const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва KLAVIYO_PRIVATE_API_KEY в средата на сървъра (Vercel)." });
            return;
          }
          const r = await fetch("https://a.klaviyo.com/api/lists?page[size]=1", { headers: klaviyoHeaders(apiKey) });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "Klaviyo отхвърли ключа", detail: txt.slice(0, 1500) });
            return;
          }
          res.status(200).json({ ok: true, provider: "klaviyo" });
          return;
        }
        if (provider === "mailchimp") {
          const apiKey = process.env.MAILCHIMP_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва MAILCHIMP_API_KEY в средата на сървъра (Vercel)." });
            return;
          }
          const dc = mailchimpDcFromKey(apiKey);
          const r = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
            headers: { Authorization: mailchimpAuthHeader(apiKey) },
          });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "Mailchimp ping неуспешен", detail: txt.slice(0, 1500) });
            return;
          }
          let pingJson = null;
          try {
            pingJson = JSON.parse(txt);
          } catch {
            /* ignore */
          }
          res.status(200).json({ ok: true, provider: "mailchimp", ping: pingJson });
          return;
        }
        if (provider === "sendgrid") {
          const apiKey = process.env.SENDGRID_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва SENDGRID_API_KEY в средата на сървъра (Vercel)." });
            return;
          }
          const r = await fetch("https://api.sendgrid.com/v3/user/profile", {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "SendGrid отхвърли ключа", detail: txt.slice(0, 1500) });
            return;
          }
          res.status(200).json({ ok: true, provider: "sendgrid" });
          return;
        }
        res.status(400).json({ ok: false, error: "Непознат provider", hint: "klaviyo | mailchimp | sendgrid" });
        return;
      }

      if (action === "push_subscribers") {
        if (!subscribers.length) {
          res.status(400).json({ ok: false, error: "Очаква се subscribers[] с обекти { name?, email?, phone? }" });
          return;
        }

        if (provider === "klaviyo") {
          const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва KLAVIYO_PRIVATE_API_KEY" });
            return;
          }
          const chunk = subscribers.slice(0, 1000).map((s) => {
            const email = String(s.email || "").trim();
            const phone = String(s.phone || "").trim();
            const name = String(s.name || "").trim();
            const parts = name.split(/\s+/).filter(Boolean);
            const attr = {};
            if (email) attr.email = email;
            if (phone) attr.phone_number = phone;
            if (parts[0]) attr.first_name = parts[0];
            if (parts.length > 1) attr.last_name = parts.slice(1).join(" ");
            return { type: "profile", attributes: attr };
          }).filter((x) => x.attributes.email || x.attributes.phone_number);

          if (!chunk.length) {
            res.status(400).json({ ok: false, error: "Няма валиден email или телефон в subscribers" });
            return;
          }

          const payload = {
            data: {
              type: "profile-bulk-import-job",
              attributes: {
                profiles: { data: chunk },
              },
            },
          };
          const r = await fetch("https://a.klaviyo.com/api/profile-bulk-import-jobs", {
            method: "POST",
            headers: klaviyoHeaders(apiKey),
            body: JSON.stringify(payload),
          });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "Klaviyo bulk import неуспешен", detail: txt.slice(0, 2000) });
            return;
          }
          let data;
          try {
            data = JSON.parse(txt);
          } catch {
            data = { raw: txt.slice(0, 500) };
          }
          res.status(200).json({
            ok: true,
            provider: "klaviyo",
            imported: chunk.length,
            job: data,
            note: listId
              ? "Профилите са в опашка за импорт. Ако трябва да са в конкретен list, добави ги от Klaviyo или ползвай list flows там."
              : null,
          });
          return;
        }

        if (provider === "mailchimp") {
          if (!listId) {
            res.status(400).json({ ok: false, error: "За Mailchimp е нужен listId (Mailchimp audience/list id)." });
            return;
          }
          const apiKey = process.env.MAILCHIMP_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва MAILCHIMP_API_KEY" });
            return;
          }
          const dc = mailchimpDcFromKey(apiKey);
          const base = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members`;
          const auth = { Authorization: mailchimpAuthHeader(apiKey), "Content-Type": "application/json" };
          let ok = 0;
          let failed = [];
          const slice = subscribers.slice(0, 500);
          for (let i = 0; i < slice.length; i += 12) {
            const batch = slice.slice(i, i + 12);
            await Promise.all(
              batch.map(async (s) => {
                const email = String(s.email || "").trim().toLowerCase();
                if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
                const name = String(s.name || "").trim();
                const parts = name.split(/\s+/).filter(Boolean);
                const merge = {};
                if (parts[0]) merge.FNAME = parts[0];
                if (parts.length > 1) merge.LNAME = parts.slice(1).join(" ");
                const phone = String(s.phone || "").trim();
                if (phone) merge.PHONE = phone;
                const hash = md5HexLower(email);
                const bodyMc = {
                  email_address: email,
                  status_if_new: "subscribed",
                  status: "subscribed",
                  merge_fields: merge,
                };
                const r = await fetch(`${base}/${hash}`, {
                  method: "PUT",
                  headers: auth,
                  body: JSON.stringify(bodyMc),
                });
                if (r.ok) ok += 1;
                else failed.push({ email, detail: (await r.text()).slice(0, 200) });
              }),
            );
          }
          res.status(200).json({
            ok: true,
            provider: "mailchimp",
            imported: ok,
            attempted: slice.length,
            failed: failed.slice(0, 20),
            failedCount: failed.length,
          });
          return;
        }

        if (provider === "sendgrid") {
          const apiKey = process.env.SENDGRID_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва SENDGRID_API_KEY" });
            return;
          }
          const contacts = subscribers.slice(0, 1000).map((s) => {
            const email = String(s.email || "").trim();
            const phone = String(s.phone || "").trim();
            const name = String(s.name || "").trim();
            const parts = name.split(/\s+/).filter(Boolean);
            const o = { email };
            if (parts[0]) o.first_name = parts[0];
            if (parts.length > 1) o.last_name = parts.slice(1).join(" ");
            if (phone) o.phone_number = phone;
            return o;
          }).filter((c) => c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));

          if (!contacts.length) {
            res.status(400).json({ ok: false, error: "Няма валидни email адреси за SendGrid" });
            return;
          }

          const payload = { contacts };
          if (listId) payload.list_ids = [listId];

          const r = await fetch("https://api.sendgrid.com/v3/marketing/contacts", {
            method: "PUT",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "SendGrid contacts PUT неуспешен", detail: txt.slice(0, 2000) });
            return;
          }
          let data;
          try {
            data = JSON.parse(txt);
          } catch {
            data = {};
          }
          res.status(200).json({ ok: true, provider: "sendgrid", imported: contacts.length, response: data });
          return;
        }

        res.status(400).json({ ok: false, error: "Непознат provider" });
        return;
      }

      if (action === "pull_subscribers") {
        if (provider === "klaviyo") {
          if (!listId) {
            res.status(400).json({ ok: false, error: "За Klaviyo pull е нужен listId (Klaviyo list id)." });
            return;
          }
          const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва KLAVIYO_PRIVATE_API_KEY" });
            return;
          }
          const url = `https://a.klaviyo.com/api/lists/${encodeURIComponent(listId)}/profiles/?page[size]=${limit}`;
          const r = await fetch(url, { headers: klaviyoHeaders(apiKey) });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "Klaviyo list profiles неуспешен", detail: txt.slice(0, 2000) });
            return;
          }
          const data = JSON.parse(txt);
          const rows = Array.isArray(data.data) ? data.data : [];
          const out = rows
            .map((row) => {
              const a = row.attributes || {};
              const email = String(a.email || "").trim();
              const phone = String(a.phone_number || "").trim();
              const fn = String(a.first_name || "").trim();
              const ln = String(a.last_name || "").trim();
              const name = [fn, ln].filter(Boolean).join(" ").trim();
              return { email, phone, name: name || (email ? email.split("@")[0] : "") };
            })
            .filter((x) => x.email || x.phone);
          res.status(200).json({
            ok: true,
            provider: "klaviyo",
            subscribers: out,
            hasMore: Boolean(data.links && data.links.next),
          });
          return;
        }

        if (provider === "mailchimp") {
          if (!listId) {
            res.status(400).json({ ok: false, error: "За Mailchimp pull е нужен listId." });
            return;
          }
          const apiKey = process.env.MAILCHIMP_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва MAILCHIMP_API_KEY" });
            return;
          }
          const dc = mailchimpDcFromKey(apiKey);
          const url = `https://${dc}.api.mailchimp.com/3.0/lists/${encodeURIComponent(listId)}/members?count=${limit}&offset=0&status=subscribed`;
          const r = await fetch(url, { headers: { Authorization: mailchimpAuthHeader(apiKey) } });
          const txt = await r.text();
          if (!r.ok) {
            res.status(r.status).json({ ok: false, error: "Mailchimp members неуспешен", detail: txt.slice(0, 2000) });
            return;
          }
          const data = JSON.parse(txt);
          const members = Array.isArray(data.members) ? data.members : [];
          const out = members.map((m) => {
            const email = String(m.email_address || "").trim();
            const mf = m.merge_fields || {};
            const fn = String(mf.FNAME || "").trim();
            const ln = String(mf.LNAME || "").trim();
            const phone = String(mf.PHONE || "").trim();
            const name = [fn, ln].filter(Boolean).join(" ").trim();
            return { email, phone, name: name || (email ? email.split("@")[0] : "") };
          });
          res.status(200).json({
            ok: true,
            provider: "mailchimp",
            subscribers: out,
            total: data.total_items,
          });
          return;
        }

        if (provider === "sendgrid") {
          const apiKey = process.env.SENDGRID_API_KEY;
          if (!apiKey) {
            res.status(500).json({ ok: false, error: "Липсва SENDGRID_API_KEY" });
            return;
          }
          const escaped = listId.replace(/'/g, "''");
          const queries = listId
            ? [
                `SELECT email, first_name, last_name, phone_number FROM contacts WHERE list_ids = '${escaped}' LIMIT ${limit}`,
                `SELECT email, first_name, last_name, phone_number FROM contacts LIMIT ${limit}`,
              ]
            : [`SELECT email, first_name, last_name, phone_number FROM contacts LIMIT ${limit}`];
          let lastErr = "";
          for (const q of queries) {
            const r = await fetch("https://api.sendgrid.com/v3/marketing/contacts/search", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ query: q }),
            });
            const txt = await r.text();
            if (!r.ok) {
              lastErr = txt;
              continue;
            }
            const data = JSON.parse(txt);
            const resArr = Array.isArray(data.result) ? data.result : [];
            const out = resArr
              .map((c) => {
                const email = String(c.email || "").trim();
                const phone = String(c.phone_number || "").trim();
                const fn = String(c.first_name || "").trim();
                const ln = String(c.last_name || "").trim();
                const name = [fn, ln].filter(Boolean).join(" ").trim();
                return { email, phone, name: name || (email ? email.split("@")[0] : "") };
              })
              .filter((x) => x.email || x.phone);
            res.status(200).json({
              ok: true,
              provider: "sendgrid",
              subscribers: out,
              note:
                listId && q === queries[queries.length - 1]
                  ? "Филтърът по list не върна резултат или не се поддържа — показани са първите контакти (лимит)."
                  : null,
            });
            return;
          }
          res.status(500).json({ ok: false, error: "SendGrid search неуспешен", detail: lastErr.slice(0, 2000) });
          return;
        }

        res.status(400).json({ ok: false, error: "Непознат provider" });
        return;
      }

      res.status(400).json({ ok: false, error: "Непозната action", hint: "ping | push_subscribers | pull_subscribers" });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  },
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const key = routeKeyFromReq(req).replace(/\/$/, "");
    const fn = handlers[key];
    if (!fn) {
      res.status(404).json({ error: "Unknown API route", route: key || "(empty)" });
      return;
    }
    await fn(req, res);
  } catch (e) {
    res.status(500).json({ error: "Server error", detail: String(e?.message || e) });
  }
}
