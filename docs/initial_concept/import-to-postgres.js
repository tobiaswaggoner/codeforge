#!/usr/bin/env node

/**
 * Claude Code Session Importer for PostgreSQL
 *
 * Imports all session files from ~/.claude/projects/ into PostgreSQL
 * Idempotent: Can be re-run to sync changes
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const { Client } = require('pg');

// Database configuration
const DB_CONFIG = {
    host: 'localhost',
    port: 5433,
    user: 'USER',
    password: 'get-from-env (this is not the  pw! :-)',
    database: 'claude_sessions'
};

// Statistics
const stats = {
    sessions: { created: 0, updated: 0, skipped: 0 },
    events: { created: 0, updated: 0, skipped: 0 },
    toolUses: { created: 0 },
    errors: []
};

// Get Claude projects directory
function getClaudeProjectsDir() {
    return path.join(os.homedir(), '.claude', 'projects');
}

// Find all session files
function findAllSessionFiles() {
    const projectsDir = getClaudeProjectsDir();
    const sessionFiles = [];

    function scanDir(dir, projectPath = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // This is a project directory
                scanDir(fullPath, entry.name);
            } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                sessionFiles.push({
                    filePath: fullPath,
                    projectPath: projectPath,
                    filename: entry.name,
                    sessionId: entry.name.replace('.jsonl', ''),
                    isAgent: entry.name.startsWith('agent-')
                });
            }
        }
    }

    scanDir(projectsDir);
    return sessionFiles;
}

// Create database tables
async function setupDatabase(client) {
    console.log('Setting up database schema...');

    // Create tables
    await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_id VARCHAR(36) PRIMARY KEY,
            project_path VARCHAR(500),
            is_agent BOOLEAN,
            agent_id VARCHAR(20),
            created_at TIMESTAMP,
            last_active TIMESTAMP,
            event_count INTEGER DEFAULT 0,
            model VARCHAR(100),
            file_path TEXT,
            file_size BIGINT,
            last_imported TIMESTAMP DEFAULT NOW()
        )
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS events (
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
        )
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS tool_uses (
            id SERIAL PRIMARY KEY,
            event_uuid VARCHAR(36) REFERENCES events(uuid) ON DELETE CASCADE,
            tool_name VARCHAR(100),
            tool_use_id VARCHAR(100),
            input JSONB,
            timestamp TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `);

    // Create indexes
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_parent ON events(parent_uuid)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path)
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(last_active)
    `);

    console.log('✅ Database schema ready\n');
}

// Parse a session file and import to DB
async function importSessionFile(client, fileInfo) {
    const { filePath, projectPath, sessionId, isAgent } = fileInfo;

    try {
        // Get file stats
        const fileStats = fs.statSync(filePath);

        // Check if file has been modified since last import
        const existingSession = await client.query(
            `SELECT last_imported FROM sessions WHERE session_id = $1`,
            [sessionId]
        );

        if (existingSession.rows.length > 0) {
            const lastImported = existingSession.rows[0].last_imported;
            if (fileStats.mtime <= lastImported) {
                stats.sessions.skipped++;
                return; // File not modified, skip
            }
        }

        // Parse JSONL file
        const events = [];
        const fileStream = fs.createReadStream(filePath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        for await (const line of rl) {
            if (line.trim()) {
                try {
                    events.push(JSON.parse(line));
                } catch (err) {
                    stats.errors.push({
                        file: sessionId,
                        error: `Parse error: ${err.message}`
                    });
                }
            }
        }

        if (events.length === 0) return;

        // Extract session metadata
        const firstEvent = events[0];
        const lastEvent = events[events.length - 1];
        const agentId = isAgent ? sessionId.replace('agent-', '') : null;

        // Find model used (from first assistant message)
        let model = null;
        for (const event of events) {
            if (event.type === 'assistant' && event.message?.model) {
                model = event.message.model;
                break;
            }
        }

        // Upsert session
        await client.query(`
            INSERT INTO sessions (
                session_id, project_path, is_agent, agent_id,
                created_at, last_active, event_count, model,
                file_path, file_size, last_imported
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (session_id) DO UPDATE SET
                event_count = $7,
                last_active = $6,
                model = $8,
                file_size = $10,
                last_imported = NOW()
        `, [
            sessionId,
            projectPath,
            isAgent,
            agentId,
            firstEvent.timestamp || new Date(),
            lastEvent.timestamp || new Date(),
            events.length,
            model,
            filePath,
            fileStats.size
        ]);

        if (existingSession.rows.length > 0) {
            stats.sessions.updated++;

            // Delete old events for this session (we'll re-import all)
            await client.query(`DELETE FROM events WHERE session_id = $1`, [sessionId]);
        } else {
            stats.sessions.created++;
        }

        // Import events
        for (const event of events) {
            try {
                await importEvent(client, sessionId, event);
            } catch (err) {
                stats.errors.push({
                    file: sessionId,
                    event: event.uuid,
                    error: err.message
                });
            }
        }

    } catch (err) {
        stats.errors.push({
            file: sessionId,
            error: err.message
        });
        console.error(`Error importing ${sessionId}:`, err.message);
    }
}

// Import a single event
async function importEvent(client, sessionId, event) {
    const result = await client.query(`
        INSERT INTO events (
            session_id, uuid, parent_uuid, type, subtype,
            timestamp, cwd, git_branch, is_sidechain, agent_id,
            request_id, message, raw_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (uuid) DO UPDATE SET
            raw_data = $13,
            message = $12
        RETURNING id, uuid
    `, [
        sessionId,
        event.uuid || null,
        event.parentUuid || null,
        event.type,
        event.subtype || null,
        event.timestamp || null,
        event.cwd || null,
        event.gitBranch || null,
        event.isSidechain || false,
        event.agentId || null,
        event.requestId || null,
        event.message ? JSON.stringify(event.message) : null,
        JSON.stringify(event)
    ]);

    if (result.rowCount > 0) {
        stats.events.created++;
    }

    const eventUuid = result.rows[0].uuid;

    // Import tool uses
    if (event.message && event.message.content && Array.isArray(event.message.content)) {
        for (const content of event.message.content) {
            if (content.type === 'tool_use') {
                await client.query(`
                    INSERT INTO tool_uses (
                        event_uuid, tool_name, tool_use_id, input, timestamp
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT DO NOTHING
                `, [
                    eventUuid,
                    content.name,
                    content.id,
                    JSON.stringify(content.input),
                    event.timestamp
                ]);
                stats.toolUses.created++;
            }
        }
    }
}

// Print statistics
function printStats() {
    console.log('\n' + '='.repeat(80));
    console.log('IMPORT STATISTICS');
    console.log('='.repeat(80));

    console.log('\n📦 Sessions:');
    console.log(`  Created: ${stats.sessions.created}`);
    console.log(`  Updated: ${stats.sessions.updated}`);
    console.log(`  Skipped: ${stats.sessions.skipped} (not modified)`);

    console.log('\n📝 Events:');
    console.log(`  Created: ${stats.events.created}`);

    console.log('\n🔧 Tool Uses:');
    console.log(`  Created: ${stats.toolUses.created}`);

    if (stats.errors.length > 0) {
        console.log(`\n❌ Errors: ${stats.errors.length}`);
        console.log('First 5 errors:');
        stats.errors.slice(0, 5).forEach(err => {
            console.log(`  ${err.file}: ${err.error}`);
        });
    }

    console.log('\n' + '='.repeat(80));
}

// Main
async function main() {
    console.log('🔍 Claude Code Session Importer for PostgreSQL\n');

    // First, connect to postgres database to create our database
    const setupClient = new Client({
        ...DB_CONFIG,
        database: 'postgres'
    });

    try {
        await setupClient.connect();
        console.log('✅ Connected to PostgreSQL\n');

        // Check and create database
        const dbExists = await setupClient.query(
            `SELECT 1 FROM pg_database WHERE datname = $1`,
            ['claude_sessions']
        );

        if (dbExists.rows.length === 0) {
            console.log('Creating database claude_sessions...');
            await setupClient.query('CREATE DATABASE claude_sessions');
            console.log('✅ Database created\n');
        } else {
            console.log('Database claude_sessions already exists\n');
        }

        await setupClient.end();
    } catch (err) {
        console.error('❌ Failed to connect to PostgreSQL:', err.message);
        console.error('\nPlease ensure:');
        console.error('  - PostgreSQL is running on port 5433');
        console.error('  - User "USER" exists');
        console.error('  - Password is correct');
        process.exit(1);
    }

    // Now connect to the actual database
    const client = new Client(DB_CONFIG);

    try {
        await client.connect();
        console.log('✅ Connected to claude_sessions database\n');
    } catch (err) {
        console.error('❌ Failed to connect to claude_sessions database:', err.message);
        process.exit(1);
    }

    try {
        // Setup database
        await setupDatabase(client);

        // Find all session files
        console.log('Scanning for session files...');
        const sessionFiles = findAllSessionFiles();
        console.log(`Found ${sessionFiles.length} session files\n`);

        // Import sessions
        console.log('Importing sessions...');
        let processed = 0;

        for (const fileInfo of sessionFiles) {
            processed++;
            if (processed % 50 === 0 || processed === sessionFiles.length) {
                process.stdout.write(`\rProgress: ${processed}/${sessionFiles.length} files`);
            }

            await importSessionFile(client, fileInfo);
        }

        console.log('\n');

        // Print statistics
        printStats();

        console.log('\n✅ Import completed successfully!');

        // Print some example queries
        console.log('\n📊 Example Queries:\n');
        console.log('  -- List all projects:');
        console.log('  SELECT DISTINCT project_path, COUNT(*) as session_count FROM sessions GROUP BY project_path;\n');
        console.log('  -- Recent sessions:');
        console.log('  SELECT session_id, project_path, last_active FROM sessions ORDER BY last_active DESC LIMIT 10;\n');
        console.log('  -- Most used tools:');
        console.log('  SELECT tool_name, COUNT(*) as usage_count FROM tool_uses GROUP BY tool_name ORDER BY usage_count DESC;\n');

    } catch (err) {
        console.error('\n❌ Import failed:', err);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
