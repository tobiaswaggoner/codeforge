# Multi-Agent Orchestrator - Refined Concept

**Version:** 1.1
**Datum:** 2025-11-15
**Status:** Konzept-Verfeinerung nach technischer Klärung

---

## Problem Statement

Bei paralleler Arbeit mit mehreren Claude Code Agents entsteht kognitiver Overhead durch:
- Permanente Context-Switches zwischen Agent-Sessions
- Unklarer Status: Welcher Agent arbeitet woran?
- Verlorener Kontext bei Token-Limit und Auto-Compact
- Fragmentierte Sessions für zusammenhängende Tasks

Das menschliche Gehirn kämpft mit dem Tracking von 5+ parallelen Konversationen.

---

## Grundidee

Ein **Orchestrator** sitzt zwischen User und Coding-Agents als intelligenter Manager:
- Verwaltet mehrere parallel laufende Agents
- Aggregiert Status und Fragen in einem Dashboard
- Routet User-Input zu den richtigen Agents
- Löst das Session-Fragmentierungs-Problem durch Agent-Konzept
- Ermöglicht später autonome Entscheidungen bei Routine-Fragen

---

## Kern-Konzepte

### 1. Agent vs. Session

**Problem:** Claude Code Sessions haben Token-Limits. Auto-Compact reduziert Performance drastisch. Tasks sind oft nicht in einer Session abschließbar.

**Lösung:** Agent = logische Klammer um mehrere Sessions

```
Agent "AUTH" (Task: Implement Authentication)
  ├─ Session 1: c9cfb30d-... (completed, 180k tokens)
  ├─ Session 2: a7e4f21b-... (completed, 195k tokens)
  └─ Session 3: 2f9d8a1c-... (active, 45k tokens)
```

**Technisch:**
- Ein Agent hat einen Namen (user-defined), Task, Projekt, Priorität
- Ein Agent kann über mehrere Sessions arbeiten
- Jede Session gehört zu genau einem Agent
- User/Orchestrator entscheidet, wann neue Session gestartet wird

**Vorteil:**
- Zusammenhängende Task-Historie über Session-Grenzen hinweg
- Kontrolle über Context-Management (manueller Restart statt Auto-Compact)
- Klare Zuordnung: "Agent AUTH hat an 3 Sessions gearbeitet"

---

### 2. Session-Transition-Flow (manueller Neustart)

**Szenario:** Agent arbeitet, Session läuft voll (150k+ tokens)

**Flow:**
1. User/Orchestrator erkennt: Session-Limit nahe
2. Agent bekommt Prompt: "Fasse aktuellen Status zusammen in `_agent_state.md`:
   - Was wurde getan
   - Was ist geplant
   - Offene Files
   - Nächste Schritte"
3. Agent schreibt `_agent_state.md`
4. User/Orchestrator startet neue Session:
   ```bash
   cd /c/src/project
   claude -p "Du bist Agent AUTH. Lies _agent_state.md und fahre fort." --output-format stream-json
   ```
5. Neue Session wird dem gleichen Agent zugeordnet
6. Agent arbeitet nahtlos weiter

**Vorteil gegenüber Auto-Compact:**
- Agent behält vollen Kontext (via State-File)
- Kein Performance-Verlust
- Kontrolle über Transition-Zeitpunkt

---

### 3. Headless Claude Code CLI als Kern

**Alle Session-Logik wird vom Claude Code CLI übernommen:**

- **Session-Erstellung:** `claude -p "prompt"` generiert automatisch Session-UUID
- **Session-Continuation:** `claude --continue "prompt"` setzt letzte Session im CWD fort
- **Tool-Execution:** Claude CLI managed alle Tool-Uses automatisch
- **Stream-Events:** `--output-format stream-json` liefert strukturierte Events
- **Session-Files:** `.jsonl` Files in `~/.claude/projects/<project>/` sind Source of Truth
- **Sub-Agents:** `Task` Tool spawnt automatisch Sub-Agents (`agent-*.jsonl`)

**Orchestrator-Rolle:**
- Spawn Claude-Prozesse (`child_process.spawn`)
- Parse Stream-Events (stdout)
- Aggregate Status
- Route User-Input
- Track Agent-Metadaten

