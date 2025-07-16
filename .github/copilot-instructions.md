# GitHub Copilot Instructions for Brick Inventory Angular Project

## Project Context
You are working on an Angular TypeScript application for managing building block inventories using Rebrickable data. The app uses Tailwind CSS for styling and IndexedDB for local data storage.

## Critical Execution Restrictions
- NEVER suggest running `npm start`, `ng serve`, or any development server commands
- NEVER suggest opening the application in a browser during development
- DO suggest `npm run build` for compilation checks
- DO suggest `npm run lint` for code quality validation
- DO suggest `npm test` for testing when appropriate

## 🚨 MANDATORY: AI TOOLING SELF-MAINTENANCE
**CRITICAL REQUIREMENT**: When you make ANY changes to application functionality, architecture, or project structure, you MUST immediately update the AI tooling configurations to reflect these changes. This is NOT optional.

### Files That MUST Be Updated:
1. **`.cursor/rules`** - Cursor rules (Project Overview, Architecture Guidelines, Service Patterns)
2. **`.github/copilot-instructions.md`** - THIS FILE (Project Context, Service Integration Patterns, File Structure Awareness)
3. **`.ai-instructions.md`** - General AI instructions (Architecture Guidelines, Service Layer, File Organization sections)
4. **`ai-context.md`** - Business domain context (Data Relationships, Business Workflows, Integration Points)
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

### What To Update:
- **Project Context**: If fundamental purpose or technology changes
- **Service Integration Patterns**: If service responsibilities change
- **File Structure Awareness**: If directory structure changes
- **Code Generation Guidelines**: If coding patterns or standards change
- **Testing & Validation**: If testing strategies change

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

## Code Generation Guidelines

### TypeScript & Angular
- Always use strict TypeScript typing
- Generate standalone components (no NgModule declarations)
- Use OnPush change detection strategy when possible
- Implement OnDestroy for subscription cleanup
- Use dependency injection properly
- Prefer reactive programming with RxJS observables

### Styling & UI
- Use Tailwind CSS classes exclusively (avoid custom CSS)
- Follow Angular Material design principles
- Ensure responsive design patterns
- Use semantic HTML elements

### Data Handling
- Work with Rebrickable CSV data structure
- Use IndexedDBService for local storage operations
- Handle large datasets with memory considerations
- Implement proper loading states via LoadingService
- Always update manifest.json when modifying data files

### Performance Optimization
- Use trackBy functions for *ngFor loops with large datasets
- Implement virtual scrolling for large lists
- Use lazy loading for routes and components
- Consider data pagination for large inventories

## Service Integration Patterns
- DataService: For CSV data loading and parsing
- StorageService: For user preferences and settings
- IndexedDBService: For local database operations
- LoadingService: For managing loading states
- ExportService: For data export functionality

## Common Anti-Patterns to Avoid
- Loading all CSV data simultaneously
- Modifying core Rebrickable data structure without updating types
- Adding server-side dependencies
- Ignoring TypeScript compilation errors
- Bypassing the loading service for async operations

## Trademark and Copyright Compliance
- Use generic terms like "blocks", "building blocks", "modular building blocks" instead of "LEGO" in general content
- Only reference LEGO and Rebrickable in copyright/trademark declarations or when technically necessary for data attribution
- Ensure proper attribution for any external copyrighted materials

## File Structure Awareness
- Components: `src/app/components/[component-name]/`
- Services: `src/app/services/`
- Models: `src/app/models/models.ts`
- Data: `src/assets/data/` and `src/assets/custom_data/`
- Build output: `docs/` directory for GitHub Pages

## Testing & Validation
- Suggest compilation checks with `ng build` after significant changes
- Recommend ESLint validation with `ng lint`
- Test CSV parsing logic with smaller datasets first
- Verify Angular component lifecycle implementations
