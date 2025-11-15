# Claude Code Session Management

Dokumentation über die Session-Verwaltung von Claude Code für das Multi-Agent-Dashboard-Projekt.

## Überblick

Claude Code speichert Session-Daten lokal auf dem Dateisystem, um Konversations-Continuity zu ermöglichen. Jede Session wird als JSONL-Datei (JSON Lines) persistent gespeichert.

## Storage-Locations

### Session-Speicherorte

Sessions werden projekt-spezifisch gespeichert:

```
~/.claude/projects/<project-path>/<session-id>.jsonl
```

**Beispiel:**
```
/c/Users/tobia/.claude/projects/C--src-tests-coding-automation/c9cfb30d-dc10-472f-bf35-530ff35cf73f.jsonl
```

### Weitere wichtige Verzeichnisse

```
~/.claude/
├── settings.json              # User-globale Settings
├── settings.local.json        # Lokale User-Settings
├── .credentials.json          # API-Credentials
├── history.jsonl              # Globale Command-History
├── projects/                  # Projekt-Sessions
│   └── <project-path>/
│       ├── <session-uuid>.jsonl      # Haupt-Sessions
│       └── agent-<short-id>.jsonl    # Agent-Sessions (Sub-Agents)
├── file-history/              # File-Operation-History
├── shell-snapshots/           # Shell-State-Snapshots
├── todos/                     # Todo-Listen
├── debug/                     # Debug-Logs
└── ide/                       # IDE-Integration-Daten
```

## Session-Dateiformat (JSONL)

Sessions werden im JSONL-Format gespeichert (eine JSON-Zeile pro Event):

### Event-Types

1. **queue-operation** - Queue-Management
```json
{"type":"queue-operation","operation":"enqueue","timestamp":"2025-11-14T16:59:10.882Z","content":"Was steht in test.md?","sessionId":"c9cfb30d-dc10-472f-bf35-530ff35cf73f"}
```

2. **user** - User-Messages
```json
{
  "parentUuid": "bb3a8de1-3bd4-44f8-8aad-89d92fec8262",
  "isSidechain": false,
  "userType": "external",
  "cwd": "C:\\src\\tests\\coding-automation",
  "sessionId": "c9cfb30d-dc10-472f-bf35-530ff35cf73f",
  "version": "2.0.37",
  "gitBranch": "",
  "type": "user",
  "message": {
    "role": "user",
    "content": "Offensichtlich, da wir hier eine nette Konversation..."
  },
  "uuid": "e555b808-38b9-41f3-ba65-3d19d75683da",
  "timestamp": "2025-11-14T17:05:43.467Z"
}
```

3. **assistant** - Assistant-Messages mit Tool-Calls
```json
{
  "parentUuid": "e555b808-38b9-41f3-ba65-3d19d75683da",
  "isSidechain": false,
  "sessionId": "c9cfb30d-dc10-472f-bf35-530ff35cf73f",
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_01UXS8XxyuesKhUEmiKopdV8",
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01GYV9RKKSQffjXfFzufpzRB",
        "name": "Read",
        "input": {
          "file_path": "C:\\src\\tests\\coding-automation\\index.html"
        }
      }
    ],
    "stop_reason": "tool_use",
    "usage": {
      "input_tokens": 2,
      "cache_read_input_tokens": 16422,
      "output_tokens": 113
    }
  },
  "uuid": "ad92e887-dfa2-404c-862a-e0644edfe6e9",
  "timestamp": "2025-11-14T17:05:47.122Z"
}
```

4. **tool_result** - Tool-Execution-Results (als User-Message)
```json
{
  "parentUuid": "f4ef0055-847b-4890-a4de-3200dcbe7780",
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "tool_use_id": "toolu_01GYV9RKKSQffjXfFzufpzRB",
        "type": "tool_result",
        "content": "     1→<!DOCTYPE html>\n..."
      }
    ]
  },
  "uuid": "11d5b0c2-38ee-4935-85c7-5dd3c995c448",
  "timestamp": "2025-11-14T17:05:48.914Z",
  "toolUseResult": {
    "type": "text",
    "file": {
      "filePath": "C:\\src\\tests\\coding-automation\\index.html",
      "content": "...",
      "numLines": 34
    }
  }
}
```

