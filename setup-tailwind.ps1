# Remove existing tailwind files
Remove-Item -Force -ErrorAction SilentlyContinue tailwind.config.js, postcss.config.js

# Uninstall existing tailwind packages
npm uninstall tailwindcss postcss autoprefixer @tailwindcss/postcss

# Install tailwind and dependencies for Angular
npm install -D tailwindcss postcss autoprefixer

# Create tailwind config
@"
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
"@ | Out-File -FilePath tailwind.config.js -Encoding utf8

# Verify styles.css has Tailwind directives
$stylesContent = Get-Content -Path src/styles.css -Raw
if (-not ($stylesContent -match "@tailwind base")) {
  @"
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Additional global styles can be added here */
"@ | Out-File -FilePath src/styles.css -Encoding utf8
}

Write-Host "Setup complete. Please run 'ng serve' to start the development server"
