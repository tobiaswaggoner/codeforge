import React from "react";

// Design-only mock UI for the Multi-Agent Orchestrator
// - No data fetching
// - No real-time logic
// - Pure layout & styling (TailwindCSS assumed)

const agents = [
  {
    id: "auth",
    name: "AUTH",
    task: "Implement Authentication",
    project: "Customer Portal",
    status: "waiting", // working | waiting | done | error
    priority: "high", // low | medium | high
    lastUpdate: "2 min ago",
    question: "Welches Test-Framework soll für Auth verwendet werden?",
    suggestions: ["Jest", "Vitest", "Node Test Runner"],
    attentionScore: 0.92,
    lintStatus: "ok", // ok | fail | unknown
    testStatus: "fail", // ok | fail | unknown
    buildStatus: "ok", // ok | fail | unknown
    hasScreenshots: true,
  },
  {
    id: "ui",
    name: "UI",
    task: "Refine Dashboard Layout",
    project: "Orchestrator UI",
    status: "working",
    priority: "medium",
    lastUpdate: "just now",
    question: null,
    suggestions: [],
    attentionScore: 0.48,
    lintStatus: "ok",
    testStatus: "unknown",
    buildStatus: "ok",
    hasScreenshots: true,
  },
  {
    id: "tests",
    name: "TESTS",
    task: "Add Integration Tests",
    project: "Customer Portal",
    status: "done",
    priority: "low",
    lastUpdate: "10 min ago",
    question: null,
    suggestions: [],
    attentionScore: 0.15,
    lintStatus: "ok",
    testStatus: "ok",
    buildStatus: "ok",
    hasScreenshots: false,
  },
  {
    id: "refactor",
    name: "REFACTOR",
    task: "Refactor Auth Service",
    project: "Customer Portal",
    status: "waiting",
    priority: "medium",
    lastUpdate: "5 min ago",
    question: "Soll ich die alte Auth-Route deprecaten oder sofort entfernen?",
    suggestions: ["Deprecate first", "Remove now"],
    attentionScore: 0.76,
    lintStatus: "fail",
    testStatus: "fail",
    buildStatus: "unknown",
    hasScreenshots: false,
  },
];

const decisionQueue = agents
  .filter((a) => a.status === "waiting")
  .sort((a, b) => b.attentionScore - a.attentionScore);

const activityFeed = [
  {
    time: "10:24",
    agent: "AUTH",
    message: "DB-Schema für User angelegt und Migration geschrieben.",
    type: "update", // update | decision | error
  },
  {
    time: "10:22",
    agent: "REFACTOR",
    message: "Refactor Vorschlag vorbereitet, wartet auf Entscheidung.",
    type: "decision",
  },
  {
    time: "10:19",
    agent: "TESTS",
    message: "4 neue Integrationstests grün.",
    type: "update",
  },
];

const statusColor = {
  working: "bg-blue-500/10 text-blue-500 border-blue-500/40",
  waiting: "bg-amber-500/10 text-amber-500 border-amber-500/40",
  done: "bg-emerald-500/10 text-emerald-500 border-emerald-500/40",
  error: "bg-rose-500/10 text-rose-500 border-rose-500/40",
} as const;

const priorityChip = {
  high: "bg-red-500/10 text-red-500 border-red-500/40",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/40",
  low: "bg-gray-500/10 text-gray-400 border-gray-500/40",
} as const;

const typeIcon = {
  update: "⏺",
  decision: "❓",
  error: "⚠️",
} as const;

const metricChip = {
  ok: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  fail: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  unknown: "bg-slate-700/60 text-slate-300 border-slate-600/60",
} as const;

const projects = Array.from(
  agents.reduce((map, agent) => {
    if (!map.has(agent.project)) map.set(agent.project, [] as typeof agents);
    map.get(agent.project)!.push(agent);
    return map;
  }, new Map<string, typeof agents>())
);

