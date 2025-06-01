# Brick Set Inventory Tracker

A web-based application for tracking building brick collections and managing missing pieces. The application runs entirely in the browser with no backend requirements.

## Features

- Track multiple building sets
- Manage inventory of owned parts and minifigures
- View missing parts across all sets
- Import and export your inventory data
- Works completely offline using CSV data
- All data stored locally in your browser

## Data Management

### Export/Import Data

You can export your entire inventory data to a JSON file for backup purposes, or import data from a previously exported file.

**To Export:**
1. Go to Settings → Data Management
2. Click "Export Data"
3. A JSON file will be downloaded containing all your inventory data

**To Import:**
1. Go to Settings → Data Management
2. Select a previously exported JSON file
3. Click "Import Data"
4. Your data will be restored from the backup

### Data Sources

This application uses offline CSV data files sourced from the [Rebrickable](https://rebrickable.com) database, providing accurate and up-to-date building brick inventory information including:

- **Complete LEGO catalog**: All official sets, parts, colors, and themes
- **Part relationships**: Compatible and variant part information  
- **Element IDs**: Cross-reference numbers for BrickLink and BrickOwl
- **High-quality images**: Part and set images for visual identification
- **Regular updates**: Updated database ensures compatibility with new releases

**Advantages of CSV Data:**
- ✅ **Works offline** - No internet connection required
- ✅ **Fast loading** - All data available immediately  
- ✅ **No rate limits** - Instant access to any information
- ✅ **Privacy focused** - No external API calls or data sharing
- ✅ **Reliable** - No dependency on external services

## Getting Started

1. **Access the Application**: Open the application in your web browser
2. **Add Sets**: Click "Add Set" to manually add your building block sets to your inventory
3. **Track Progress**: Use the inventory detail view to mark parts as owned/missing
4. **View Statistics**: Monitor your overall completion progress on the dashboard
5. **Manage Data**: Use the Settings page to export/import your data for backup

## Technical Details

### Storage
- Uses **IndexedDB** (preferred) or **localStorage** as fallback
- All data stored locally in your browser
- Export/import functionality for data backup and transfer

### Browser Support
- Modern browsers with ES6+ support
- IndexedDB support recommended for optimal performance
- Works offline after initial load

### Privacy
- No data leaves your browser unless you explicitly export it
- No tracking, analytics, or external API calls
- Complete data ownership and control

## Data Storage

This application stores all your inventory data locally in your browser using IndexedDB (with localStorage fallback for older browsers). Your data never leaves your device unless you explicitly export it.

### Features
- **Persistent Storage**: Your inventory data is saved automatically
- **Privacy First**: No external data transmission 
- **Export/Import**: Backup and restore your data anytime
- **Cross-Device**: Export from one device and import to another

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Rebrickable**: LEGO database and part images
- **Angular**: Frontend framework
- **Tailwind CSS**: UI styling framework
