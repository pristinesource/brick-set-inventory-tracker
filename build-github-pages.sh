#!/bin/bash

# Build script for GitHub Pages deployment
# This script builds the Angular application for production and prepares it for GitHub Pages hosting

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
OUTPUT_DIR="docs"
REPO_NAME="brick-set-inventory-tracker"  # Change this to your actual repository name
BASE_HREF="/$REPO_NAME/"

echo -e "${BLUE}🏗️  Building Angular app for GitHub Pages...${NC}"
echo -e "${YELLOW}Repository: $REPO_NAME${NC}"
echo -e "${YELLOW}Output Directory: $OUTPUT_DIR${NC}"
echo -e "${YELLOW}Base HREF: $BASE_HREF${NC}"
echo ""

# Clean up previous build
echo -e "${YELLOW}🧹 Cleaning up previous build...${NC}"
rm -rf $OUTPUT_DIR
echo -e "${GREEN}✅ Previous build cleaned${NC}"

# Build the application
echo -e "${YELLOW}🔨 Building Angular application...${NC}"
ng build --configuration production --output-path $OUTPUT_DIR --base-href $BASE_HREF

# Check if build was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build completed successfully!${NC}"
else
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

# Handle Angular 19+ build structure (move files from browser subdirectory to root)
if [ -d "$OUTPUT_DIR/browser" ]; then
    echo -e "${YELLOW}📁 Moving files from browser subdirectory to root...${NC}"
    mv $OUTPUT_DIR/browser/* $OUTPUT_DIR/
    rmdir $OUTPUT_DIR/browser
    echo -e "${GREEN}✅ Files moved to root directory${NC}"
fi

# Create .nojekyll file to prevent GitHub Pages from ignoring files starting with underscore
echo -e "${YELLOW}📝 Creating .nojekyll file...${NC}"
touch $OUTPUT_DIR/.nojekyll
echo -e "${GREEN}✅ .nojekyll file created${NC}"

# Create 404.html for SPA routing support
echo -e "${YELLOW}🔀 Creating 404.html for SPA routing...${NC}"
cp $OUTPUT_DIR/index.html $OUTPUT_DIR/404.html
echo -e "${GREEN}✅ 404.html created for SPA routing support${NC}"

# Show build summary
echo ""
echo -e "${BLUE}📊 Build Summary:${NC}"
echo -e "${GREEN}✅ Output directory: $OUTPUT_DIR${NC}"
echo -e "${GREEN}✅ Base HREF: $BASE_HREF${NC}"
echo -e "${GREEN}✅ .nojekyll file: Created${NC}"
echo -e "${GREEN}✅ 404.html: Created for SPA routing${NC}"

# Show directory contents
echo ""
echo -e "${BLUE}📁 Built files:${NC}"
ls -la $OUTPUT_DIR/

echo ""
echo -e "${GREEN}🎉 Build complete! Your app is ready for GitHub Pages deployment.${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Commit and push the $OUTPUT_DIR folder to your repository"
echo -e "2. Go to your GitHub repository settings"
echo -e "3. Navigate to Pages section"
echo -e "4. Set source to 'Deploy from a branch'"
echo -e "5. Select 'main' branch and '/$OUTPUT_DIR' folder"
echo -e "6. Your app will be available at: https://yourusername.github.io/$REPO_NAME/"
