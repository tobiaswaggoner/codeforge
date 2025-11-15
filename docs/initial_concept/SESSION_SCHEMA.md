# Claude Code Session File Schema

**Generated:** 2025-11-15
**Version:** 1.0
**Source:** 413 session files, 14,649 events analyzed

## Overview

Claude Code stores session data in JSONL (JSON Lines) format in `~/.claude/projects/<project-path>/`.

Each session file contains a sequence of events, one JSON object per line.

**Statistics from Analysis:**
- Total Files: 413
- Total Events: 14,649
- Parsing Errors: 0 ✅

## Event Types

Sessions contain 6 different event types:

1. **`user`** - User messages and tool results
2. **`assistant`** - Assistant responses and tool calls
3. **`system`** - System events (init, warnings, errors)
4. **`queue-operation`** - Message queue operations (enqueue/dequeue)
5. **`file-history-snapshot`** - File system state snapshots
6. **`summary`** - Conversation summaries (for compaction)

## Common Fields

All events share these base fields:

```typescript
interface BaseEvent {
  type: 'user' | 'assistant' | 'system' | 'queue-operation' | 'file-history-snapshot' | 'summary';
  timestamp?: string;        // ISO 8601 timestamp
  uuid?: string;            // Unique event ID
  sessionId?: string;       // Session UUID
  parentUuid?: string;      // Parent event UUID (for threading)
}
```

## Event Type Details

### 1. `user` Events

User input messages or tool execution results.

**Fields:**
```typescript
interface UserEvent extends BaseEvent {
  type: 'user';
  message: {
    role: 'user';
    content: string | ContentItem[];
  };

  // Context
  cwd: string;                     // Working directory
  gitBranch: string;              // Current git branch
  version: string;                // Claude Code version (e.g., "2.0.37")
  userType: 'external' | string;  // User type

  // Flags
  isSidechain?: boolean;          // Is this a sub-agent?
  agentId?: string;               // Agent ID if sidechain
  isMeta?: boolean;               // Is meta message?
  isCompactSummary?: boolean;     // Is compact summary?
  isVisibleInTranscriptOnly?: boolean;

  // Tool results
  toolUseResult?: {
    type: 'text' | 'file' | ...;
    file?: {
      filePath: string;
      content: string;
      numLines: number;
      startLine: number;
      totalLines: number;
    };
  };

  // Thinking metadata (extended thinking feature)
  thinkingMetadata?: {
    budget_tokens: number;
    thinking_enabled: boolean;
  };
}
```

### 2. `assistant` Events

Assistant responses, including text and tool calls.

**Fields:**
```typescript
interface AssistantEvent extends BaseEvent {
  type: 'assistant';
  message: {
    model: string;              // e.g., "claude-sonnet-4-5-20250929"
    id: string;                 // Message ID (e.g., "msg_01...")
    type: 'message';
    role: 'assistant';
    content: ContentItem[];
    stop_reason: 'end_turn' | 'tool_use' | 'stop_sequence';
    stop_sequence: string | null;
    usage: {
      input_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
      cache_creation: {
        ephemeral_5m_input_tokens: number;
        ephemeral_1h_input_tokens: number;
      };
      output_tokens: number;
      service_tier: 'standard' | string;
    };
  };

  // Context
  requestId: string;              // API request ID
  cwd: string;
  gitBranch: string;
  version: string;
  userType: 'external' | string;

  // Flags
  isSidechain?: boolean;
  agentId?: string;
  isApiErrorMessage?: boolean;
}
```

### 3. `system` Events

System-level events and notifications.

**Fields:**
```typescript
interface SystemEvent extends BaseEvent {
  type: 'system';
  subtype?: 'init' | 'warning' | 'error' | string;
  content?: string;             // System message content
  level?: 'info' | 'warning' | 'error';

  // Context
  cwd?: string;
  gitBranch?: string;
  version?: string;
  userType?: 'external' | string;

  // Flags
  isSidechain?: boolean;
  isMeta?: boolean;

  // Threading
  logicalParentUuid?: string;   // Logical parent (vs. parentUuid)

  // Compact metadata
  compactMetadata?: {
    // Metadata about compaction
  };
}
```

### 4. `queue-operation` Events

Message queue management events.

**Fields:**
```typescript
interface QueueOperationEvent extends BaseEvent {
  type: 'queue-operation';
  operation: 'enqueue' | 'dequeue';
  content: string;              // Message content being queued
  sessionId: string;
  timestamp: string;
}
```

### 5. `file-history-snapshot` Events

Snapshots of file system state (for tracking file changes).

**Fields:**
```typescript
interface FileHistorySnapshotEvent extends BaseEvent {
  type: 'file-history-snapshot';
  messageId: string;
  isSnapshotUpdate?: boolean;
  snapshot: {
    // File system snapshot data
  };
}
```

### 6. `summary` Events

Conversation summaries (used for context compaction).

**Fields:**
```typescript
interface SummaryEvent extends BaseEvent {
  type: 'summary';
  summary: string;              // Summary text
  leafUuid: string;             // UUID of the conversation leaf
}
```

## Message Content Types

Assistant and User messages can contain various content types:

