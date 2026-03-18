/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        'plc-blue': '#2563EB',
        'plc-green': '#059669',
        'plc-orange': '#D97706',
        'plc-purple': '#7C3AED',
        'plc-red': '#DC2626',
        'plc-teal': '#0891B2',
        'plc-yellow': '#CA8A04',
      }
    }
  },
  plugins: []
}