export default function OrchestratorDashboardMock() {
  const [selectedAgentId, setSelectedAgentId] = React.useState("auth");
  const [screenshotAgentId, setScreenshotAgentId] = React.useState<string | null>(
    null
  );

  const selectedAgent =
    agents.find((a) => a.id === selectedAgentId) ?? agents[0];
  const screenshotAgent =
    agents.find((a) => a.id === screenshotAgentId) ?? null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-500 to-violet-500 flex items-center justify-center text-xs font-bold tracking-tight">
            MA
          </div>
          <div>
            <h1 className="text-sm font-semibold">Multi-Agent Orchestrator</h1>
            <p className="text-xs text-slate-400">
              Focus: Minimize mental context switch. You only see what needs your
              brain.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400">{agents.length} agents active</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-slate-400">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>{decisionQueue.length} decisions waiting</span>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: Agent overview + filters (grouped by project) */}
        <aside className="w-80 border-r border-slate-800 bg-slate-950/60 backdrop-blur flex flex-col">
          {/* Filters / controls */}
          <div className="p-3 border-b border-slate-800 flex flex-col gap-2">
            <div className="flex gap-2 text-xs">
              <button className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-left hover:border-slate-500">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Sort
                </span>
                <span className="text-xs">Attention score</span>
              </button>
              <button className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-left hover:border-slate-500">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500">
                  Focus mode
                </span>
                <span className="text-xs">Only blocking agents</span>
              </button>
            </div>
            <div className="flex gap-1 text-[10px] text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Working
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                Waiting
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Done
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                Lint / Tests / Build
              </span>
            </div>
          </div>

          {/* Agent list grouped by project */}
          <div className="flex-1 overflow-y-auto p-2 space-y-3">
            {projects.map(([projectName, projectAgents]) => (
              <div key={projectName} className="space-y-1">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] uppercase tracking-wide text-slate-500">
                    {projectName}
                  </h3>
                  <span className="text-[10px] text-slate-600">
                    {projectAgents.length} agents
                  </span>
                </div>
                {projectAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={[
                      "w-full text-left rounded-xl px-3 py-2 flex flex-col gap-1 border transition",
                      selectedAgentId === agent.id
                        ? "border-sky-500/70 bg-sky-500/10 shadow-[0_0_0_1px_rgba(56,189,248,0.4)]"
                        : "border-slate-800 bg-slate-900/40 hover:border-slate-600",
                    ].join(" ")}
                  >
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg bg-slate-800 flex items-center justify-center text-[10px] font-semibold">
                          {agent.name[0]}
                        </div>
                        <div>
                          <div className="text-xs font-semibold flex items-center gap-1">
                            {agent.name}
                            {agent.status === "waiting" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/40">
                                Needs input
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[150px]">
                            {agent.task}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${statusColor[agent.status]}`}
                      >
                        {agent.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-500">
                      <span>Last: {agent.lastUpdate}</span>
                      <span>Focus: {(agent.attentionScore * 100).toFixed(0)}%</span>
                    </div>
                    {/* Code health metrics */}
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex gap-1 text-[9px]">
                        <span
                          className={`px-1.5 py-0.5 rounded-full border ${metricChip[agent.lintStatus]}`}
                        >
                          Lint
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full border ${metricChip[agent.testStatus]}`}
                        >
                          Tests
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full border ${metricChip[agent.buildStatus]}`}
                        >
                          Build
                        </span>
                      </div>
                      {agent.hasScreenshots && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScreenshotAgentId(agent.id);
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-sky-500/50 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20"
                        >
                          Screens
                        </button>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER: Decision queue + agent detail */}
        <main className="flex-1 flex flex-col">
          {/* Decision queue */}
          <section className="border-b border-slate-800 bg-slate-950/60 px-4 py-3 flex gap-4 items-start">
            <div className="w-80 shrink-0">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Decision queue
                </h2>
                <span className="text-[10px] text-slate-500">
                  {decisionQueue.length} blocking
                </span>
              </div>
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {decisionQueue.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className="w-full rounded-lg border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-left hover:border-amber-400"
                  >
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className="font-semibold text-amber-100 flex items-center gap-1">
                        {agent.name}
                        <span className="text-[9px] uppercase tracking-wide text-amber-300/80">
                          {agent.project}
                        </span>
                      </span>
                      <span className="text-[10px] text-amber-300/80">
                        {(agent.attentionScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-50 line-clamp-2">
                      {agent.question ?? "Agent wartet auf Entscheidung"}
                    </p>
                    <div className="mt-1 flex gap-1 text-[9px]">
                      <span
                        className={`px-1.5 py-0.5 rounded-full border ${metricChip[agent.testStatus]}`}
                      >
                        Tests
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full border ${metricChip[agent.buildStatus]}`}
                      >
                        Build
                      </span>
                    </div>
                  </button>
                ))}
                {decisionQueue.length === 0 && (
                  <p className="text-[11px] text-slate-500 italic">
                    Keine offenen Entscheidungen. Lass sie arbeiten.
                  </p>
                )}
              </div>
            </div>

            {/* Selected agent detail */}
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">
                      {selectedAgent.name} – {selectedAgent.task}
                    </h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700 text-slate-400">
                      {selectedAgent.project}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Status: {selectedAgent.status}, last update {selectedAgent.lastUpdate}
                  </p>
                </div>
                <div className="flex gap-2 items-center text-[10px]">
                  <span className="px-2 py-1 rounded-full border border-slate-700 text-slate-300">
                    Focus {Math.round(selectedAgent.attentionScore * 100)}%
                  </span>
                  {selectedAgent.hasScreenshots && (
                    <button
                      className="px-2 py-1 rounded-full border border-sky-500/70 text-sky-300 hover:bg-sky-500/10"
                      onClick={() => setScreenshotAgentId(selectedAgent.id)}
                    >
                      Screenshots
                    </button>
                  )}
                  <button className="px-2 py-1 rounded-full border border-slate-700 text-slate-300 hover:border-rose-500/70 hover:text-rose-300">
                    Kill agent
                  </button>
                </div>
              </div>

              {/* Code health summary for selected agent */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2 flex items-center justify-between text-[11px]">
                <div className="flex gap-2 items-center">
                  <span className="text-slate-400 mr-1">Code health:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full border ${metricChip[selectedAgent.lintStatus]}`}
                  >
                    Lint
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border ${metricChip[selectedAgent.testStatus]}`}
                  >
                    Tests
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full border ${metricChip[selectedAgent.buildStatus]}`}
                  >
                    Build
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">
                  Werte kommen direkt aus Linter/Tests/Build-Output.
                </span>
              </div>

              {/* Question + suggestions */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 flex flex-col gap-2">
                {selectedAgent.question ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] uppercase tracking-wide text-amber-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
                        Agent needs a decision
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Orchestrator condensed the question
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-50">
                      {selectedAgent.question}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedAgent.suggestions.map((s, idx) => (
                        <button
                          key={idx}
                          className="px-2.5 py-1.5 rounded-full border border-amber-500/50 bg-amber-500/10 text-[11px] text-amber-50 hover:bg-amber-500/20"
                        >
                          {s}
                        </button>
                      ))}
                      <button className="px-2.5 py-1.5 rounded-full border border-slate-600 bg-slate-900 text-[11px] text-slate-200 hover:border-slate-400">
                        Custom answer…
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Agent benötigt aktuell keinen Input.</span>
                    <span className="text-slate-500">Du darfst ihn ignorieren.</span>
                  </div>
                )}
              </div>

              {/* Chat placeholder */}
              <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950/60 p-3 flex flex-col">
                <p className="text-[11px] text-slate-500 mb-2">
                  Agent conversation (latest turns). Nur die letzten 3–5 Nachrichten,
                  der Rest ist per Klick aufklappbar. Du siehst nur, was für die
                  aktuelle Entscheidung relevant ist.
                </p>
                <div className="flex-1 rounded-md border border-slate-800 bg-slate-900/60 mb-3 p-2 text-[11px] text-slate-300 overflow-y-auto">
                  <p className="text-slate-400 italic">
                    (Hier nur ein Mock: In echt zeigst du die letzten 3–5 Turns mit
                    dezenter Typographie, ältere Messages collapsed.)
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="Optionaler Zusatzkontext für die nächste Antwort…"
                  />
                  <button className="px-3 py-1.5 rounded-lg bg-sky-500 text-[12px] font-medium text-slate-950 hover:bg-sky-400">
                    Send to agent
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT: Activity feed / meta */}
          <section className="flex-1 flex">
            {/* Activity feed */}
            <div className="w-80 border-l border-slate-800 bg-slate-950/70 flex flex-col">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Activity
                </h2>
                <span className="text-[10px] text-slate-500">Last 30 min</span>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 text-[11px]">
                {activityFeed.map((e, idx) => (
                  <div
                    key={idx}
                    className="flex gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5"
                  >
                    <div className="mt-0.5 text-slate-500 text-xs">
                      {typeIcon[e.type]}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between mb-0.5">
                        <span className="font-semibold text-slate-100">
                          {e.agent}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {e.time}
                        </span>
                      </div>
                      <p className="text-slate-300">{e.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
                <span>Budget today: $12.40</span>
                <span>Tokens used: 185k</span>
              </div>
            </div>

            {/* Spacer right side (optional future panel) */}
            <div className="flex-1 hidden xl:block bg-gradient-to-tl from-slate-950 via-slate-950 to-slate-900/40 border-l border-slate-900/80" />
          </section>
        </main>
      </div>

      {/* Screenshot modal */}
      {screenshotAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-4xl h-[70vh] bg-slate-950 border border-slate-800 rounded-2xl shadow-xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  Screenshots – {screenshotAgent.name}
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700 text-slate-400">
                    {screenshotAgent.project}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Letzte UI-Snapshots aus Playwright / MCP. Nur zur schnellen visuelle
                  Kontrolle.
                </p>
              </div>
              <button
                onClick={() => setScreenshotAgentId(null)}
                className="text-[11px] px-2 py-1 rounded-full border border-slate-700 text-slate-300 hover:border-rose-500/70 hover:text-rose-300"
              >
                Close
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {/* Mock thumbnails */}
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="aspect-video rounded-xl border border-slate-800 bg-slate-900/80 flex items-center justify-center text-[11px] text-slate-500"
                  >
                    Screenshot {i}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
