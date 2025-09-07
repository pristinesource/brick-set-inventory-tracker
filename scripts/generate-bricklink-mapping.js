#!/usr/bin/env node

/**
 * Script to generate BrickLink to Rebrickable part number mappings
 * This script respects Rebrickable API rate limits (1 request/second average)
 *
 * Usage: node scripts/generate-bricklink-mapping.js
 *
 * Requirements:
 * - Create rebrickable-api-key.txt file with your API key
 * - Run: npm install node-fetch@2
 */

const fs = require('fs').promises;
const path = require('path');
const fetch = require('node-fetch');

// Configuration
const API_KEY_FILE = 'rebrickable-api-key.txt';
const OUTPUT_FILE = 'src/assets/data/bricklink-rebrickable-mapping.json';
const CHECKPOINT_DIR = 'src/assets/data/mapping-checkpoints';
const PARTS_CSV = 'src/assets/data/parts.csv';
const API_BASE_URL = 'https://rebrickable.com/api/v3';
const RATE_LIMIT_DELAY = 1100; // 1.1 seconds between requests (slightly more than 1/sec)
const BATCH_SIZE = 100; // Number of parts to request in a single API call
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds initial retry delay
const CHECKPOINT_INTERVAL = 0.1; // Save checkpoint every 10%

// Helper function to delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to ensure directory exists
async function ensureDirectory(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch (error) {
        console.error(`Error creating directory ${dir}:`, error.message);
    }
}

// Helper function to save checkpoint
async function saveCheckpoint(checkpointNum, data) {
    const checkpointFile = path.join(CHECKPOINT_DIR, `checkpoint-${checkpointNum}.json`);
    try {
        await fs.writeFile(checkpointFile, JSON.stringify(data, null, 2));
        console.log(`Checkpoint ${checkpointNum} saved`);
    } catch (error) {
        console.error(`Error saving checkpoint ${checkpointNum}:`, error.message);
    }
}

// Helper function to load existing checkpoints
async function loadExistingCheckpoints() {
    try {
        await ensureDirectory(CHECKPOINT_DIR);
        const files = await fs.readdir(CHECKPOINT_DIR);
        const checkpointFiles = files.filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));

        const mappings = {
            brickLinkToRebrickable: {},
            rebrickableToBrickLink: {}
        };

        let totalProcessed = 0;
        let totalMapped = 0;

        for (const file of checkpointFiles) {
            try {
                const data = JSON.parse(await fs.readFile(path.join(CHECKPOINT_DIR, file), 'utf8'));

                // Merge mappings
                Object.assign(mappings.brickLinkToRebrickable, data.brickLinkToRebrickable);
                for (const [rb, bl] of Object.entries(data.rebrickableToBrickLink)) {
                    if (!mappings.rebrickableToBrickLink[rb]) {
                        mappings.rebrickableToBrickLink[rb] = [];
                    }
                    mappings.rebrickableToBrickLink[rb] = [...new Set([...mappings.rebrickableToBrickLink[rb], ...bl])];
                }

                totalProcessed += data.metadata.processedInCheckpoint;
                totalMapped += data.metadata.mappedInCheckpoint;
            } catch (error) {
                console.error(`Error loading checkpoint ${file}:`, error.message);
            }
        }

        return { mappings, totalProcessed, totalMapped, checkpointCount: checkpointFiles.length };
    } catch (error) {
        console.error('Error loading checkpoints:', error.message);
        return {
            mappings: { brickLinkToRebrickable: {}, rebrickableToBrickLink: {} },
            totalProcessed: 0,
            totalMapped: 0,
            checkpointCount: 0
        };
    }
}

// Helper function to get checkpoint number for a batch
function getCheckpointNumber(batchIndex, totalBatches, interval) {
    const progress = batchIndex / totalBatches;
    return Math.floor(progress / interval);
}

// Helper function to read API key
async function readApiKey() {
    try {
        const key = await fs.readFile(API_KEY_FILE, 'utf8');
        return key.trim();
    } catch (error) {
        console.error(`Error reading API key from ${API_KEY_FILE}:`, error.message);
        console.log('Please create rebrickable-api-key.txt with your Rebrickable API key');
        process.exit(1);
    }
}