```typescript
type ContentItem =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'image'; source: { type: 'base64' | 'url'; ... } }
  | { type: 'document'; source: { ... } }
  | { type: 'tool_use'; id: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: string | any }
  | string  // Simple string content
```

## Tool Names

Tools available to the assistant:

**Core Tools:**
- `Read` - Read files
- `Write` - Write files
- `Edit` - Edit files
- `Glob` - Find files by pattern
- `Grep` - Search file contents
- `Bash` - Execute shell commands
- `BashOutput` - Read background shell output
- `KillShell` - Kill background shell
- `Task` - Spawn sub-agents
- `TodoWrite` - Manage todo lists
- `WebFetch` - Fetch web content
- `WebSearch` - Search the web
- `AskUserQuestion` - Ask user questions
- `ExitPlanMode` - Exit planning mode
- `Skill` - Execute skills

**MCP Tools (if configured):**
- `mcp__clickup__clickup_create_task_comment`
- `mcp__clickup__clickup_get_task`

## Models

```typescript
type Model =
  | 'claude-sonnet-4-5-20250929'    // Sonnet 4.5
  | 'claude-haiku-4-5-20251001'     // Haiku 4.5
  | '<synthetic>'                    // Synthetic/system messages
```

## Stop Reasons

```typescript
type StopReason =
  | 'end_turn'        // Natural end of turn
  | 'tool_use'        // Stopped to use tool
  | 'stop_sequence'   // Hit stop sequence
```

## Session Structure

A typical session follows this pattern:

```
queue-operation (enqueue)
queue-operation (dequeue)
user (initial prompt)
assistant (response with tool_use)
user (tool_result)
assistant (response with text)
queue-operation (enqueue)
queue-operation (dequeue)
user (next prompt)
...
```

**Key Relationships:**
- Events are linked via `parentUuid` → `uuid` chains
- Each user/assistant pair forms a "turn"
- Sub-agents have `isSidechain: true` and an `agentId`
- File snapshots track file changes over time
- Summaries are inserted during compaction

## Session Metadata

Each session file name is the session UUID:
- Main sessions: `<uuid>.jsonl` (e.g., `c9cfb30d-dc10-472f-bf35-530ff35cf73f.jsonl`)
- Agent sessions: `agent-<short-id>.jsonl` (e.g., `agent-1973d61d.jsonl`)

**Session Discovery:**
- Project path encoded in directory name: `C--src-tests-coding-automation`
- All sessions for a project in one directory
- Can have multiple concurrent sessions per project

## Usage Patterns

### Parse a Session

```javascript
const fs = require('fs');
const readline = require('readline');

async function parseSession(filePath) {
  const events = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      events.push(JSON.parse(line));
    }
  }

  return events;
}
```

### Extract Conversation

```javascript
function extractConversation(events) {
  return events
    .filter(e => e.type === 'user' || e.type === 'assistant')
    .map(e => ({
      role: e.message.role,
      content: extractContent(e.message.content),
      timestamp: e.timestamp,
      tools: e.type === 'assistant'
        ? e.message.content.filter(c => c.type === 'tool_use')
        : []
    }));
}

function extractContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
  }
  return '';
}
```

### Find Waiting Sessions

```javascript
function isSessionWaitingForInput(events) {
  const lastEvent = events[events.length - 1];

  // If last event is assistant and stop_reason is 'end_turn'
  // the session is waiting for user input
  return lastEvent?.type === 'assistant'
    && lastEvent.message?.stop_reason === 'end_turn';
}
```

## Database Schema Recommendations

For importing into a database:

### Tables

**sessions**
```sql
CREATE TABLE sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  project_path VARCHAR(500),
  is_agent BOOLEAN,
  agent_id VARCHAR(20),
  created_at TIMESTAMP,
  last_active TIMESTAMP,
  event_count INTEGER,
  model VARCHAR(100)
);
```

**events**
```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(36) REFERENCES sessions(session_id),
  uuid VARCHAR(36) UNIQUE,
  parent_uuid VARCHAR(36),
  type VARCHAR(50),
  timestamp TIMESTAMP,
  cwd VARCHAR(500),
  git_branch VARCHAR(200),
  is_sidechain BOOLEAN,
  message JSONB,  -- Store full message as JSONB
  raw_data JSONB  -- Store full event as JSONB
);

CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_timestamp ON events(timestamp);
CREATE INDEX idx_events_parent ON events(parent_uuid);
```

**tool_uses**
```sql
CREATE TABLE tool_uses (
  id SERIAL PRIMARY KEY,
  event_id INTEGER REFERENCES events(id),
  tool_name VARCHAR(100),
  tool_use_id VARCHAR(100),
  input JSONB,
  timestamp TIMESTAMP
);

CREATE INDEX idx_tool_uses_name ON tool_uses(tool_name);
```

## Notes

- Session files can grow large (>100KB for active sessions)
- Parsing should handle incomplete lines gracefully
- `parentUuid` creates a tree structure of events
- Not all fields are present in all events of the same type
- Content can be string OR array (handle both cases)
- Sub-agents (`isSidechain: true`) reference parent `sessionId`

---

**Generated by:** `parse-sessions.js`
**Command:** `node parse-sessions.js`
**Source Code:** Available in this repository
