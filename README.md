# Brick Set Inventory Tracker

A modern web-based application for tracking building brick collections and managing missing pieces. Built with Angular and designed to work entirely in your browser with no backend requirements.

## 🚀 Try It Now

**[Launch Application](https://pristinesource.github.io/brick-set-inventory-tracker/)** - No installation required!

The application runs entirely in your browser and works offline after the initial load.

## ✨ Features

### Core Functionality
- 📦 **Track multiple building sets** with detailed inventory management
- 🧩 **Manage parts and minifigures** with visual identification
- 📊 **View missing parts** across all sets with completion tracking
- 🎯 **Smart progress calculation** with spare parts handling options
- 🖼️ **Visual part identification** with customizable image sizes
- 📱 **Responsive design** that works on desktop, tablet, and mobile

### Data Management
- 💾 **Import and export** your inventory data for backup and transfer
- 🔄 **Automatic caching** with IndexedDB for fast performance
- 🌐 **Works completely offline** using comprehensive CSV data
- 🔒 **Privacy-first** - all data stored locally in your browser
- ⚡ **Fast loading** with intelligent data caching and batch processing

### User Experience
- 🎨 **Modern, clean interface** built with Tailwind CSS
- 🔍 **Advanced search and filtering** capabilities
- 📈 **Detailed statistics** and completion metrics
- ⚙️ **Customizable settings** for personalized experience
- 📤 **Quick backup** functionality directly from the header

## 🏁 Getting Started

### For Users
1. **[Launch the app](https://pristinesource.github.io/brick-set-inventory-tracker/)** in your web browser
2. **Add Sets**: Click "Add Set" to manually add building block sets to your inventory
3. **Track Progress**: Use the inventory detail view to mark parts as owned/missing
4. **View Statistics**: Monitor your overall completion progress on the dashboard
5. **Manage Data**: Use the Settings page to export/import your data for backup

### Browser Compatibility
- **Recommended**: Chrome 80+, Firefox 75+, Safari 13+, Edge 80+
- **Minimum**: Any browser with ES6+ support and IndexedDB
- **Mobile**: Works on iOS Safari 13+ and Android Chrome 80+
- **Offline**: Full functionality available after initial data load

## 📊 Data Management

### Export/Import Your Inventory
Protect your data with comprehensive backup and restore functionality.

**To Export Your Data:**
1. Navigate to Settings → Data Management
2. Click "Export Data" or use the quick backup button in the header
3. A JSON file containing all your inventory data will be downloaded

**To Import Data:**
1. Go to Settings → Data Management
2. Select a previously exported JSON file using the file picker
3. Click "Import Data" to restore your inventory from the backup

### Building Block Database
This application uses comprehensive offline CSV data sourced from [Rebrickable](https://rebrickable.com), providing:

**Complete Coverage:**
- 🏗️ **50,000+ official LEGO sets** from 1970 to present
- 🧱 **50,000+ unique parts** with detailed specifications
- 🎨 **200+ official colors** with accurate representations
- 👤 **15,000+ minifigures** with complete inventories
- 🎯 **1,000+ themes** and categories for organization

**Advanced Data Features:**
- 🔗 **Part relationships** and compatibility information
- 🏷️ **Element IDs** for cross-referencing with BrickLink and BrickOwl
- 📸 **High-quality images** for visual part identification
- 🔄 **Regular updates** to include new releases and corrections

**Data Advantages:**
- ✅ **Completely offline** - No internet required after initial load
- ✅ **Lightning fast** - All data cached locally with IndexedDB
- ✅ **No rate limits** - Unlimited access to information
- ✅ **Privacy focused** - No external API calls or data sharing
- ✅ **Always available** - No dependency on external services

## 🔧 Technical Details

### Architecture
- **Frontend**: Angular 19.2+ with TypeScript 5.7+
- **Styling**: Tailwind CSS 3.4+ for responsive design
- **Storage**: IndexedDB (primary) with localStorage fallback
- **Build**: Angular CLI with optimized production builds
- **Deployment**: Static hosting via GitHub Pages

### Performance Features
- 🚀 **Lazy loading** for optimal initial load times
- 📦 **Dynamic batching** for large dataset processing
- 🗄️ **Intelligent caching** with automatic cache invalidation
- 💾 **Memory optimization** with efficient data structures
- ⚡ **Progressive loading** with user feedback

### Storage Technology
- **Primary**: IndexedDB for large datasets and optimal performance
- **Fallback**: localStorage for older browsers
- **Capacity**: Handles datasets up to several hundred MB
- **Persistence**: Data survives browser restarts and system reboots
- **Security**: All data remains on your device

### Privacy & Security
- 🔒 **No data transmission** - Everything stays on your device
- 🚫 **No tracking or analytics** - Complete privacy
- 🔐 **No user accounts** required - Anonymous usage
- 💯 **Complete data ownership** - You control everything
- 🛡️ **Secure links** - All external links use proper security attributes

## 🛠️ Development

### Prerequisites
- Node.js 18+ and npm 9+
- Git for version control

### Local Development
```bash
# Clone the repository
git clone https://github.com/pristinesource/brick-set-inventory-tracker.git
cd brick-set-inventory-tracker

# Install dependencies
npm install

# Start development server
npm start

# Navigate to http://localhost:4200
```

### Build Commands
```bash
# Development build
npm run build

# Production build
npm run build -- --configuration production

# Build for GitHub Pages
npm run build:github-pages
```

### Project Structure
```
src/
├── app/
│   ├── components/     # UI components
│   ├── services/       # Data and business logic services
│   ├── models/         # TypeScript interfaces and types
│   └── styles/         # Global styles and Tailwind config
├── assets/
│   └── data/          # CSV data files and manifest
└── environments/      # Environment configurations
```

## 🆘 Support & Contributing

### Getting Help
Found a bug or need assistance? We're here to help!

- 🐛 **Bug Reports**: [Report issues](https://github.com/pristinesource/brick-set-inventory-tracker/issues) with detailed information
- 💡 **Feature Requests**: [Suggest improvements](https://github.com/pristinesource/brick-set-inventory-tracker/issues) and new functionality
- ❓ **Questions**: [Ask for help](https://github.com/pristinesource/brick-set-inventory-tracker/issues) with usage or technical questions
- 📖 **Documentation**: [View the README](https://github.com/pristinesource/brick-set-inventory-tracker#readme) for detailed information

### Before Reporting Issues
1. Check [existing issues](https://github.com/pristinesource/brick-set-inventory-tracker/issues) to avoid duplicates
2. Try clearing your browser cache and data if experiencing data issues
3. Test in an incognito/private browsing window to rule out extensions

### What to Include in Reports
- **Browser and version** (e.g., Chrome 121, Firefox 115, Safari 17)
- **Operating system** (Windows 11, macOS 14, Ubuntu 22.04)
- **Steps to reproduce** the issue in detail
- **Expected vs actual behavior** with clear descriptions
- **Screenshots or screen recordings** if applicable
- **Console errors** (open Developer Tools → Console tab)
- **Data size** (approximate number of sets in your inventory)

### Contributing
We welcome contributions! Here's how you can help:

1. **Fork** the repository on GitHub
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request with a clear description

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](https://github.com/pristinesource/brick-set-inventory-tracker/blob/main/LICENSE) file for details.

The MIT License is a permissive license that allows you to:
- ✅ Use the software for any purpose
- ✅ Modify and distribute the software
- ✅ Include in proprietary software
- ❗ Must include the original license notice

## 📋 Legal Documents

For your protection and transparency, please review our legal documents:

- **[Terms and Conditions](https://github.com/pristinesource/brick-set-inventory-tracker/blob/main/TERMS.md)** - Usage terms, disclaimers, and limitations
- **[Privacy Policy](https://github.com/pristinesource/brick-set-inventory-tracker/blob/main/PRIVACY.md)** - How we handle your data (spoiler: we don't collect any)

## 🙏 Acknowledgments

### Data Sources
- **[Rebrickable](https://rebrickable.com)** - Comprehensive LEGO database and part images
- **[LEGO Group](https://www.lego.com)** - Original building brick designs and sets

### Technology Stack
- **[Angular](https://angular.io)** - Modern web application framework
- **[TypeScript](https://www.typescriptlang.org)** - Type-safe JavaScript development
- **[Tailwind CSS](https://tailwindcss.com)** - Utility-first CSS framework
- **[RxJS](https://rxjs.dev)** - Reactive programming library

### Tools & Services
- **[GitHub](https://github.com)** - Code hosting and collaboration
- **[GitHub Pages](https://pages.github.com)** - Static site hosting
- **[Angular CLI](https://cli.angular.io)** - Development tooling

---

**Made with ❤️ for the building brick community**
