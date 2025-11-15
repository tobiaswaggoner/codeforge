#!/usr/bin/env node

const { Client } = require('pg');

const DB_CONFIG = {
    host: 'localhost',
    port: 5433,
    user: 'USER',
    password: 'get-from-env (this is not the  pw! :-)',
    database: 'claude_sessions'
};

async function main() {
    const client = new Client(DB_CONFIG);
    await client.connect();

    const sessionId = 'c9cfb30d-dc10-472f-bf35-530ff35cf73f';

    console.log('🔍 Current Session Analysis\n');
    console.log('Session ID:', sessionId, '\n');

    // Session info
    const session = await client.query(`
        SELECT * FROM sessions WHERE session_id = $1
    `, [sessionId]);

    if (session.rows.length === 0) {
        console.log('❌ Session not found in database!');
        await client.end();
        return;
    }

    console.log('=== SESSION INFO ===');
    console.table(session.rows);

    // Event count by type
    const eventTypes = await client.query(`
        SELECT type, COUNT(*) as count
        FROM events
        WHERE session_id = $1
        GROUP BY type
        ORDER BY count DESC
    `, [sessionId]);

    console.log('\n=== EVENT TYPES ===');
    console.table(eventTypes.rows);

    // Tool usage
    const tools = await client.query(`
        SELECT tool_name, COUNT(*) as count
        FROM tool_uses tu
        JOIN events e ON tu.event_uuid = e.uuid
        WHERE e.session_id = $1
        GROUP BY tool_name
        ORDER BY count DESC
    `, [sessionId]);

    console.log('\n=== TOOLS USED ===');
    console.table(tools.rows);

    // Recent events
    const recentEvents = await client.query(`
        SELECT type, timestamp,
               SUBSTRING(COALESCE(message::text, raw_data::text), 1, 100) as preview
        FROM events
        WHERE session_id = $1
        ORDER BY timestamp DESC
        LIMIT 10
    `, [sessionId]);

    console.log('\n=== RECENT EVENTS ===');
    console.table(recentEvents.rows);

    // Timeline
    const timeline = await client.query(`
        SELECT
            MIN(timestamp) as session_start,
            MAX(timestamp) as session_end,
            MAX(timestamp) - MIN(timestamp) as duration
        FROM events
        WHERE session_id = $1
    `, [sessionId]);

    console.log('\n=== SESSION TIMELINE ===');
    console.table(timeline.rows);

    await client.end();
}

main().catch(console.error);
