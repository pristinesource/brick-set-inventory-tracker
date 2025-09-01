# AI Context: Brick Inventory Management System

## Business Domain Context

This application manages inventories of modular building blocks using data from Rebrickable, a comprehensive database of building block sets, parts, and relationships.

## 🚨 MANDATORY: AI TOOLING SELF-MAINTENANCE
**CRITICAL REQUIREMENT**: When you make ANY changes to application functionality, architecture, or project structure, you MUST immediately update the AI tooling configurations to reflect these changes. This is NOT optional.

### Files That MUST Be Updated:
1. **`.cursor/rules`** - Cursor rules (Project Overview, Architecture Guidelines, Service Patterns)
2. **`.github/copilot-instructions.md`** - GitHub Copilot instructions (Project Context, Service Integration Patterns, File Structure Awareness)
3. **`.ai-instructions.md`** - General AI instructions (Architecture Guidelines, Service Layer, File Organization sections)
4. **`ai-context.md`** - THIS FILE (Data Relationships, Business Workflows, Integration Points)
5. **`.vscode/settings.json`** - VS Code settings (if new file types, extensions, or tools are added)

### When Updates Are Required:
- ✅ Adding new components, services, or modules
- ✅ Changing data structures or CSV file formats
- ✅ Modifying build processes or dependencies
- ✅ Adding new routes or lazy-loaded modules
- ✅ Changing service responsibilities or patterns
- ✅ Adding new business logic or workflows
- ✅ Modifying file organization or naming conventions
- ✅ Adding new development tools or configurations

### What To Update In This File:
- **Data Relationships & Business Logic**: If entity relationships change
- **Key Business Workflows**: If user workflows or processes change
- **Domain-Specific Terminology**: If new terms or concepts are added
- **Integration Points**: If external dependencies change
- **Performance Benchmarks**: If targets or strategies change

**FAILURE TO UPDATE THESE FILES WILL RESULT IN INCONSISTENT AI ASSISTANCE AND PROJECT CONFUSION.**

## 🗣️ AI Response Behavior & Communication Style

### Response Guidelines
- **Factual Assessment**: If you tell me that I am wrong, I will evaluate whether that assessment is accurate and respond with facts and evidence
- **Direct Communication**: Avoid apologizing or making conciliatory statements when not warranted
- **Professional Tone**: It is not necessary to agree with statements using "You're right" or "Yes" unless factually accurate
- **Pragmatic Focus**: Avoid hyperbole and excitement; stick to the task at hand and complete it pragmatically
- **Emojis**: It is acceptable to use emojis in responses to help indicate sections and statuses. This provides a quick way to the user to visually identify sections and their meanings in responses.

### Communication Principles
- Provide clear, factual responses based on available information
- Focus on completing requested tasks efficiently
- Maintain professional tone without unnecessary agreement or apology
- Present evidence and reasoning when disagreeing or correcting information

## Data Relationships & Business Logic

### Core Entities

#### Sets
- Complete building block products with instructions
- Have themes (City, Space, Castle, etc.)
- Contain multiple parts in specific quantities
- May include minifigures
- Each set has a unique set number and name

#### Parts
- Individual building block pieces
- Categorized by part categories (bricks, plates, slopes, etc.)
- Have specific colors and material properties
- May have alternate part numbers or relationships
- Essential for calculating inventory completeness

#### Inventories
- Define what parts are needed for specific sets
- Include quantities required for each part
- May specify spare parts included
- Link sets to their component parts

#### Colors
- Standardized color system for parts
- RGB values and color names
- Some colors may be transparent or have special properties

#### Minifigures
- Character figures included in sets
- Have their own inventory of parts (heads, torsos, legs, accessories)
- May appear across multiple sets

### Key Business Workflows

#### Inventory Management
1. **Set Registration**: Add sets to personal collection
2. **Part Tracking**: Monitor individual parts owned vs. needed
3. **Completion Analysis**: Calculate percentage complete for sets
4. **Missing Parts**: Identify what parts are needed to complete sets
5. **External Integration**: Direct Rebrickable links for all parts across inventory views (loose parts, set inventories, missing parts)