**Orchestrator macht NICHT:**
- Session-File-Manipulation (nur Claude CLI schreibt)
- Tool-Execution (macht Claude CLI)
- Context-Window-Management (macht Claude CLI)

---

### 4. CWD-basiertes Session-Routing

**Wichtig:** Claude Code identifiziert Projekte über Current Working Directory.

**Beispiel:**
```
~/.claude/projects/
  ├─ C--src-customer-portal/
  │   ├─ c9cfb30d-....jsonl  (Session 1)
  │   └─ a7e4f21b-....jsonl  (Session 2)
  └─ C--src-backend/
      └─ 2f9d8a1c-....jsonl  (Session 3)
```

**Beim Spawn:**
```javascript
spawn('claude', ['--continue', userInput, '--output-format', 'stream-json'], {
  cwd: 'C:\\src\\customer-portal'  // <- Projekt-Path!
});
```

**Claude findet automatisch die aktive Session in diesem CWD.**

**Konsequenz:**
- Jeder Agent ist **einem** Projekt zugeordnet
- Agent kann nicht gleichzeitig in mehreren Projekten arbeiten
- Agent kann Projekt wechseln (neue Session in anderem CWD)
- Orchestrator muss Project-Path pro Agent tracken

---

### 5. Agent-Lifecycle

```
1. User: "Create Agent AUTH for Task: Implement Authentication"
   ↓
2. Orchestrator: Erstelle Agent-Entry in DB
   {
     agentId: "550e8400-...",
     name: "AUTH",
     task: "Implement user authentication with JWT",
     project: "Customer Portal",
     projectPath: "C:\\src\\customer-portal",
     priority: "high",
     status: "working",
     currentSessionId: null
   }
   ↓
3. Orchestrator: Spawn Claude-Prozess
   cd C:\src\customer-portal
   claude -p "You are Agent AUTH. Task: ${task}. ${initialPrompt}" --output-format stream-json
   ↓
4. Claude generiert Session-UUID (z.B. c9cfb30d-...)
   ↓
5. Orchestrator extrahiert Session-ID aus Stream-Events
   → Speichert: currentSessionId = "c9cfb30d-..."
   → Erstellt Agent-Session-Relation in DB
   ↓
6. Agent arbeitet, streamt Events
   → Orchestrator parsed Events, updated Status
   ↓
7. Prozess terminiert (stop_reason: 'end_turn')
   → Status = "waiting"
   ↓
8. User gibt Input → Orchestrator spawnt:
   claude --continue "User input here" --output-format stream-json
   (gleicher CWD → setzt gleiche Session fort)
   ↓
9. Zurück zu Schritt 6

--- Bei Token-Limit ---

10. User/Orchestrator: "Starte neue Session"
    ↓
11. Agent schreibt _agent_state.md
    ↓
12. Orchestrator spawnt neue Session:
    claude -p "Lies _agent_state.md und fahre fort"
    ↓
13. Neue Session-UUID (z.B. a7e4f21b-...)
    → Orchestrator: currentSessionId = "a7e4f21b-..."
    → Erstellt neue Agent-Session-Relation
    ↓
14. Agent arbeitet weiter (in neuer Session, gleicher Agent)
```

---

### 6. Agent-Status-Erkennung

**Status-Typen:**
- `working` - Prozess läuft
- `waiting` - Prozess beendet, wartet auf Input
- `done` - Task abgeschlossen (LLM-erkannt)

**Status-Detection:**

1. **Working:**
   - Child-Prozess läuft (PID aktiv)
   - Stream-Events kommen rein

2. **Waiting:**
   - Prozess terminiert
   - Letzte Message: `stop_reason: 'end_turn'`

3. **Done:**
   - Prozess terminiert
   - Letzte Assistant-Message wird analysiert via günstiges LLM:
     ```javascript
     const lastMessage = extractLastAssistantMessage(events);
     const status = await cheapLLM.analyze({
       model: "haiku" / "gpt-4o-mini" / "gemini-flash",
       prompt: `
         Analysiere diese Agent-Ausgabe.
         Ist der Agent mit seiner Aufgabe fertig?
         Ausgabe: ${lastMessage}

         Antworte nur: DONE oder WAITING
       `
     });
     // status === "DONE" → Agent-Status = "done"
     ```

