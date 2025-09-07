# BrickLink to Rebrickable Mapping Generator

This script generates a static mapping file between BrickLink and Rebrickable part numbers using the Rebrickable API.

## Setup

1. Get a Rebrickable API key from: https://rebrickable.com/api/
2. Create a file named `rebrickable-api-key.txt` in the project root
3. Paste your API key into this file (just the key, nothing else)
4. Install required dependencies:
   ```bash
   npm install node-fetch@2
   ```

## Usage

Run the script using npm:
```bash
npm run generate:bricklink-mapping
```

Or directly with Node:
```bash
node scripts/generate-bricklink-mapping.js
```

## Output

The script will generate a file at `src/assets/data/bricklink-rebrickable-mapping.json` with the following structure:

```json
{
  "metadata": {
    "generated": "2024-01-15T10:30:00.000Z",
    "totalParts": 59453,
    "processedParts": 59453,
    "mappedParts": 12345,
    "source": "Rebrickable API v3"
  },
  "brickLinkToRebrickable": {
    "6538c": "59443",
    "3001": "3001",
    ...
  },
  "rebrickableToBrickLink": {
    "59443": ["6538c"],
    "3001": ["3001"],
    ...
  }
}
```

## API Rate Limiting

The script respects Rebrickable's API rate limits:
- Average of 1 request per second
- Automatic retry with exponential backoff on rate limit errors
- Batch processing (100 parts per API call) to minimize requests

## Processing Time

With ~60,000 parts and batch processing, the script will take approximately:
- 600 API calls (60,000 parts ÷ 100 per batch)
- ~11 minutes (600 calls × 1.1 seconds per call)

The script shows progress updates during processing.

## Checkpoint System

The script automatically saves progress every 10% to allow resuming if interrupted:

- Checkpoints are saved to `src/assets/data/mapping-checkpoints/`
- Each checkpoint contains the mappings discovered in that 10% segment
- If the script is interrupted, it will automatically resume from the last checkpoint
- Already processed batches are skipped on resume

### Resume After Interruption

Simply run the script again:
```bash
npm run generate:bricklink-mapping
```

The script will:
1. Load all existing checkpoints
2. Skip already processed batches
3. Continue from where it left off

### Cleanup After Success

Once the script completes successfully, you can remove the checkpoint files:
```bash
rm -rf src/assets/data/mapping-checkpoints
```

## Error Handling

- The script will continue processing if individual batches fail
- Rate limit errors (429) are handled with automatic retry
- Connection errors are retried up to 3 times
- Progress is displayed throughout the process
- Checkpoints ensure no data is lost on interruption

## Notes

- The mapping file is added to `.gitignore` to avoid committing generated data
- The API key file is also excluded from version control
- You can re-run the script anytime to update the mappings
