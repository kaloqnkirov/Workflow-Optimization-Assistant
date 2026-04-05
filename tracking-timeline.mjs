/**
 * Vertical optimization timeline — React + lucide-react (esm.sh).
 * Expert mode: tabbed personas (PM, Finance, Tech).
 */
import React from "https://esm.sh/react@18.2.0";
import { createRoot } from "https://esm.sh/react-dom@18.2.0/client?deps=react@18.2.0";
import {
  Target,
  LineChart,
  Lightbulb,
  Users,
  MousePointerClick,
  Mail,
  Settings,
  Zap,
  TrendingUp,
  Rocket,
  BarChart3,
} from "https://esm.sh/lucide-react@0.460.0?deps=react@18.2.0";

const ICON_BY_HINT = {
  target: Target,
  analytics: LineChart,
  measurement: BarChart3,
  creative: Lightbulb,
  audience: Users,
  conversion: MousePointerClick,
  email: Mail,
  ops: Settings,
  speed: Zap,
  growth: TrendingUp,
  launch: Rocket,
};

const ICON_CYCLE = [Target, Lightbulb, TrendingUp, BarChart3, Users, Zap, Rocket, LineChart];

function pickIcon(hint, index) {
  const key = String(hint || "")
    .toLowerCase()
    .trim();
  if (key && ICON_BY_HINT[key]) return ICON_BY_HINT[key];
  return ICON_CYCLE[index % ICON_CYCLE.length];
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function hashStr(s) {
  let h = 2166136261;
  const str = String(s || "");
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  return Math.abs(h);
}

/** Estimated % gain per dimension — derived from plan depth (no extra API fields). */
export function computeEfficiencyGainBars(data) {
  const items = [];
  if (data && data.expertMode && Array.isArray(data.perspectives) && data.perspectives.length >= 3) {
    data.perspectives.forEach((p, i) => {
      const steps = Array.isArray(p.optimizationSteps) ? p.optimizationSteps : [];
      const insights = Array.isArray(p.insights) ? p.insights : [];
      const depth = steps.length + insights.length * 0.45;
      const gain = clamp(Math.round(15 + depth * 5.2 + (hashStr(p.summary || "") % 9)), 12, 48);
      const label = (p.label || ["Project", "Finance", "Tech"][i] || "Area").slice(0, 28);
      items.push({ label, gain });
    });
    return items;
  }
  const steps = Array.isArray(data?.optimizationSteps) ? data.optimizationSteps : [];
  const insights = Array.isArray(data?.insights) ? data.insights : [];
  const byHint = {};
  steps.forEach((s) => {
    const h = String(s.iconHint || "general").toLowerCase();
    byHint[h] = (byHint[h] || 0) + 1;
  });
  const dims = [
    { key: "speed", name: "Velocity" },
    { key: "analytics", name: "Measurement" },
    { key: "conversion", name: "Conversion" },
    { key: "ops", name: "Operations" },
  ];
  dims.forEach(({ key, name }) => {
    const count = byHint[key] || 0;
    const base = 14 + (hashStr(String(data?.summary || "")) % 11);
    const gain = clamp(Math.round(base + count * 8 + insights.length * 2.2), 10, 52);
    items.push({ label: name, gain });
  });
  return items;
}

const GAIN_SCALE_MAX = 55;

function EfficiencyGainChart({ items }) {
  if (!items || !items.length) return null;
  return React.createElement(
    "div",
    {
      className: "efficiency-gain-chart",
      role: "img",
      "aria-label": "Estimated efficiency gain by area after optimization",
    },
    React.createElement("div", { className: "efficiency-gain-chart-title" }, "Efficiency gain (estimated)"),
    React.createElement(
      "div",
      { className: "efficiency-gain-chart-bars" },
      items.map((item, i) =>
        React.createElement(
          "div",
          { key: `${item.label}-${i}`, className: "efficiency-gain-row" },
          React.createElement("div", { className: "efficiency-gain-label", title: item.label }, item.label),
          React.createElement(
            "div",
            { className: "efficiency-gain-track" },
            React.createElement("div", {
              className: "efficiency-gain-fill",
              style: { width: `${clamp((item.gain / GAIN_SCALE_MAX) * 100, 8, 100)}%` },
            }),
          ),
          React.createElement("div", { className: "efficiency-gain-pct" }, `+${item.gain}%`),
        ),
      ),
    ),
    React.createElement(
      "p",
      { className: "efficiency-gain-footnote" },
      "Projection from your optimization plan depth (illustrative).",
    ),
  );
}

function Timeline({ data, showGainChart = true }) {
  const steps = Array.isArray(data.optimizationSteps) ? data.optimizationSteps : [];
  const insights = Array.isArray(data.insights) ? data.insights : [];

  const gainItems = computeEfficiencyGainBars(data);
  return React.createElement(
    "div",
    { className: "optimization-tl-root" },
    showGainChart ? React.createElement(EfficiencyGainChart, { items: gainItems }) : null,
    data.summary
      ? React.createElement("p", { className: "optimization-tl-summary" }, data.summary)
      : null,
    steps.length > 0
      ? React.createElement(
          "div",
          { className: "optimization-tl-track", role: "list" },
          steps.map((s, i) => {
            const Icon = pickIcon(s.iconHint, i);
            const stepNum = typeof s.step === "number" ? s.step : i + 1;
            return React.createElement(
              "div",
              {
                key: `step-${stepNum}-${i}`,
                className: "optimization-tl-item",
                role: "listitem",
              },
              React.createElement(
                "span",
                { className: "optimization-tl-dot", "aria-hidden": true },
                React.createElement(Icon, { size: 18, strokeWidth: 2 }),
              ),
              React.createElement("div", { className: "optimization-tl-step-label" }, `Step ${stepNum}`),
              React.createElement("div", { className: "optimization-tl-title" }, s.title || ""),
              React.createElement("div", { className: "optimization-tl-detail" }, s.detail || ""),
            );
          }),
        )
      : null,
    insights.length > 0
      ? React.createElement(
          "div",
          { className: "optimization-tl-insights" },
          React.createElement("h4", null, "Supporting insights"),
          React.createElement(
            "ul",
            null,
            insights.map((x, i) => React.createElement("li", { key: i }, x)),
          ),
        )
      : null,
  );
}

function ExpertPersonaTabs({ data }) {
  const perspectives = Array.isArray(data.perspectives) ? data.perspectives : [];
  const [tab, setTab] = React.useState(0);
  const safeIdx = Math.min(Math.max(0, tab), Math.max(0, perspectives.length - 1));
  const p = perspectives[safeIdx] || {};
  const subData = {
    summary: p.summary || "",
    optimizationSteps: Array.isArray(p.optimizationSteps) ? p.optimizationSteps : [],
    insights: Array.isArray(p.insights) ? p.insights : [],
  };
  const gainItems = computeEfficiencyGainBars(data);

  return React.createElement(
    "div",
    { className: "expert-persona-root" },
    React.createElement(EfficiencyGainChart, { items: gainItems }),
    React.createElement(
      "div",
      { className: "expert-persona-tabs", role: "tablist", "aria-label": "Expert perspectives" },
      perspectives.map((pers, i) =>
        React.createElement(
          "button",
          {
            key: pers.id || `pers-${i}`,
            type: "button",
            role: "tab",
            id: `expert-tab-${i}`,
            "aria-selected": safeIdx === i,
            "aria-controls": `expert-panel-${i}`,
            className: "expert-persona-tab" + (safeIdx === i ? " expert-persona-tab-active" : ""),
            onClick: () => setTab(i),
          },
          React.createElement("span", { className: "expert-persona-tab-title" }, pers.label || "Perspective"),
          React.createElement(
            "span",
            { className: "expert-persona-tab-focus" },
            pers.focus ? `Focus: ${pers.focus}` : "",
          ),
        ),
      ),
    ),
    React.createElement(
      "div",
      {
        className: "expert-persona-panel",
        role: "tabpanel",
        id: `expert-panel-${safeIdx}`,
        "aria-labelledby": `expert-tab-${safeIdx}`,
      },
      React.createElement(Timeline, { data: subData, showGainChart: false }),
    ),
  );
}

const roots = new WeakMap();

export function mountTrackingOptimizationTimeline(container, data) {
  if (!container) return;
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  const expert =
    data &&
    data.expertMode &&
    Array.isArray(data.perspectives) &&
    data.perspectives.length >= 3;
  root.render(
    React.createElement(expert ? ExpertPersonaTabs : Timeline, {
      data,
    }),
  );
}

export function unmountTrackingOptimizationTimeline(container) {
  if (!container) return;
  const root = roots.get(container);
  if (root) {
    root.unmount();
    roots.delete(container);
  }
  container.innerHTML = "";
}
