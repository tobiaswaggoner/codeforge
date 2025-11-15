# Multi-Agent Orchestrator - Konzept

## Problem Statement

Bei paralleler Arbeit mit mehreren Claude Code Agents (z.B. UI + Backend + Tests gleichzeitig) entsteht kognitiver Overhead durch permanente Context-Switches:
- Welcher Agent arbeitet gerade woran?
- Wo braucht ein Agent User-Input?
- Was ist der aktuelle Status aller Handlungsstränge?
- Welcher Agent hat Probleme?

Das menschliche Gehirn kämpft mit dem Tracking von 5+ parallelen Konversationen.

## Grundidee

Ein **Orchestrator** sitzt zwischen User und Coding-Agents als "Teflon Manager":
- Managed mehrere parallel laufende Agents
- Fasst Status und Fragen kompakt zusammen
- Routet User-Input zu den richtigen Agents
- Kommuniziert klar: "Du sprichst mit Agent X zur Task Y. Er braucht Z von dir."
- Kann später autonome Entscheidungen bei Routine-Fragen treffen

## Erwartete Benefits

### Sofort (Phase 1)
- **Reduzierter Mental Load** - Dashboard zeigt auf einen Blick alle Agent-Stati
- **Fokussierte Interaktion** - Kein Tab-Switching zwischen Agents
- **Klarer Kontext** - Immer sichtbar: Mit wem rede ich? Was ist seine Aufgabe?
- **Parallele Execution** - Mehrere Agents arbeiten gleichzeitig an verschiedenen Tasks
- **Status-Transparenz** - Sofort erkennbar: Wer arbeitet? Wer wartet? Wer ist fertig?

### Mittelfristig (Phase 2+)
- **Orchestrator-Autonomie** - Bei Standard-Entscheidungen antwortet Orchestrator selbst
- **Cross-Project Coordination** - Agents können projektübergreifend koordiniert werden
- **Session Replay** - Alle Agent-Aktivitäten sind in Session-Files persistent
- **Adaptive Priorisierung** - Orchestrator erkennt blockierte Agents und fragt gezielt nach

## Architektur

### High-Level Design

```
┌──────────────────────────────────┐
│   Dashboard UI (Web/Browser)     │
│   - Agent-Liste (Status, Task)   │
│   - Chat-Area pro Agent          │
│   - Input-Routing                │
└────────────┬─────────────────────┘
             │ WebSocket (Real-time)
┌────────────▼─────────────────────┐
│  Orchestrator Backend (Node.js)  │
│  - Agent Session Management      │
│  - Process Spawning (claude CLI) │
│  - Status Aggregation            │
│  - Input Routing                 │
│  - (Optional) LLM Summarization  │
└────────────┬─────────────────────┘
             │
   ┌─────────┼─────────┬───────────┐
   │         │         │           │
   ▼         ▼         ▼           ▼
┌─────┐  ┌─────┐  ┌─────┐    ┌─────┐
│Agent│  │Agent│  │Agent│    │Agent│
│  #1 │  │  #2 │  │  #3 │    │  #N │
└──┬──┘  └──┬──┘  └──┬──┘    └──┬──┘
   │        │        │           │
   ▼        ▼        ▼           ▼
~/.claude/projects/<project>/
  ├── session-uuid-1.jsonl  ← Agent #1 persistent state
  ├── session-uuid-2.jsonl  ← Agent #2 persistent state
  └── session-uuid-3.jsonl  ← Agent #3 persistent state
```

### Kernprinzipien

1. **Sessions als Source of Truth**
   - Alle Agent-Stati persistent in `~/.claude/projects/`
   - Claude Code native Session-Mechanismus wird genutzt
   - Orchestrator ist zustandslos (kann jederzeit neu starten)

2. **Ephemeral Processes**
   - Jeder Agent-Turn = ein `claude --continue` Prozess
   - Prozess läuft bis Completion, dann Exit
   - Kein langlebiger State in Memory
   - Bei Bedarf: Kill ohne Context-Verlust

3. **Headless Claude Code**
   - `claude --continue "prompt" --session-id <uuid>`
   - `--output-format stream-json` für strukturiertes Parsing
   - Jeder Agent = eine isolierte Session

4. **Real-time Communication**
   - WebSocket für Live-Updates ans UI
   - Status-Änderungen werden sofort propagiert
   - User-Input wird sofort geroutet

## Agent-Lifecycle

