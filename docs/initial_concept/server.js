const express = require('express');
const { spawn } = require('child_process');
const { existsSync, readFileSync, appendFileSync, writeFileSync, readdirSync, statSync } = require('fs');
const path = require('path');
const os = require('os');
const portfinder = require('portfinder');

const app = express();
const defaultPort = 3000;

// Path to session storage file
const SESSIONS_FILE = path.join(__dirname, '.sessions.txt');

// Store session ID for continuation
let currentSessionId = null;

// Load last session ID from file
function loadLastSessionId() {
    try {
        console.log('Attempting to load session ID from:', SESSIONS_FILE);
        if (existsSync(SESSIONS_FILE)) {
            const content = readFileSync(SESSIONS_FILE, 'utf-8').trim();
            const lines = content.split('\n').filter(line => line.trim());
            console.log('Found', lines.length, 'session IDs in file');
            if (lines.length > 0) {
                // Get the last line (most recent session ID)
                const lastSessionId = lines[lines.length - 1].trim();
                if (lastSessionId) {
                    currentSessionId = lastSessionId;
                    console.log('✓ Loaded last session ID:', currentSessionId);
                    return currentSessionId;
                }
            } else {
                console.log('Sessions file exists but is empty');
            }
        } else {
            console.log('Sessions file does not exist yet, will be created on first session');
        }
    } catch (error) {
        console.error('Error loading session ID:', error);
        console.error('Error details:', error.message, error.stack);
    }
    return null;
}

// Save session ID to file
function saveSessionId(sessionId) {
    try {
        if (sessionId) {
            // Check if this session ID is already in the file
            let shouldAppend = true;
            if (existsSync(SESSIONS_FILE)) {
                const content = readFileSync(SESSIONS_FILE, 'utf-8');
                if (content.includes(sessionId)) {
                    shouldAppend = false;
                    console.log('Session ID already exists in file:', sessionId);
                }
            }
            
            if (shouldAppend) {
                // Append to file (one session ID per line)
                appendFileSync(SESSIONS_FILE, sessionId + '\n', 'utf-8');
                console.log('Saved session ID to file:', sessionId);
            }
        }
    } catch (error) {
        console.error('Error saving session ID:', error);
        console.error('Error details:', error.message);
    }
}

