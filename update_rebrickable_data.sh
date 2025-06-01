#!/bin/bash

# Script to download and update Rebrickable CSV data files
# This script downloads data from rebrickable.com, extracts the files,
# splits large files into chunks of max 50MB, and creates a manifest
# showing how many parts each file has been split into

# Make sure the destination directory exists
mkdir -p src/assets/data

# Clean up old data files and manifest
echo "Cleaning up old data files..."
rm -f src/assets/data/*.csv
rm -f src/assets/data/manifest.json
echo "Old data files removed."

# Array of file URLs to download
URLS=(
  "https://cdn.rebrickable.com/media/downloads/themes.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/colors.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/part_categories.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/parts.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/part_relationships.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/elements.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/sets.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/minifigs.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/inventories.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/inventory_parts.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/inventory_sets.csv.gz"
  "https://cdn.rebrickable.com/media/downloads/inventory_minifigs.csv.gz"
)

# Maximum file size in bytes (50MB)
MAX_FILE_SIZE=$((50 * 1024 * 1024))

# Create a temporary directory for downloads
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Create a temporary file to store manifest data
MANIFEST_FILE="$TEMP_DIR/manifest.tmp"
echo "{" > "$MANIFEST_FILE"

# Flag to track if we need a comma in JSON
FIRST_ENTRY=true

# Function to split CSV file if it's too large
split_csv_if_needed() {
  local csv_file="$1"
  local base_name="$2"

  # Get file size using wc -c (more portable)
  file_size=$(wc -c < "$csv_file" 2>/dev/null | tr -d ' ')

  # Check if file_size is empty or not a number
  if [[ -z "$file_size" ]] || ! [[ "$file_size" =~ ^[0-9]+$ ]]; then
    echo "Warning: Could not determine file size for $base_name, treating as small file"
    file_size=0
  fi

  if [ "$file_size" -gt "$MAX_FILE_SIZE" ]; then
    echo "File $base_name is ${file_size} bytes (>50MB), splitting..."

    # Read the header
    header=$(head -n1 "$csv_file")

    # Count total lines (excluding header)
    total_lines=$(($(wc -l < "$csv_file") - 1))

    # Calculate lines per chunk to aim for ~40MB per chunk
    # Using a simple approximation: lines_per_chunk = (40MB * total_lines) / file_size_MB
    file_size_mb=$((file_size / 1024 / 1024))
    if [ "$file_size_mb" -eq 0 ]; then
      file_size_mb=1  # Prevent division by zero
    fi
    lines_per_chunk=$((total_lines * 40 / file_size_mb))

    # Ensure minimum chunk size
    if [ "$lines_per_chunk" -lt 1000 ]; then
      lines_per_chunk=1000
    fi

    echo "Splitting into chunks of approximately $lines_per_chunk lines each..."

    # Split the file (excluding header)
    tail -n +2 "$csv_file" | split -l "$lines_per_chunk" - "$TEMP_DIR/${base_name}_part_"

    # Count how many parts were created
    part_count=$(ls "$TEMP_DIR/${base_name}_part_"* 2>/dev/null | wc -l)

    # Add header to each part and move to final location
    part_num=1
    for part_file in "$TEMP_DIR/${base_name}_part_"*; do
      if [ -f "$part_file" ]; then
        output_file="src/assets/data/${base_name}_part_${part_num}.csv"
        echo "$header" > "$output_file"
        cat "$part_file" >> "$output_file"
        rm "$part_file"
        ((part_num++))
      fi
    done

    # Remove the original large file
    rm "$csv_file"

    # Add to manifest
    if [ "$FIRST_ENTRY" = true ]; then
      FIRST_ENTRY=false
      echo -n "  \"$base_name\": $part_count" >> "$MANIFEST_FILE"
    else
      echo "," >> "$MANIFEST_FILE"
      echo -n "  \"$base_name\": $part_count" >> "$MANIFEST_FILE"
    fi

    echo "Split $base_name into $part_count parts"
  else
    echo "File $base_name is ${file_size} bytes (<50MB), keeping as single file"

    # Add to manifest
    if [ "$FIRST_ENTRY" = true ]; then
      FIRST_ENTRY=false
      echo -n "  \"$base_name\": 1" >> "$MANIFEST_FILE"
    else
      echo "," >> "$MANIFEST_FILE"
      echo -n "  \"$base_name\": 1" >> "$MANIFEST_FILE"
    fi
  fi
}

# Download and extract each file
for url in "${URLS[@]}"; do
  # Extract the filename from the URL
  filename=$(basename "$url" | cut -d'?' -f1)
  csv_filename="${filename%.gz}"
  base_name="${csv_filename%.csv}"

  echo "Downloading $filename..."
  curl -s -L "$url" -o "$TEMP_DIR/$filename"

  echo "Extracting $filename to $csv_filename..."
  gunzip -c "$TEMP_DIR/$filename" > "$TEMP_DIR/$csv_filename"

  echo "Processing $csv_filename..."

  # Process the file in temp directory first
  split_csv_if_needed "$TEMP_DIR/$csv_filename" "$base_name"

  # If file wasn't split (single file), move it to final location
  if [ -f "$TEMP_DIR/$csv_filename" ]; then
    mv "$TEMP_DIR/$csv_filename" "src/assets/data/$csv_filename"
  fi

  echo "Successfully processed $csv_filename"
done

# Finalize manifest JSON file
echo "" >> "$MANIFEST_FILE"
echo "}" >> "$MANIFEST_FILE"

# Move manifest to final location
mv "$MANIFEST_FILE" "src/assets/data/manifest.json"

echo "Generating manifest file..."
echo "Manifest created:"
cat src/assets/data/manifest.json

# Clean up temporary files
echo "Cleaning up temporary files..."
rm -rf "$TEMP_DIR"

echo "All data files have been updated successfully!"
echo "Large files have been split into chunks of max 50MB"
echo "Check manifest.json for file part counts"
echo "Data source: rebrickable.com"