**Vorteil:**
- Automatische Erkennung ohne manuelle Status-Setzung
- Günstige LLMs (Haiku ~$0.0003 pro Analyse)

---

### 7. Real-time Event-Streaming

**Während Agent läuft:**

Claude CLI streamt JSON-Events via stdout:
```json
{"type":"system","subtype":"init","sessionId":"c9cfb30d-..."}
{"type":"user","message":{"role":"user","content":"..."}}
{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read"}]}}
{"type":"user","message":{"content":[{"type":"tool_result"}]}}
{"type":"result","session_id":"c9cfb30d-...","total_cost_usd":0.12}
```

**Orchestrator:**
- Parsed Events in Real-time
- Extracted Session-ID
- Tracked Tool-Uses
- Updated UI via WebSocket
- Speichert Events in-memory (optional: direkt in DB)

**Wichtig:**
- Session-Files werden NUR von Claude CLI geschrieben
- Orchestrator liest Session-Files nur:
  - Initial beim Agent-Load (History anzeigen)
  - Nie während Prozess läuft (Race Conditions)
- Alle Live-Informationen kommen aus Stream-Events

---

### 8. Postgres als Persistenz-Layer

**Daten-Flow:**

1. **Beim Orchestrator-Start:**
   - Import aller `.jsonl` Files aus `~/.claude/projects/`
   - Parse Sessions, Events, Tool-Uses
   - Populate DB (via `import-to-postgres.js`)

2. **Während Agents laufen:**
   - Events in-memory halten
   - Optional: Async DB-Insert für Persistence

3. **Regelmäßiger Sync:**
   - Cronjob (z.B. jede Stunde): Re-scan + Import geänderter Files
   - Stellt sicher: DB bleibt konsistent mit File-System

**Schema (erweitert):**

```sql
-- Agents: Logische Klammer um mehrere Sessions
CREATE TABLE agents (
  agent_id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,           -- "AUTH", "UI-Frontend"
  task TEXT NOT NULL,                    -- "Implement JWT authentication"
  project VARCHAR(200) NOT NULL,         -- "Customer Portal"
  project_path VARCHAR(500) NOT NULL,    -- "C:\src\customer-portal"
  priority VARCHAR(20),                  -- "high", "medium", "low"
  status VARCHAR(20) DEFAULT 'waiting',  -- "working", "waiting", "done"
  current_session_id VARCHAR(36),        -- Aktuell aktive Session
  created_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW(),
  archived BOOLEAN DEFAULT FALSE
);

-- Sessions: Wie bisher (aus import-to-postgres.js)
CREATE TABLE sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  project_path VARCHAR(500),
  is_agent BOOLEAN,
  agent_id VARCHAR(20),  -- Claude's agent-* prefix
  created_at TIMESTAMP,
  last_active TIMESTAMP,
  event_count INTEGER,
  model VARCHAR(100),
  file_path TEXT,
  file_size BIGINT,
  last_imported TIMESTAMP
);

-- Agent-Session-Relations: N:M (Agent kann mehrere Sessions haben)
CREATE TABLE agent_sessions (
  agent_id UUID REFERENCES agents(agent_id) ON DELETE CASCADE,
  session_id VARCHAR(36) REFERENCES sessions(session_id) ON DELETE CASCADE,
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,  -- NULL = aktive Session
  PRIMARY KEY (agent_id, session_id)
);

-- Events: Wie bisher
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(36) REFERENCES sessions(session_id) ON DELETE CASCADE,
  uuid VARCHAR(36) UNIQUE,
  parent_uuid VARCHAR(36),
  type VARCHAR(50),
  subtype VARCHAR(50),
  timestamp TIMESTAMP,
  cwd VARCHAR(500),
  git_branch VARCHAR(200),
  is_sidechain BOOLEAN,
  agent_id VARCHAR(20),
  request_id VARCHAR(100),
  message JSONB,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tool-Uses: Wie bisher
CREATE TABLE tool_uses (
  id SERIAL PRIMARY KEY,
  event_uuid VARCHAR(36) REFERENCES events(uuid) ON DELETE CASCADE,
  tool_name VARCHAR(100),
  tool_use_id VARCHAR(100),
  input JSONB,
  timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### 9. Sub-Agents (Claude Code Feature)

**Claude Code spawnt automatisch Sub-Agents via `Task` Tool.**

**Beispiel:**
```
Main Session: c9cfb30d-....jsonl
Sub-Agent 1:  agent-1973d61d.jsonl  (von Main Session gespawnt)
Sub-Agent 2:  agent-a4f8e2b1.jsonl  (von Main Session gespawnt)
```

**Orchestrator-Verhalten:**
- **Importiert** Sub-Agent-Sessions in DB (für Vollständigkeit)
- **Zeigt NICHT** in Main-UI (nur Main-Sessions)
- **Ignoriert** Sub-Agent-Management (ist Claude-Code-intern)

**Warum importieren?**
- Vollständige Historie
- Spätere Analyse möglich (welche Sub-Agents wurden verwendet?)
- Einfacher: Alle `.jsonl` importieren, UI filtert danach

---

### 10. Multi-Projekt-Fähigkeit

**Agent kann Projekte wechseln, aber immer nur eins aktiv:**

**Beispiel:**
```
Agent "FULLSTACK"
  Projekt A: "Frontend" (C:\src\frontend)
    ├─ Session 1: UI-Komponenten
    └─ Session 2: API-Integration

  Projekt B: "Backend" (C:\src\backend)
    └─ Session 3: API-Endpoints
