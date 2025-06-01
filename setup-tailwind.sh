#!/bin/bash

# Remove existing tailwind files
rm -f tailwind.config.js postcss.config.js

# Uninstall existing tailwind packages
npm uninstall tailwindcss postcss autoprefixer @tailwindcss/postcss

# Install tailwind and dependencies for Angular
npm install -D tailwindcss postcss autoprefixer

# Initialize tailwind
npx tailwindcss init

# Create tailwind config
cat > tailwind.config.js << 'EOL'
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
EOL

# Create a simple angular.json tailwind setup
cat > angular-tailwind.json << 'EOL'
{
  "projects": {
    "brick-inventory": {
      "architect": {
        "build": {
          "options": {
            "styles": [
              "src/styles.css"
            ]
          }
        }
      }
    }
  }
}
EOL

echo "Setup complete. Please follow these manual steps:"
echo "1. Make sure src/styles.css has the Tailwind directives:"
echo "   @tailwind base;"
echo "   @tailwind components;"
echo "   @tailwind utilities;"
echo "2. Run 'ng serve' to start the development server"