// Helper function to make API request with retry logic
async function apiRequest(url, apiKey, retryCount = 0) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `key ${apiKey}`
            }
        });

        if (response.status === 429) {
            // Rate limited - extract retry time from response if available
            const retryAfter = response.headers.get('retry-after') ||
                (INITIAL_RETRY_DELAY * Math.pow(2, retryCount)) / 1000;
            const retryDelayMs = parseInt(retryAfter) * 1000;

            console.log(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
            await delay(retryDelayMs);

            if (retryCount < MAX_RETRIES) {
                return apiRequest(url, apiKey, retryCount + 1);
            } else {
                throw new Error('Max retries exceeded for rate limiting');
            }
        }

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        if (retryCount < MAX_RETRIES && error.code === 'ECONNRESET') {
            console.log(`Connection reset. Retrying in ${INITIAL_RETRY_DELAY}ms...`);
            await delay(INITIAL_RETRY_DELAY);
            return apiRequest(url, apiKey, retryCount + 1);
        }
        throw error;
    }
}

// Function to fetch parts in batches
async function fetchPartsBatch(partNums, apiKey) {
    const partNumsStr = partNums.join(',');
    const url = `${API_BASE_URL}/lego/parts/?part_nums=${partNumsStr}&inc_part_details=1&page_size=1000`;

    await delay(RATE_LIMIT_DELAY); // Rate limiting
    const data = await apiRequest(url, apiKey);

    return data.results || [];
}

// Function to read all part numbers from CSV
async function readPartNumbers() {
    try {
        const csvContent = await fs.readFile(PARTS_CSV, 'utf8');
        const lines = csvContent.split('\n');
        const partNumbers = [];

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [partNum] = line.split(',');
                if (partNum) {
                    partNumbers.push(partNum);
                }
            }
        }

        return partNumbers;
    } catch (error) {
        console.error('Error reading parts CSV:', error.message);
        process.exit(1);
    }
}

