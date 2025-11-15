#!/usr/bin/env node

/**
 * Iterative JSONL Session Parser
 *
 * Parses all Claude Code session files (.jsonl) in ~/.claude/projects/
 * and builds a schema by analyzing the structure.
 *
 * Approach:
 * 1. Start with strict parsing
 * 2. When encountering unknown fields, add them to schema
 * 3. Validate all files can be parsed
 * 4. Export schema + parsed data
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

// Schema Discovery
const discoveredSchema = {
    eventTypes: new Set(),
    fieldsByType: {},
    messageContentTypes: new Set(),
    toolNames: new Set(),
    models: new Set(),
    stopReasons: new Set()
};

// Statistics
const stats = {
    totalFiles: 0,
    totalEvents: 0,
    errorCount: 0,
    errors: []
};

// Get Claude projects directory
function getClaudeProjectsDir() {
    return path.join(os.homedir(), '.claude', 'projects');
}

// Find all .jsonl files
async function findAllSessionFiles() {
    const projectsDir = getClaudeProjectsDir();
    const sessionFiles = [];

    function scanDir(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                scanDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
                sessionFiles.push(fullPath);
            }
        }
    }

    scanDir(projectsDir);
    return sessionFiles;
}

// Parse a single JSONL file
async function parseSessionFile(filePath, sampleOnly = false) {
    const fileStats = {
        path: filePath,
        events: 0,
        errors: [],
        eventTypes: {}
    };

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let lineNumber = 0;

    for await (const line of rl) {
        lineNumber++;

        // Skip empty lines
        if (!line.trim()) continue;

        try {
            const event = JSON.parse(line);

            // Analyze event
            analyzeEvent(event);

            fileStats.events++;
            stats.totalEvents++;

            // Track event types per file
            const eventType = event.type || 'unknown';
            fileStats.eventTypes[eventType] = (fileStats.eventTypes[eventType] || 0) + 1;

            // For sampling mode, only parse first 100 lines per file
            if (sampleOnly && lineNumber > 100) {
                break;
            }

        } catch (error) {
            const errorInfo = {
                file: path.basename(filePath),
                line: lineNumber,
                error: error.message,
                content: line.substring(0, 200)
            };

            fileStats.errors.push(errorInfo);
            stats.errors.push(errorInfo);
            stats.errorCount++;
        }
    }

    return fileStats;
}

// Analyze a single event and update schema
function analyzeEvent(event) {
    // Event type
    const eventType = event.type || 'unknown';
    discoveredSchema.eventTypes.add(eventType);

    // Track all fields for this event type
    if (!discoveredSchema.fieldsByType[eventType]) {
        discoveredSchema.fieldsByType[eventType] = new Set();
    }

    for (const key of Object.keys(event)) {
        discoveredSchema.fieldsByType[eventType].add(key);
    }

    // Analyze message content (if exists)
    if (event.message) {
        const msg = event.message;

        // Track models
        if (msg.model) {
            discoveredSchema.models.add(msg.model);
        }

        // Track stop reasons
        if (msg.stop_reason) {
            discoveredSchema.stopReasons.add(msg.stop_reason);
        }

        // Track message content types
        if (msg.content) {
            if (Array.isArray(msg.content)) {
                for (const item of msg.content) {
                    if (item.type) {
                        discoveredSchema.messageContentTypes.add(item.type);
                    }

                    // Track tool names
                    if (item.type === 'tool_use' && item.name) {
                        discoveredSchema.toolNames.add(item.name);
                    }
                }
            } else if (typeof msg.content === 'string') {
                discoveredSchema.messageContentTypes.add('string');
            }
        }
    }
}

// Print schema
function printSchema() {
    console.log('\n' + '='.repeat(80));
    console.log('DISCOVERED SCHEMA');
    console.log('='.repeat(80));

    console.log('\n📦 Event Types:');
    console.log(Array.from(discoveredSchema.eventTypes).sort());

    console.log('\n📋 Fields by Event Type:');
    for (const [eventType, fields] of Object.entries(discoveredSchema.fieldsByType)) {
        console.log(`\n  ${eventType}:`);
        console.log('    ' + Array.from(fields).sort().join(', '));
    }

    console.log('\n💬 Message Content Types:');
    console.log(Array.from(discoveredSchema.messageContentTypes).sort());

    console.log('\n🔧 Tool Names:');
    console.log(Array.from(discoveredSchema.toolNames).sort());

    console.log('\n🤖 Models:');
    console.log(Array.from(discoveredSchema.models).sort());

    console.log('\n🛑 Stop Reasons:');
    console.log(Array.from(discoveredSchema.stopReasons).sort());

    console.log('\n' + '='.repeat(80));
}

// Print statistics
function printStats() {
    console.log('\n' + '='.repeat(80));
    console.log('PARSING STATISTICS');
    console.log('='.repeat(80));

    console.log(`\nTotal Files:  ${stats.totalFiles}`);
    console.log(`Total Events: ${stats.totalEvents}`);
    console.log(`Errors:       ${stats.errorCount}`);

    if (stats.errorCount > 0) {
        console.log('\n❌ ERRORS (showing first 10):');
        stats.errors.slice(0, 10).forEach(err => {
            console.log(`  ${err.file}:${err.line} - ${err.error}`);
            console.log(`    ${err.content.substring(0, 100)}...`);
        });
    }

    console.log('\n' + '='.repeat(80));
}

// Export schema to JSON
function exportSchema(outputPath) {
    const schema = {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        statistics: {
            totalFiles: stats.totalFiles,
            totalEvents: stats.totalEvents,
            errorCount: stats.errorCount
        },
        schema: {
            eventTypes: Array.from(discoveredSchema.eventTypes).sort(),
            fieldsByType: Object.fromEntries(
                Object.entries(discoveredSchema.fieldsByType).map(([k, v]) => [k, Array.from(v).sort()])
            ),
            messageContentTypes: Array.from(discoveredSchema.messageContentTypes).sort(),
            toolNames: Array.from(discoveredSchema.toolNames).sort(),
            models: Array.from(discoveredSchema.models).sort(),
            stopReasons: Array.from(discoveredSchema.stopReasons).sort()
        }
    };

    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`\n✅ Schema exported to: ${outputPath}`);
}

// Main
async function main() {
    const args = process.argv.slice(2);
    const sampleMode = args.includes('--sample');
    const maxFiles = sampleMode ? 10 : Infinity;

    console.log('🔍 Claude Code Session Parser\n');
    console.log(`Mode: ${sampleMode ? 'SAMPLE (first 10 files, 100 lines each)' : 'FULL SCAN'}\n`);

    // Find all session files
    console.log('Scanning for session files...');
    const sessionFiles = await findAllSessionFiles();
    console.log(`Found ${sessionFiles.length} session files\n`);

    // Parse files
    const filesToParse = sessionFiles.slice(0, maxFiles);
    stats.totalFiles = filesToParse.length;

    console.log(`Parsing ${filesToParse.length} files...`);

    let processed = 0;
    for (const file of filesToParse) {
        processed++;
        if (processed % 10 === 0 || processed === filesToParse.length) {
            process.stdout.write(`\rProgress: ${processed}/${filesToParse.length} files`);
        }

        await parseSessionFile(file, sampleMode);
    }

    console.log('\n');

    // Print results
    printSchema();
    printStats();

    // Export schema
    const outputPath = path.join(__dirname, 'session-schema.json');
    exportSchema(outputPath);

    // Exit code based on errors
    if (stats.errorCount > 0) {
        console.log('\n⚠️  Parsing completed with errors');
        process.exit(1);
    } else {
        console.log('\n✅ Parsing completed successfully!');
        process.exit(0);
    }
}

// Run
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