#### Data Processing
1. **CSV Import**: Load large Rebrickable datasets efficiently
2. **Data Synchronization**: Keep local data updated with Rebrickable releases
3. **Memory Management**: Handle datasets with 100k+ records
4. **Export Functions**: Generate reports and part lists
5. **Type Safety**: Identifier fields (part_num, set_num, element_id, fig_num) preserved as strings during CSV parsing to prevent type conversion errors in sorting and comparison operations

### Performance Considerations

#### Large Dataset Handling
- Inventory parts files contain 500k+ records
- Part data includes 50k+ unique parts
- Set data spans decades of releases
- Color data includes 200+ distinct colors

#### User Experience Priorities
- Fast search and filtering across large datasets
- Responsive UI during data loading operations
- Offline functionality with local storage
- Export capabilities for external use

### Domain-Specific Terminology

#### Building Block Terms
- **Element**: A part in a specific color
- **Lot**: A collection of identical elements
- **MOC**: My Own Creation (custom builds)
- **Parts Pack**: Sets sold containing specific parts

#### Inventory Terms
- **Loose Parts**: Individual parts not associated with specific sets
- **Set Inventory**: Complete list of parts needed for a set
- **Spare Parts**: Extra parts included beyond minimum requirements
- **Missing Parts**: Parts needed to complete a set

#### Data Management Terms
- **Manifest**: File tracking data versions and availability
- **Chunk Files**: Large datasets split for performance
- **Custom Data**: User-defined categorizations and modifications

### Integration Points

#### Rebrickable API (Reference Only)
- This app uses static CSV exports, not live API
- Data structure matches Rebrickable's API format
- Updates require manual CSV refresh

#### Export Formats
- CSV for spreadsheet compatibility
- JSON for data interchange
- Custom formats for specific use cases

### Privacy & Data Ownership

#### User Data
- All inventory data stored locally
- No cloud synchronization
- User controls all personal data

#### Rebrickable Data
- Used under appropriate licensing
- Attribution maintained for data source
- Respects trademark and copyright requirements

### Performance Benchmarks

#### Target Performance
- Initial load: < 3 seconds for basic interface
- Search operations: < 500ms for filtered results
- Data export: < 5 seconds for complete inventories
- Memory usage: < 100MB for typical operations

#### Cache Management
- Automatic cache refresh: Configurable via CSV_CACHE_EXPIRY_HOURS in IndexedDBService (currently 720 hours/monthly)
- Manual refresh available through Settings interface
- Cache expiry prevents stale data issues
- UI automatically displays current cache expiry time from configuration

#### Optimization Strategies
- Lazy loading for large component lists
- Virtual scrolling for 1000+ item displays
- IndexedDB for persistent local storage
- Chunk-based loading for massive datasets

This context helps AI assistants understand the business domain and make appropriate suggestions for features, optimizations, and user workflows.

### Service Architecture Updates (2025)

#### Background Loading and Caching Services
- **BackgroundLoadingService**: Manages background IndexedDB population with footer progress indicator
  - Shows progress at bottom of screen while app remains usable
  - Auto-dismisses when complete
  - User can dismiss manually to hide progress

- **ImageService**: Simplified for performance - direct CDN URLs only
  - No caching due to CORS restrictions on Rebrickable CDN
  - Returns direct CDN URLs without timestamps or processing
  - Provides fallback to placeholder images
  - Optimized for fast synchronous URL generation

- **ImageDownloaderService**: Disabled due to CORS restrictions
  - Cannot download images from Rebrickable CDN
  - Service exists but is not initialized to prevent performance issues

#### Data Loading Strategy
1. **Initial Load**: CSV data loaded into memory for immediate use
2. **Background Cache**: IndexedDB population happens in background
3. **Images**: Load directly from CDN on demand (no preloading due to CORS)
4. **Progressive Enhancement**: App works immediately with in-memory data