// Load session ID on startup
loadLastSessionId();

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Error handler middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).send(`Server error: ${err.message}`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Endpoint to get current session ID
app.get('/session', (req, res) => {
    res.json({ sessionId: currentSessionId });
});

// Helper function to get Claude projects directory
function getClaudeProjectsDir() {
    return path.join(os.homedir(), '.claude', 'projects');
}

// Helper function to decode project path (reverse of encoding in Claude)
function decodeProjectPath(encodedPath) {
    // Claude encodes paths like "C--src-tests-coding-automation"
    // We need to convert back to "C:\src\tests\coding-automation" (or forward slashes)
    return encodedPath.replace(/--/g, path.sep).replace(/-/g, path.sep);
}

// API: Get all projects
app.get('/api/projects', (req, res) => {
    try {
        const projectsDir = getClaudeProjectsDir();
        console.log('[API] GET /api/projects - Claude projects dir:', projectsDir);

        if (!existsSync(projectsDir)) {
            console.log('[API] Projects directory does not exist');
            return res.json({ projects: [] });
        }

        const projectDirs = readdirSync(projectsDir)
            .filter(name => {
                const fullPath = path.join(projectsDir, name);
                return statSync(fullPath).isDirectory();
            });

        console.log('[API] Found', projectDirs.length, 'project directories');

        const projects = projectDirs.map(dirName => {
            const fullPath = path.join(projectsDir, dirName);
            const stats = statSync(fullPath);

            // Count sessions
            const files = readdirSync(fullPath);
            const mainSessions = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-')).length;
            const agentSessions = files.filter(f => f.startsWith('agent-') && f.endsWith('.jsonl')).length;

            return {
                id: dirName,
                name: decodeProjectPath(dirName),
                encodedPath: dirName,
                mainSessionCount: mainSessions,
                agentSessionCount: agentSessions,
                lastModified: stats.mtime.toISOString()
            };
        });

        // Sort alphabetically by name
        projects.sort((a, b) => a.name.localeCompare(b.name));

        console.log('[API] Returning', projects.length, 'projects');
        res.json({ projects });
    } catch (error) {
        console.error('[API] Error getting projects:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get sessions for a project
app.get('/api/projects/:projectId/sessions', (req, res) => {
    try {
        const { projectId } = req.params;
        const projectDir = path.join(getClaudeProjectsDir(), projectId);

        console.log('[API] GET /api/projects/:projectId/sessions');
        console.log('[API]   projectId:', projectId);
        console.log('[API]   projectDir:', projectDir);
        console.log('[API]   exists:', existsSync(projectDir));

        if (!existsSync(projectDir)) {
            console.log('[API] Project directory not found:', projectDir);
            return res.status(404).json({ error: 'Project not found' });
        }

        const files = readdirSync(projectDir)
            .filter(f => f.endsWith('.jsonl'));

        console.log('[API] Found', files.length, 'session files');

        const sessions = files.map(filename => {
            const filePath = path.join(projectDir, filename);
            const stats = statSync(filePath);
            const isAgent = filename.startsWith('agent-');
            const sessionId = filename.replace('.jsonl', '');

            return {
                id: sessionId,
                filename,
                isAgent,
                size: stats.size,
                created: stats.birthtime.toISOString(),
                modified: stats.mtime.toISOString(),
                path: filePath
            };
        });

        // Sort: main sessions first, then by modified date (newest first)
        sessions.sort((a, b) => {
            if (a.isAgent !== b.isAgent) {
                return a.isAgent ? 1 : -1; // Main sessions first
            }
            return new Date(b.modified) - new Date(a.modified);
        });

        console.log('[API] Returning', sessions.length, 'sessions (', sessions.filter(s => !s.isAgent).length, 'main,', sessions.filter(s => s.isAgent).length, 'agents)');
        res.json({ sessions });
    } catch (error) {
        console.error('[API] Error getting sessions:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Get session history (parse JSONL and return chat messages)
app.get('/api/sessions/:projectId/:sessionId/history', (req, res) => {
    try {
        const { projectId, sessionId } = req.params;
        const sessionFile = path.join(getClaudeProjectsDir(), projectId, `${sessionId}.jsonl`);

        console.log('[API] GET /api/sessions/:projectId/:sessionId/history');
        console.log('[API]   projectId:', projectId);
        console.log('[API]   sessionId:', sessionId);
        console.log('[API]   sessionFile:', sessionFile);

        if (!existsSync(sessionFile)) {
            console.log('[API] Session file not found:', sessionFile);
            return res.status(404).json({ error: 'Session not found' });
        }

        const content = readFileSync(sessionFile, 'utf-8');
        const lines = content.split('\n').filter(l => l.trim());

        console.log('[API] Parsing', lines.length, 'events from session file');

        const messages = [];

        for (const line of lines) {
            try {
                const event = JSON.parse(line);

                // Extract user messages
                if (event.type === 'user' && event.message) {
                    const msg = event.message;
                    if (typeof msg.content === 'string') {
                        messages.push({
                            role: 'user',
                            content: msg.content,
                            timestamp: event.timestamp,
                            uuid: event.uuid
                        });
                    } else if (Array.isArray(msg.content)) {
                        // Check if it's a tool result or regular message
                        const textContent = msg.content
                            .filter(c => c.type === 'text')
                            .map(c => c.text)
                            .join('');

                        if (textContent) {
                            messages.push({
                                role: 'user',
                                content: textContent,
                                timestamp: event.timestamp,
                                uuid: event.uuid
                            });
                        }
                    }
                }

                // Extract assistant messages
                if (event.type === 'assistant' && event.message) {
                    const msg = event.message;
                    const content = msg.content || [];

                    // Extract text content
                    const textContent = content
                        .filter(c => c.type === 'text')
                        .map(c => c.text)
                        .join('');

                    // Extract tool uses
                    const toolUses = content.filter(c => c.type === 'tool_use');

                    if (textContent || toolUses.length > 0) {
                        messages.push({
                            role: 'assistant',
                            content: textContent,
                            toolUses: toolUses.map(t => ({
                                name: t.name,
                                input: t.input
                            })),
                            timestamp: event.timestamp,
                            uuid: event.uuid,
                            model: msg.model
                        });
                    }
                }
            } catch (e) {
                // Skip invalid JSON lines
                console.log('Skipping invalid JSON line in session history');
            }
        }

        console.log('[API] Extracted', messages.length, 'messages from', lines.length, 'events');

        res.json({
            sessionId,
            projectId,
            messages,
            totalEvents: lines.length
        });
    } catch (error) {
        console.error('[API] Error getting session history:', error);
        res.status(500).json({ error: error.message });
    }
});

// API: Switch to a different session
app.post('/api/sessions/switch', (req, res) => {
    try {
        const { sessionId } = req.body;

        console.log('[API] POST /api/sessions/switch');
        console.log('[API]   sessionId:', sessionId);

        if (!sessionId) {
            console.log('[API] Error: sessionId required');
            return res.status(400).json({ error: 'sessionId required' });
        }

        currentSessionId = sessionId;
        saveSessionId(sessionId);

        console.log('[API] Successfully switched to session:', sessionId);

        res.json({
            success: true,
            sessionId: currentSessionId
        });
    } catch (error) {
        console.error('[API] Error switching session:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to extract text from message objects
function extractTextFromMessage(message) {
    if (!message) return '';
    if (typeof message === 'string') return message;
    if (message.content) {
        if (Array.isArray(message.content)) {
            return message.content
                .filter(c => c.type === 'text')
                .map(c => c.text)
                .join(' ');
        }
        return message.content;
    }
    if (message.text) return message.text;
    return '';
}

app.post('/run', (req, res) => {
    console.log('=== POST /run Request ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { command, resetSession } = req.body;
    console.log('Raw prompt:', command);
    console.log('Reset session:', resetSession);
    
    // Reset session if requested
    if (resetSession) {
        currentSessionId = null;
        console.log('Session reset');
    }
    
    if (!command) {
        console.log('ERROR: Prompt not provided');
        return res.status(400).send('Prompt not provided');
    }

    const prompt = command.trim();
    console.log('Trimmed prompt:', prompt);
    
    if (!prompt) {
        console.log('ERROR: Prompt is empty after trim');
        return res.status(400).send('Prompt is empty');
    }

    // Execute claude -p "<prompt>"
    // On Windows, claude only works in Git Bash or WSL, so we use Git Bash
    const isWindows = process.platform === 'win32';
    
    let cmd, args, spawnOptions;
    
    if (isWindows) {
        // Find Git Bash - try common installation paths
        const gitBashPaths = [
            'C:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
            'C:\\Program Files\\Git\\usr\\bin\\bash.exe'
        ];
        
        let bashPath = null;
        for (const bashPathCandidate of gitBashPaths) {
            if (existsSync(bashPathCandidate)) {
                bashPath = bashPathCandidate;
                break;
            }
        }
        
        if (!bashPath) {
            // Fallback to WSL if Git Bash not found
            bashPath = 'wsl.exe';
            console.log('Git Bash not found, using WSL');
        } else {
            console.log('Using Git Bash at:', bashPath);
        }
        
        // Escape single quotes in the prompt for bash
        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        
        // Build command with continuation if session exists
        let claudeCmd;
        if (currentSessionId) {
            // Continue existing session
            claudeCmd = `claude --dangerously-skip-permissions --continue "${escapedPrompt}" --output-format stream-json --verbose`;
            console.log('Continuing session:', currentSessionId);
        } else {
            // Start new session
            claudeCmd = `claude --dangerously-skip-permissions -p "${escapedPrompt}" --output-format stream-json --verbose`;
            console.log('Starting new session');
        }
        
        cmd = bashPath;
        args = ['-c', claudeCmd];
        spawnOptions = {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env // Inherit environment variables so PATH includes npm/node paths
        };
    } else {
        // On Unix-like systems, use claude directly
        let claudeArgs;
        if (currentSessionId) {
            claudeArgs = ['--dangerously-skip-permissions', '--continue', prompt, '--output-format', 'stream-json', '--verbose'];
            console.log('Continuing session:', currentSessionId);
        } else {
            claudeArgs = ['--dangerously-skip-permissions', '-p', prompt, '--output-format', 'stream-json', '--verbose'];
            console.log('Starting new session');
        }
        
        cmd = 'claude';
        args = claudeArgs;
        spawnOptions = {
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        };
    }
    
    console.log('Spawning:', cmd, args);
    console.log('Platform:', process.platform);

    const child = spawn(cmd, args, spawnOptions);
    console.log('Process spawned, PID:', child.pid);

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    let lineBuffer = '';

    child.stdout.on('data', (data) => {
        const text = data.toString();
        lineBuffer += text;
        
        // Process complete lines (JSONL format - one JSON object per line)
        const lines = lineBuffer.split('\n');
        // Keep the last incomplete line in the buffer
        lineBuffer = lines.pop() || '';
        
        for (const line of lines) {
            if (!line.trim()) continue;
            
            try {
                const jsonData = JSON.parse(line.trim());
                
                // Extract session ID from result message
                if (jsonData.type === 'result' && jsonData.session_id) {
                    const newSessionId = jsonData.session_id;
                    currentSessionId = newSessionId;
                    console.log('Extracted session ID from result:', currentSessionId);
                    saveSessionId(currentSessionId);
                    res.write(`\x1b[36m[Session ID: ${currentSessionId}]\x1b[0m\n`);
                }
                
                // Also check system init messages for session ID
                if (jsonData.type === 'system' && jsonData.session_id) {
                    const newSessionId = jsonData.session_id;
                    currentSessionId = newSessionId;
                    console.log('Extracted session ID from system:', currentSessionId);
                    saveSessionId(currentSessionId);
                }
                
                // Process different message types with color coding
                if (jsonData.type === 'system') {
                    // System messages - magenta/cyan for different subtypes
                    if (jsonData.subtype === 'init') {
                        const cwd = jsonData.cwd || 'unknown';
                        res.write(`\x1b[35m[System: Initializing]\x1b[0m Working directory: \x1b[90m${cwd}\x1b[0m\n`);
                        console.log('[System: Init]', jsonData);
                    } else {
                        res.write(`\x1b[35m[System: ${jsonData.subtype || 'message'}]\x1b[0m\n`);
                        console.log('[System]', jsonData);
                    }
                } else if (jsonData.type === 'user') {
                    // User message - blue
                    const userText = extractTextFromMessage(jsonData.message);
                    if (userText) {
                        res.write(`\x1b[34m[User]\x1b[0m ${userText}\n`);
                        console.log('[User]', userText.substring(0, 100));
                    }
                    // Check for tool use responses
                    if (jsonData.message && jsonData.message.content) {
                        const toolUses = jsonData.message.content.filter(c => c.type === 'tool_result' || c.tool_use_id);
                        if (toolUses.length > 0) {
                            res.write(`\x1b[33m[Tool Results: ${toolUses.length}]\x1b[0m\n`);
                        }
                    }
                } else if (jsonData.type === 'assistant') {
                    // Assistant message - check for tool use or text
                    const message = jsonData.message || {};
                    const content = message.content || [];
                    
                    // Check if assistant is using tools
                    const toolUses = content.filter(c => c.type === 'tool_use');
                    if (toolUses.length > 0) {
                        res.write(`\x1b[33m[Assistant: Using ${toolUses.length} tool(s)]\x1b[0m\n`);
                        toolUses.forEach((tool, idx) => {
                            const toolName = tool.name || 'unknown';
                            const toolId = tool.id || `tool_${idx}`;
                            res.write(`\x1b[33m  → Tool: \x1b[93m${toolName}\x1b[33m (ID: ${toolId.substring(0, 20)}...)\x1b[0m\n`);
                            if (tool.input) {
                                const inputStr = JSON.stringify(tool.input);
                                res.write(`\x1b[90m    Input: ${inputStr.substring(0, 150)}${inputStr.length > 150 ? '...' : ''}\x1b[0m\n`);
                            }
                        });
                    }
                    
                    // Output text content
                    const textContent = content.filter(c => c.type === 'text').map(c => c.text).join('');
                    if (textContent) {
                        res.write(`${textContent}\n`);
                    }
                    
                    console.log('[Assistant]', message.id || 'no-id', `(${content.length} content items)`);
                } else if (jsonData.type === 'result') {
                    // Final result - show stats only (result text was already shown in assistant message)
                    res.write(`\x1b[36m[Result]\x1b[0m `);
                    if (jsonData.total_cost_usd) {
                        res.write(`\x1b[90mCost: $${jsonData.total_cost_usd.toFixed(4)}\x1b[0m `);
                    }
                    if (jsonData.duration_ms) {
                        res.write(`\x1b[90mDuration: ${jsonData.duration_ms}ms (API: ${jsonData.duration_api_ms || 'N/A'}ms)\x1b[0m `);
                    }
                    if (jsonData.num_turns) {
                        res.write(`\x1b[90mTurns: ${jsonData.num_turns}\x1b[0m`);
                    }
                    res.write('\n');
                    
                    // Only show result text if it's different from what we already displayed
                    // (usually the result field contains the same text as the last assistant message)
                    // Only show if there's an error or if result exists but wasn't shown before
                    if (jsonData.error) {
                        res.write(`\x1b[31m[Error]\x1b[0m ${jsonData.error}\n`);
                    }
                    
                    // Add line breaks after result to separate from next prompt
                    res.write('\n\n');
                    console.log('[Result]', jsonData.subtype || 'complete', jsonData.is_error ? 'ERROR' : 'SUCCESS');
                } else if (jsonData.type === 'tool') {
                    // Tool execution - yellow with details
                    const toolName = jsonData.tool_name || jsonData.name || 'unknown';
                    const toolId = jsonData.tool_call_id || jsonData.id || 'unknown';
                    res.write(`\x1b[33m[Tool Execution: \x1b[93m${toolName}\x1b[33m]\x1b[0m\n`);
                    res.write(`\x1b[90m  Call ID: ${toolId}\x1b[0m\n`);
                    
                    if (jsonData.input) {
                        const inputStr = typeof jsonData.input === 'string' ? jsonData.input : JSON.stringify(jsonData.input);
                        res.write(`\x1b[90m  Input: ${inputStr.substring(0, 200)}${inputStr.length > 200 ? '...' : ''}\x1b[0m\n`);
                    }
                    if (jsonData.output) {
                        const outputStr = typeof jsonData.output === 'string' ? jsonData.output : JSON.stringify(jsonData.output);
                        res.write(`\x1b[90m  Output: ${outputStr.substring(0, 200)}${outputStr.length > 200 ? '...' : ''}\x1b[0m\n`);
                    }
                    if (jsonData.status) {
                        const statusColor = jsonData.status === 'success' ? '\x1b[32m' : '\x1b[31m';
                        res.write(`  ${statusColor}Status: ${jsonData.status}\x1b[0m\n`);
                    }
                    console.log('[Tool]', toolName, toolId);
                } else {
                    // Unknown type - log and show in UI
                    res.write(`\x1b[90m[Unknown: ${jsonData.type}]\x1b[0m ${JSON.stringify(jsonData).substring(0, 100)}...\n`);
                    console.log('[Unknown]', jsonData.type, jsonData);
                }
            } catch (e) {
                // Not valid JSON, might be partial line or error output
                console.log('Failed to parse JSON line:', line.substring(0, 100));
                // Write as-is for debugging
                res.write(`\x1b[90m[Raw] ${line}\x1b[0m\n`);
            }
        }
        
        console.log('stdout data:', text.substring(0, 100));
    });

    child.stderr.on('data', (data) => {
        console.log('stderr data:', data.toString().substring(0, 100));
        res.write(data);
    });

    child.on('close', (code) => {
        console.log('Process closed with code:', code);
        console.log('Current session ID:', currentSessionId);
        res.end();
    });

    child.on('error', (err) => {
        console.error('Process error:', err);
        if (!res.headersSent) {
            res.status(500).send(`Error executing command: ${err.message}`);
        } else {
            res.end();
        }
    });
});

portfinder.getPortPromise({ port: defaultPort })
    .then((port) => {
        app.listen(port, () => {
            console.log(`Server listening at http://localhost:${port}`);
        });
    })
    .catch((err) => {
        console.error('Error finding a free port:', err);
    });