```

**Technisch:**
- Agent hat `project_path` = aktuelles Projekt
- User/Orchestrator kann Projekt wechseln:
  1. Agent updated: `project_path = "C:\src\backend"`
  2. Neue Session wird gespawnt mit neuem CWD
  3. Agent-Session-Relation wird erstellt

**Limitation:**
- Agent kann nicht **gleichzeitig** in mehreren Projekten arbeiten
- Cross-File-System-Access möglich (Tools können auf andere Paths zugreifen)
- Sessions sind immer CWD-gebunden

---

## Phasen

### Phase 1: Basic Orchestrator (MVP)

**Ziel:** Mehrere Agents parallel verwalten, Status sehen, Input routen

**Features:**

1. **Agent-Management:**
   - `POST /agents` - Erstelle Agent (Name, Task, Projekt, Priority)
   - `GET /agents` - Liste alle Agents mit Status
   - `GET /agents/:id` - Agent-Details + aktive Session
   - `DELETE /agents/:id` - Agent archivieren
   - `POST /agents/:id/new-session` - Starte neue Session für Agent

2. **Input-Routing:**
   - `POST /agents/:id/input` - Sende User-Message an Agent
   - Backend spawnt `claude --continue` im richtigen CWD
   - Stream-Events werden via WebSocket an UI gepusht

3. **Status-Tracking:**
   - Real-time: Prozess läuft = working
   - Prozess beendet = waiting
   - LLM-Analyse (Haiku): done?

4. **Session-History:**
   - `GET /agents/:id/sessions` - Alle Sessions eines Agents
   - `GET /sessions/:id/history` - Chat-History einer Session
   - Separate Views (keine Merge über Sessions)

5. **Database:**
   - Postgres-Import beim Start
   - In-Memory-Events während Betrieb
   - Cronjob: Hourly Sync

6. **UI (Web-Dashboard):**
   - Sidebar: Agent-Liste (Name, Status, Last Active)
   - Main Area: Selected Agent's Session-History
   - Input Field: Route zu aktivem Agent
   - Status-Indicators: 🟢 Working, 🟡 Waiting, ✅ Done
   - "New Session" Button pro Agent

**Tech Stack:**
- Backend: Node.js + Express
- WebSocket: Socket.IO oder ws
- DB: PostgreSQL (Schema oben)
- Frontend: HTML/CSS/Vanilla JS (später: React/Vue)

---

### Phase 2: Orchestrator-Intelligenz

**Ziel:** Orchestrator trifft eigenständig einfache Entscheidungen

**Features:**

1. **Autonome Frage-Beantwortung:**
   - Agent fragt: "Welches Test-Framework?"
   - Orchestrator (via LLM-Call):
     ```javascript
     const decision = await orchestratorLLM.decide({
       context: agentHistory,
       question: "Welches Test-Framework?",
       options: ["Jest", "Vitest", "Node Test Runner"]
     });
     ```
   - Orchestrator antwortet: "Verwende Jest" (ohne User)
   - Oder: "Frage User" (wenn unklar)

2. **Autonomie-Level:**
   - Level 1: Fragt immer User
   - Level 2: Entscheidet bei Standard-Patterns (Test-Framework, Linter, etc.)
   - Level 3: Nur kritische Fragen an User (Architecture, Breaking Changes)

3. **Transparenz:**
   - Alle autonomen Entscheidungen geloggt
   - User kann Entscheidungen reviewen
   - User kann Autonomie-Level pro Agent setzen

**Orchestrator-LLM:**
- Nicht Claude Code CLI (separater API-Call)
- Flexibel: Anthropic, OpenAI, Gemini, Ollama
- Eigenes Budget-Tracking

---

### Phase 3: Proaktive Project Discovery

**Ziel:** Orchestrator findet selbstständig steckengebliebene Projekte

**Features:**

1. **Session-Scan:**
   - Täglich: Scanne alle Sessions in `~/.claude/projects/`
   - Identifiziere: Projekte ohne Aktivität >X Tage
   - Erkenne "Stuck Points":
     - Wartet auf User-Antwort
     - Test failed
     - 50% implementiert

2. **Proaktive Vorschläge:**
   - UI zeigt: "3 Projekte können weitergetrieben werden"
   - Pro Projekt:
     - Last Activity
     - Current Status (aus LLM-Analyse)
     - Suggested Next Step
   - One-Click: "Spawn Agent für Projekt X, fahre fort"

3. **Beispiel:**
   ```
   📦 Projekt: Auth-Module
   Last Active: 5 Tage
   Status: OAuth-Implementierung 70% fertig
   Blocker: Test-Setup fehlt
   Vorschlag: "Jest konfigurieren und Tests schreiben?"
   [ Agent starten ] [ Ignorieren ]
   ```

---

### Phase 4: Autonomous Multi-Project Agent

**Vision:** Agent arbeitet kontinuierlich an mehreren Projekten, limitiert nur durch Budget

**Features:**

1. **Self-Directed Work:**
   - Agent entscheidet selbst, an was er arbeitet
   - Priorisierung: Business Value, Completion-Grad, Blockage-Time
   - Wechselt zwischen Projekten basierend auf Dependencies

2. **Minimal User Interaction:**
   - Täglicher Report: "Heute: X erledigt, Y in Progress, Z braucht Input"
   - User setzt nur High-Level Goals + Budget-Limits

3. **Safety:**
   - Keine Deployments ohne Approval
   - Keine Breaking Changes ohne Approval
   - Budget-Hard-Limit (Agent stoppt automatisch)
   - Audit-Log aller Entscheidungen

---

## Tech-Klärungen

### Resource Management

**Keine künstlichen Limits:**
- Orchestrator spawnt beliebig viele Claude-Prozesse parallel
- Limitierung erfolgt durch:
  - System-Ressourcen (CPU/Memory)
  - Anthropic API Rate-Limits (automatische Fehlermeldung)
  - User-definiertes Budget-Limit

**Bei API-Limit:**
- Claude CLI gibt Error zurück
- Orchestrator caught Error
- Status = "error"
- User-Notification im UI

### Budget-Tracking

**Zwei getrennte Budgets:**

1. **Claude Code Budget:**
   - Alle Agent-Sessions (via Claude CLI)
   - Tracked via `usage` in Stream-Events
   - Aggregation in DB: `SUM(input_tokens + output_tokens)`

2. **Orchestrator Budget:**
   - Autonome Entscheidungen (Phase 2+)
   - Separate API-Calls (Anthropic/OpenAI/Gemini)
   - Separates Tracking

**UI zeigt:**
- Kosten pro Agent
- Kosten pro Projekt
- Gesamt-Kosten heute/Woche/Monat

---

## UI-Konzept (verfeinert)

### Main Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Multi-Agent Orchestrator              4 agents active  $12.40  │
├──────────────┬──────────────────────────────────────────────────┤
│ AGENTS       │  Agent: AUTH (Customer Portal)                   │
│              │  Task: Implement user authentication             │
├──────────────┤  Status: waiting  ⚠️  Last: 2 min ago            │
│              │  Priority: high   Sessions: 2                    │
│ A  AUTH      │                                                  │
│    waiting   │  ┌────────────────────────────────────────────┐ │
│    high      │  │ Current Session: c9cfb30d-...              │ │
│    2 min     │  │ Token Usage: 145k / 200k                   │ │
│              │  │ [New Session]  [Archive Agent]             │ │
│ T  TESTS     │  └────────────────────────────────────────────┘ │
│    done      │                                                  │
│    medium    │  ┌─ Agent Conversation (Session c9cfb30d) ────┐ │
│    10 min    │  │ User: Implement JWT-based auth             │ │
│              │  │ AUTH: I'll create auth middleware...       │ │
│ R  REFACTOR  │  │ [Tool: Write] Created src/auth/jwt.js      │ │
│    waiting   │  │ AUTH: Which test framework should I use?   │ │
│    medium    │  │                                            │ │
│    5 min     │  └────────────────────────────────────────────┘ │
│              │                                                  │
│ U  UI        │  ┌─ Your Input ──────────────────────────────┐ │
│    working   │  │ Use Jest for testing                       │ │
│    low       │  │                        [Send]  [New Sess.] │ │
│    just now  │  └────────────────────────────────────────────┘ │
│              │                                                  │
│ [+ New Agent]│                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

### Decision Queue (vereinfacht)

```
┌─────────────────────────────────────┐
│  Agents Waiting for Input           │
├─────────────────────────────────────┤
│ AUTH - Which test framework?        │
│ REFACTOR - Deprecate old route?     │
└─────────────────────────────────────┘
```

**Sortierung:** Nach Last Active (longest waiting first)

### Activity Feed (vereinfacht)

```
┌─────────────────────────────────────┐
│  Recent Activity                    │
├─────────────────────────────────────┤
│ 10:24  AUTH  DB-Schema created      │
│ 10:22  REFACTOR  Proposal ready     │
│ 10:19  TESTS  4 tests passed ✅     │
└─────────────────────────────────────┘
```

**Filter:** Nur wichtige Events
- Agent fragt User
- Agent completed Task
- Agent Error
- Major Tool-Uses (Write, Bash mit Erfolg/Fehler)

---

## Offene Design-Entscheidungen (für spätere Phasen)

1. **Attention Score / Focus % - vorerst ignoriert**
   - Kann später als "Token-Usage %" implementiert werden
   - Nicht kritisch für MVP

2. **Cross-Agent Communication (Phase 5)**
   - Agent A fragt nach Ergebnis von Agent B
   - Orchestrator vermittelt
   - Noch nicht spezifiziert

3. **Template-Agents (Phase 5)**
   - Vordefinierte Agent-Rollen ("Testing Agent", "Refactoring Agent")
   - Mit Best Practices, Standards
   - Noch nicht spezifiziert

4. **RAG-basierte Knowledge Base (Phase 5)**
   - Orchestrator hat Zugriff auf Firmen-Guidelines
   - Kann Agent-Fragen beantworten ohne User
   - Noch nicht spezifiziert

---

## Nächste Schritte

1. ✅ **Konzept verfeinert** (dieses Dokument)
2. ⬜ **Technische Architektur** - API-Design, State-Machine, WebSocket-Events
3. ⬜ **Prototyping** - Phase 1 MVP implementieren
4. ⬜ **Testing** - Reale Multi-Agent-Szenarien
5. ⬜ **Iteration** - Learnings → Anpassungen

---

## Abgrenzung zu bestehendem Code

**Aktueller Prototype (`server.js`):**
- Proof of Concept für Session-Parsing
- Zeigt Projects + Sessions aus File-System
- Keine Agent-Logik
- Kein Postgres

**Neues System:**
- Vollständiges Agent-Management
- Postgres als Persistenz
- WebSocket Real-time
- Multi-Session pro Agent
- Status-Tracking & LLM-basierte Completion-Detection

---

**Erstellt:** 2025-11-15
**Nächstes Review:** Nach technischem Architektur-Entwurf