// Main function
async function generateMapping() {
    console.log('Starting BrickLink to Rebrickable mapping generation...');
    console.log('This script respects API rate limits (1 req/sec) and may take a while...\n');

    // Ensure checkpoint directory exists
    await ensureDirectory(CHECKPOINT_DIR);

    // Load existing checkpoints
    const existingData = await loadExistingCheckpoints();
    console.log(`Found ${existingData.checkpointCount} existing checkpoints`);

    if (existingData.totalProcessed > 0) {
        console.log(`Resuming from checkpoint: ${existingData.totalProcessed} parts already processed, ${existingData.totalMapped} mappings found\n`);
    }

    // Read API key
    const apiKey = await readApiKey();
    console.log('API key loaded successfully');

    // Read all part numbers
    const allPartNumbers = await readPartNumbers();
    console.log(`Found ${allPartNumbers.length} parts in CSV\n`);

    // Initialize mapping objects with existing data
    const brickLinkToRebrickable = { ...existingData.mappings.brickLinkToRebrickable };
    const rebrickableToBrickLink = { ...existingData.mappings.rebrickableToBrickLink };
    let processedCount = existingData.totalProcessed;
    let mappedCount = existingData.totalMapped;

    // Track checkpoint data
    let currentCheckpoint = {
        brickLinkToRebrickable: {},
        rebrickableToBrickLink: {},
        processedInCheckpoint: 0,
        mappedInCheckpoint: 0
    };
    let lastCheckpointNum = -1;

    // Process parts in batches
    for (let i = 0; i < allPartNumbers.length; i += BATCH_SIZE) {
        const batch = allPartNumbers.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allPartNumbers.length / BATCH_SIZE);

        // Calculate checkpoint number for this batch
        const checkpointNum = getCheckpointNumber(batchNum, totalBatches, CHECKPOINT_INTERVAL);

        // Skip if this batch was already processed
        if (batchNum * BATCH_SIZE <= existingData.totalProcessed) {
            console.log(`Skipping batch ${batchNum}/${totalBatches} - already processed`);
            continue;
        }

        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} parts)...`);

        try {
            // Fetch parts batch with rate limiting built into fetchPartsBatch
            const parts = await fetchPartsBatch(batch, apiKey);

            // Process each part's external IDs
            for (const part of parts) {
                processedCount++;
                currentCheckpoint.processedInCheckpoint++;

                if (part.external_ids && part.external_ids.BrickLink) {
                    const brickLinkIds = part.external_ids.BrickLink;

                    // Handle both single ID and array of IDs
                    const ids = Array.isArray(brickLinkIds) ? brickLinkIds : [brickLinkIds];

                    for (const blId of ids) {
                        brickLinkToRebrickable[blId] = part.part_num;
                        currentCheckpoint.brickLinkToRebrickable[blId] = part.part_num;
                        mappedCount++;
                        currentCheckpoint.mappedInCheckpoint++;

                        // Also create reverse mapping
                        if (!rebrickableToBrickLink[part.part_num]) {
                            rebrickableToBrickLink[part.part_num] = [];
                        }
                        rebrickableToBrickLink[part.part_num].push(blId);

                        if (!currentCheckpoint.rebrickableToBrickLink[part.part_num]) {
                            currentCheckpoint.rebrickableToBrickLink[part.part_num] = [];
                        }
                        currentCheckpoint.rebrickableToBrickLink[part.part_num].push(blId);
                    }
                }
            }

            // Progress update
            const progress = ((i + batch.length) / allPartNumbers.length * 100).toFixed(1);
            console.log(`Progress: ${progress}% - Found ${mappedCount} BrickLink mappings so far`);

            // Save checkpoint if we've reached a checkpoint boundary
            if (checkpointNum > lastCheckpointNum) {
                const checkpointData = {
                    metadata: {
                        checkpointNumber: checkpointNum,
                        generated: new Date().toISOString(),
                        processedInCheckpoint: currentCheckpoint.processedInCheckpoint,
                        mappedInCheckpoint: currentCheckpoint.mappedInCheckpoint,
                        totalProcessedSoFar: processedCount,
                        totalMappedSoFar: mappedCount
                    },
                    brickLinkToRebrickable: currentCheckpoint.brickLinkToRebrickable,
                    rebrickableToBrickLink: currentCheckpoint.rebrickableToBrickLink
                };

                await saveCheckpoint(checkpointNum, checkpointData);
                lastCheckpointNum = checkpointNum;

                // Reset current checkpoint data
                currentCheckpoint = {
                    brickLinkToRebrickable: {},
                    rebrickableToBrickLink: {},
                    processedInCheckpoint: 0,
                    mappedInCheckpoint: 0
                };
            }

            console.log(); // Empty line for readability

        } catch (error) {
            console.error(`Error processing batch ${batchNum}:`, error.message);
            // Continue with next batch instead of failing completely
        }
    }

    // Save final checkpoint if there's any remaining data
    if (currentCheckpoint.processedInCheckpoint > 0) {
        const totalBatches = Math.ceil(allPartNumbers.length / BATCH_SIZE);
        const finalCheckpointNum = Math.ceil(totalBatches / (1 / CHECKPOINT_INTERVAL));
        const checkpointData = {
            metadata: {
                checkpointNumber: finalCheckpointNum,
                generated: new Date().toISOString(),
                processedInCheckpoint: currentCheckpoint.processedInCheckpoint,
                mappedInCheckpoint: currentCheckpoint.mappedInCheckpoint,
                totalProcessedSoFar: processedCount,
                totalMappedSoFar: mappedCount
            },
            brickLinkToRebrickable: currentCheckpoint.brickLinkToRebrickable,
            rebrickableToBrickLink: currentCheckpoint.rebrickableToBrickLink
        };

        await saveCheckpoint(finalCheckpointNum, checkpointData);
    }

    // Create final mapping object
    const mapping = {
        metadata: {
            generated: new Date().toISOString(),
            totalParts: allPartNumbers.length,
            processedParts: processedCount,
            mappedParts: mappedCount,
            source: 'Rebrickable API v3'
        },
        brickLinkToRebrickable,
        rebrickableToBrickLink
    };

    // Write mapping file
    try {
        await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
        await fs.writeFile(OUTPUT_FILE, JSON.stringify(mapping, null, 2));
        console.log(`\nMapping file generated successfully: ${OUTPUT_FILE}`);
        console.log(`Total mappings: ${mappedCount}`);
        console.log('\nExample mapping (6538c -> 59443):');
        console.log(`BrickLink 6538c maps to Rebrickable: ${brickLinkToRebrickable['6538c'] || 'Not found'}`);

        console.log('\nCheckpoints can be found in:', CHECKPOINT_DIR);
        console.log('To clean up checkpoints after successful completion, run:');
        console.log(`rm -rf ${CHECKPOINT_DIR}`);
    } catch (error) {
        console.error('Error writing mapping file:', error.message);
        process.exit(1);
    }
}

// Run the script
generateMapping().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