```
1. User: "Create Agent for Task: Implement Authentication"
   ↓
2. Orchestrator: Generate session-uuid, spawn:
   claude --continue "You are Agent AUTH. Task: Implement Auth" --session-id <uuid>
   ↓
3. Process läuft, arbeitet, schreibt in session-uuid.jsonl
   ↓
4. Process terminiert (Task done oder braucht Input)
   ↓
5. Orchestrator: Parse last message from session-uuid.jsonl
   ↓
6. Orchestrator (optional via LLM): Summarize
   "Agent AUTH ist fertig mit DB-Schema. Braucht: Welches Test-Framework?"
   ↓
7. WebSocket → UI: Update Agent-Status + Question
   ↓
8. User antwortet ODER Orchestrator entscheidet autonom
   ↓
9. Orchestrator: spawn claude --continue "Answer: Jest" --session-id <uuid>
   ↓
   (zurück zu 3)
```

### Wann braucht Agent Input?

**Einfache Heuristik:**
- Process beendet (exit) → Agent braucht Input (außer Task explizit abgeschlossen)
- Orchestrator liest letzte Assistant-Message
- Erkennt Frage oder Task-Completion
- Routet entsprechend

## Phasen

### Phase 1: Basic Orchestrator (MVP)

**Ziel:** Mehrere Agents parallel laufen lassen, Status sehen, Input routen

**Features:**
- Create Agent: `POST /agents { task, project }`
- List Agents: `GET /agents` → alle aktiven Agents mit Status
- Agent Status: `GET /agents/:id` → aktueller Output, wartet auf Input?
- Send Input: `POST /agents/:id/input { message }`
- Kill Agent: `DELETE /agents/:id`
- WebSocket: Real-time Status-Updates

**Backend (Node.js):**
- Express + WebSocket Server
- Agent Registry (in-memory: `{ agentId, sessionId, task, status, lastOutput }`)
- Process Spawner: `spawn('claude', ['--continue', ...])`
- Session Parser: Read `.jsonl`, extract last messages
- Status Aggregator: "Agent X working", "Agent Y waiting", "Agent Z done"

**Frontend (Web Dashboard):**
- Sidebar: Agent-Liste (Name, Task, Status-Icon)
- Main Area: Selected Agent's Chat-History
- Input Field: Route Input zu aktivem Agent
- Status Indicators: 🟢 Working, 🟡 Waiting, ✅ Done, ❌ Error

**Test:**
- Start 2 Agents parallel
- Watch them work
- Provide Input when needed
- Complete tasks

---

### Phase 2: Orchestrator Intelligence

**Ziel:** Orchestrator kann selbst einfache Entscheidungen treffen

**Features:**
- Orchestrator ist selbst ein LLM (claude)
- Bei Agent-Fragen: Orchestrator evaluiert
  - Routine-Frage? → Antwortet selbst
  - Wichtige Entscheidung? → Fragt User
- User kann Orchestrator-Autonomie-Level einstellen
  - Level 1: Fragt immer
  - Level 2: Entscheidet bei Standard-Patterns
  - Level 3: Nur kritische Fragen an User

**Implementation:**
- Orchestrator-Loop: Checkt Agent-Stati
- Bei "Waiting": Spawn Orchestrator-Agent
  - Prompt: "Agent X fragt Y. Kannst du entscheiden oder braucht es User?"
  - Orchestrator antwortet: "Ich entscheide: Z" ODER "Frage User"
- Logging: Alle autonomen Entscheidungen sind transparent

---

### Phase 3: Proaktive Project Discovery & Suggestions

**Ziel:** Orchestrator identifiziert selbstständig Projekte, die weitergetrieben werden können

**Konzept:**
- Orchestrator scannt regelmäßig alle Sessions in `~/.claude/projects/`
- Analysiert: Welche Projekte haben seit >X Tagen keine Aktivität?
- Identifiziert "Stuck Points": Wo steht ein Projekt? Was fehlt?
- Macht konkrete Vorschläge: "Projekt X wartet auf: Y. Soll ich weitermachen?"

**Features:**

1. **Historical Session Analysis**
   - Zugriff auf unbegrenzte Historie (Retention disabled)
   - Parse alte Sessions: Was war der letzte Stand?
   - Erkennung von Blocker-Patterns:
     - "Wartet auf User-Entscheidung" → identifiziere Frage
     - "Test failed" → schlägt Fix vor
     - "50% implementiert" → schlägt Completion vor

2. **Proactive Suggestions Dashboard**
   - UI zeigt: "3 Projekte können weitergetrieben werden"
   - Pro Projekt: Last Activity, Current Blocker, Suggested Next Step
   - One-Click Approve: "Ja, mach weiter mit Vorschlag X"
   - Beispiel:
     ```
     📦 Project: Auth-Module
     Last Active: 5 days ago
     Status: OAuth implementation 70% done
     Blocker: Test setup missing
     Suggestion: "Soll ich Jest konfigurieren und Tests schreiben?"
     [ Approve ] [ Skip ] [ Customize ]
     ```