### Wichtige Felder

- **sessionId**: UUID der Session (für --continue)
- **parentUuid**: Verkettung der Messages (Conversation-Tree)
- **isSidechain**: `true` für Agent-Sessions, `false` für Haupt-Sessions
- **agentId**: Nur bei Agent-Sessions (z.B. "1973d61d")
- **cwd**: Working Directory zum Zeitpunkt des Messages
- **timestamp**: ISO-8601 Timestamp
- **uuid**: Eindeutige ID für diesen Event
- **message.model**: Verwendetes Modell (z.B. "claude-sonnet-4-5-20250929", "claude-haiku-4-5-20251001")
- **message.usage**: Token-Usage und Caching-Informationen

## Session-Retention und Cleanup

### Automatisches Cleanup

**Default-Retention:** 30 Tage (konfigurierbar)

Sessions werden automatisch gelöscht basierend auf dem letzten Aktivitätsdatum.

### Konfiguration

In `~/.claude/settings.json`:

```json
{
  "cleanupPeriodDays": 30
}
```

**Anpassbare Werte:**
- Minimum: 1 Tag
- Default: 30 Tage
- Maximum: Unbegrenzt (durch Setzen auf einen sehr hohen Wert)

## CLI Session-Befehle

### Session fortsetzen

```bash
# Mit Session-ID
claude --continue "nächster prompt"

# Oder interaktive Auswahl
claude -r
claude --resume
```

### Session mit spezifischer ID starten

```bash
claude --session-id <uuid>
```

### Session forken (neue ID, alter Context)

```bash
claude --fork-session --resume <session-id>
```

### Verbose-Output mit Session-Info

```bash
claude --verbose -p "prompt"
```

## Agent-Sessions

Sub-Agents (z.B. Task-Tool, Explore-Agent) erstellen eigene Session-Files:

**Format:** `agent-<short-id>.jsonl`

**Eigenschaften:**
- `isSidechain: true`
- `agentId`: Kurze Hex-ID
- Verwenden oft Haiku-Modell für Performance
- Referenzieren Parent-Session via `sessionId`

**Beispiel:**
```
agent-1973d61d.jsonl  (1.8K)
```

## Implementierungs-Details für Multi-Agent-Dashboard

### Session-Tracking

Für das Dashboard sollten folgende Informationen getrackt werden:

```javascript
{
  sessionId: "c9cfb30d-dc10-472f-bf35-530ff35cf73f",
  projectPath: "C:/src/tests/coding-automation",
  lastActivity: "2025-11-14T18:09:00Z",
  messageCount: 42,
  agentSessions: [
    "agent-1973d61d",
    "agent-2e421c81"
  ],
  model: "claude-sonnet-4-5-20250929",
  fileSize: "113K"
}
```

### Session-Discovery

Sessions können per Filesystem-Scan gefunden werden:

```javascript
const projectPath = path.normalize(cwd).replace(/[:\\\/]/g, '-');
const sessionsDir = path.join(
  os.homedir(),
  '.claude',
  'projects',
  projectPath
);

const sessions = fs.readdirSync(sessionsDir)
  .filter(f => f.endsWith('.jsonl'))
  .map(f => ({
    id: f.replace('.jsonl', ''),
    isAgent: f.startsWith('agent-'),
    path: path.join(sessionsDir, f),
    stats: fs.statSync(path.join(sessionsDir, f))
  }));
```

### Session-Continuation Implementation

**Aktueller Ansatz (siehe server.js:173-179):**

```javascript
let claudeCmd;
if (currentSessionId) {
  // Continue existing session
  claudeCmd = `claude --dangerously-skip-permissions --continue "${escapedPrompt}" --output-format stream-json --verbose`;
} else {
  // Start new session
  claudeCmd = `claude --dangerously-skip-permissions -p "${escapedPrompt}" --output-format stream-json --verbose`;
}
```

