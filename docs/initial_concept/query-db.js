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

    console.log('📊 Claude Sessions Database - Quick Stats\n');

    // Projects
    console.log('=== PROJECTS ===');
    const projects = await client.query(`
        SELECT project_path, COUNT(*) as session_count, MAX(last_active) as last_active
        FROM sessions
        GROUP BY project_path
        ORDER BY session_count DESC
        LIMIT 10
    `);
    console.table(projects.rows);

    // Recent sessions
    console.log('\n=== RECENT SESSIONS ===');
    const recent = await client.query(`
        SELECT session_id, project_path, is_agent, event_count, last_active
        FROM sessions
        ORDER BY last_active DESC
        LIMIT 10
    `);
    console.table(recent.rows);

    // Most used tools
    console.log('\n=== MOST USED TOOLS ===');
    const tools = await client.query(`
        SELECT tool_name, COUNT(*) as usage_count
        FROM tool_uses
        GROUP BY tool_name
        ORDER BY usage_count DESC
    `);
    console.table(tools.rows);

    // Models
    console.log('\n=== MODELS USED ===');
    const models = await client.query(`
        SELECT model, COUNT(*) as session_count
        FROM sessions
        WHERE model IS NOT NULL
        GROUP BY model
        ORDER BY session_count DESC
    `);
    console.table(models.rows);

    await client.end();
}

main().catch(console.error);