3. **Smart Prioritization**
   - Orchestrator bewertet Projekte nach:
     - Business Value (aus CLAUDE.md oder Tags)
     - Completion-Grad (wie weit ist es?)
     - Blockage-Time (wie lange stuck?)
   - Schlägt vor: "Top 3 Projekte zum Weitermachen heute"

4. **Auto-Resume with Approval**
   - User approves → Orchestrator spawnt Agent
   - Agent continued genau dort, wo es aufhörte
   - Orchestrator gibt Context-Summary mit
   - Agent arbeitet bis nächster Entscheidungspunkt

**Implementation:**
- Cron-Job: Täglich/Wöchentlich Session-Scan
- Analysis-Agent: Liest Sessions, extrahiert Status
- Suggestion-Engine: Macht konkrete Next-Step-Vorschläge
- Approval-Queue: User sieht Vorschläge, approved batch-weise

---

### Phase 4: Autonomous Multi-Project Agent (Vision)

**Ziel:** Vollautonomer Agent der kontinuierlich an beliebig vielen Projekten arbeitet

**Konzept:**
- **Self-Directed Development:** Agent entscheidet selbst an was er arbeitet
- **Budget-Limited:** Nur durch Kosten und Inference-Capacity limitiert
- **Human-in-the-Loop nur bei Kern-Entscheidungen:**
  - Architektur-Änderungen
  - Breaking Changes
  - Business-Logic-Entscheidungen
  - Security-relevante Changes
- **Alles andere:** Agent macht autonom weiter

**Features:**

1. **Autonomous Work Queue**
   - Agent managed eigene Prioritäts-Queue
   - Arbeitet Tasks ab: Bug-Fixes, Feature-Completion, Refactorings, Tests
   - Wechselt zwischen Projekten basierend auf:
     - Priority-Score
     - Dependencies (Project A braucht Project B)
     - User-Hints ("Auth hat Prio")

2. **Self-Optimization**
   - Agent lernt aus Historie: Welche Tasks waren erfolgreich?
   - Passt Strategien an: "Bei Testing immer zuerst Haiku versuchen"
   - Erkennt Patterns: "User approved letzte 10 UI-Änderungen → mehr Autonomie"

3. **Minimal User Interaction**
   - Täglicher Report: "Heute abgeschlossen: X, Y, Z. In Progress: A, B. Brauche Input bei: C"
   - User setzt nur noch:
     - High-Level Goals ("Feature X fertig bis Freitag")
     - Approvals bei kritischen Entscheidungen
     - Budget-Limits ("Max $50/Tag")

4. **Multi-Project Coordination**
   - Agent erkennt Cross-Project Dependencies
   - Beispiel: "Frontend braucht neue API aus Backend"
   - Arbeitet koordiniert: Backend-Änderung → Frontend-Update
   - User sieht nur: "Feature X fertig (touched 3 projects)"

5. **Safety & Control**
   - Alle Changes transparent (Git Commits)
   - Rollback bei Problemen
   - User kann jederzeit eingreifen
   - "Pause All" Button im Dashboard
   - Audit-Log: Was hat Agent wann entschieden?

**Limitierungen (bewusst):**
- Keine Deployments ohne Approval
- Keine Datenlöschungen ohne Approval
- Keine Breaking API Changes ohne Approval
- Budget-Hard-Limit (Agent stoppt wenn erreicht)

**Beispiel eines typischen Tages:**
```
08:00 - Agent startet, scannt 15 aktive Projekte
08:05 - Identifiziert 23 Tasks (Bugs, Features, Tests)
08:10 - Arbeitet an Project A: Bug-Fix
08:45 - Bug gefixt, Tests grün, committed
08:50 - Wechselt zu Project B: Feature 70% → completion
10:30 - Feature done, braucht Approval für API-Change
      → Notification an User, wartet
11:00 - User approved
11:05 - Agent macht API-Change, updated Docs
12:00 - Wechselt zu Project C: Schreibt Tests
14:00 - User sieht Report: "3 Tasks done, 1 waiting approval, 2 in progress"
```

**Vision:**
> Ein Agent der wie ein "Junior Developer" arbeitet:
> Macht Routine-Work autonom, fragt bei wichtigen Entscheidungen,
> arbeitet kontinuierlich an Portfolio von Projekten,
> limitiert nur durch Budget und menschliche Oversight.

---

### Phase 5: Advanced Features (Weitere Ideen)

**Potentielle Erweiterungen:**

1. **Cross-Agent Communication**
   - Agent #1 kann Ergebnis von Agent #2 abrufen
   - Orchestrator vermittelt
   - "Agent AUTH braucht DB-Schema von Agent STORAGE"