**Session-ID-Extraktion aus Output (server.js:234-239):**

```javascript
// Extract session ID from result message
if (jsonData.type === 'result' && jsonData.session_id) {
  const newSessionId = jsonData.session_id;
  currentSessionId = newSessionId;
  saveSessionId(currentSessionId);
}
```

### Multi-Session-Management

Für parallele Agent-Verwaltung:

```javascript
class SessionManager {
  constructor() {
    this.sessions = new Map(); // sessionId -> SessionInfo
  }

  createSession(agentRole, workingDir) {
    // Start new session, return sessionId
  }

  continueSession(sessionId, prompt) {
    // Continue existing session
  }

  listActiveSessions() {
    // Return all active sessions
  }

  getSessionHistory(sessionId) {
    // Parse JSONL and return conversation
  }

  cleanupOldSessions(maxAgeDays = 30) {
    // Remove old session files
  }
}
```

## Stream-JSON Output Format

Bei Verwendung von `--output-format stream-json` liefert Claude Code JSONL-Output:

### Message-Types im Stream

1. **system** - System-Initialisierung
```json
{"type":"system","subtype":"init","cwd":"C:\\src\\...","session_id":"..."}
```

2. **user** - User-Input
```json
{"type":"user","message":{"role":"user","content":"prompt"}}
```

3. **assistant** - Assistant-Response
```json
{"type":"assistant","message":{"role":"assistant","content":[...]}}
```

4. **tool** - Tool-Execution (optional, abhängig von Flags)
```json
{"type":"tool","tool_name":"Read","input":{...},"output":"..."}
```

5. **result** - Final Result mit Stats
```json
{
  "type":"result",
  "session_id":"...",
  "total_cost_usd":0.0234,
  "duration_ms":5432,
  "duration_api_ms":4123,
  "num_turns":3,
  "is_error":false
}
```

## Best Practices

### Session-Isolation
- Verwende separate Sessions für unterschiedliche Agent-Rollen
- Tracke Session-IDs persistent (wie in `.sessions.txt`)
- Speichere Metadata zu jeder Session (Rolle, Zweck, Start-Zeit)

### Error-Handling
- Sessions können "hängen" bleiben - implementiere Timeouts
- Parse-Fehler im JSONL-Stream abfangen
- Session-Files können korrupt sein - Validation einbauen

### Performance
- Große Session-Files (>1MB) können langsam parsen
- Verwende Haiku für schnelle Agent-Tasks
- Cache häufig genutzte Session-Metadaten

### Cleanup
- Implementiere eigene Cleanup-Logik für abgelaufene Sessions
- Backup wichtiger Sessions vor Cleanup
- Log Session-Lifecycle-Events

## Referenzen

### Offizielle Dokumentation
- [Checkpointing](https://code.claude.com/docs/en/checkpointing.md) - Session-State-Management
- [Memory](https://code.claude.com/docs/en/memory.md) - CLAUDE.md Memory-System
- [Settings](https://code.claude.com/docs/en/settings.md) - Konfigurations-Optionen

### CLI-Optionen
```bash
claude --help           # Alle Optionen anzeigen
claude -r               # Session-Liste anzeigen und auswählen
claude --verbose        # Detailliertes Logging
```

## Troubleshooting

### Session nicht gefunden
```bash
# Sessions für aktuelles Projekt auflisten
ls -la ~/.claude/projects/$(pwd | sed 's/[:\\/]/-/g')/
```

### Session-Corruption
Wenn eine Session-Datei korrupt ist:
1. Backup erstellen
2. JSONL-Zeilen validieren (jq oder ähnliches)
3. Korrupte Zeilen entfernen
4. Oder neue Session starten mit --fork-session

### Hoher Speicherverbrauch
Große Session-Files regelmäßig archivieren:
```bash
find ~/.claude/projects/ -name "*.jsonl" -size +10M
```

---

**Erstellt:** 2024-11-14
**Projekt:** Multi-Agent Orchestration Dashboard
**Basis:** Claude Code v2.0.37