2. **Dependency Management**
   - Agent #1 blocked by Agent #2
   - Orchestrator erkennt, priorisiert

3. **Template-Agents**
   - Vordefinierte Agent-Rollen
   - "Spawn Testing Agent for Module X"
   - Agent kennt Best Practices, Standards

4. **Multi-Project Orchestration**
   - Orchestrator managed Agents über Projekt-Grenzen
   - "Sync API zwischen Frontend + Backend Projekt"

5. **Session Replay & Analysis**
   - Replay Agent-Verlauf
   - "Was hat Agent X zwischen 14:00-15:00 gemacht?"
   - Analyse: Welche Agents sind effizient? Wo gibt's Loops?

6. **RAG-basierte Knowledge Base**
   - Orchestrator hat Zugriff auf projektübergreifendes Wissen
   - Coding Guidelines, Best Practices, Standards
   - Kann Agent-Fragen substanziell beantworten (ohne User)
   - Beispiel: "Agent fragt nach Naming Convention → Orchestrator liefert aus Guidelines"
   - Automatische CLAUDE.md Konfiguration für neue Projekte
   - Knowledge-Quellen: Confluence, Git Repos, Docs, bisherige Sessions

7. **Context Window & Cost Management**
   - Orchestrator überwacht Context-Usage aller Agents
   - Model-Selection pro Agent/Task:
     - Einfache Tasks → Haiku (günstig, schnell)
     - Komplexe Tasks → Sonnet/Opus (teuer, smart)
   - Warnung bei drohendem Context-Overflow
   - Proaktive Steuerung:
     - "Agent #2 bei 180k/200k → Suggest Checkpoint/Split"
     - Verhindert Auto-Compact (Performance-Killer)
   - Cost-Tracking: "Projekt X hat heute $5.20 gekostet"
   - Budget-Limits: "Stoppe Agent wenn >$10/Tag"

8. **Specialist Agents - "Stabsstelle" für den Orchestrator**
   - Zusätzlich zu Coding-Agents: Spezial-Agents als Tools/Berater
   - **Company Knowledge Agent:**
     - Eigenes Projekt/Session mit long-running Context
     - Behält Überblick über alle Projekte, moving parts, Zusammenhänge
     - Zu groß für ein einzelnes Context-Window → lebt in eigener Session
     - Orchestrator ruft ihn bei Bedarf (MCP-like Tool-Calling)
   - **Deep Research Agent:**
     - Recherchiert komplexe technische Fragen
     - Durchsucht Docs, Stack Overflow, Git History
     - Liefert fundierte Antworten zurück an Orchestrator
   - **Architecture Agent:**
     - Kennt System-Architektur über Projekt-Grenzen
     - "Wie hängen Service A und Service B zusammen?"
     - Validiert Architektur-Entscheidungen von Coding-Agents
   - Orchestrator-Workflow:
     - Coding-Agent: "Wie implementieren wir OAuth hier?"
     - Orchestrator → fragt Company Knowledge Agent
     - Knowledge Agent → liefert Context aus internen Guidelines
     - Orchestrator → routet Antwort zurück an Coding-Agent
   - Vorteil: Unbegrenzter Gesamt-Context durch Agent-Spezialisierung

## Tech Stack

**Backend:**
- Node.js + Express
- WebSocket (ws library oder Socket.IO)
- Child Process Spawning (`child_process.spawn`)
- JSONL Parsing (readline/fs)

**Frontend:**
- HTML/CSS/Vanilla JS (wie aktuelles Dashboard)
- WebSocket Client
- Responsive Layout (Sidebar + Main)

**Optional (Phase 2+):**
- Redis für persistentes Agent-Tracking (bei Scale)
- Docker für Agent-Isolation
- CLI-Interface parallel zum Web-UI

## Open Questions

1. **Process-Timeout:** Wie lange darf ein Agent-Process maximal laufen?
2. **Resource-Limits:** Max parallel Agents? CPU/Memory-Limits?
3. **Error-Handling:** Was bei Agent-Crash? Auto-Restart? User-Notification?
4. **Orchestrator-Self-Hosting:** Läuft Orchestrator selbst als Claude-Session?
5. **Persistence:** Agent-Registry in File oder nur in Memory?

## Next Steps

1. **Design-Review:** Architektur kritisch hinterfragen
2. **Prototyping:** Phase 1 MVP in neuem Repo implementieren
3. **Testing:** Reale Multi-Agent-Szenarien durchspielen
4. **Iteration:** Learnings aus Phase 1 → Adjust für Phase 2

---

**Created:** 2025-11-15
**Status:** Ideation / Planning Phase
**Next:** Move to dedicated project repository
