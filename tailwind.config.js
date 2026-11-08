/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'gray-650': '#374151',
        'gray-750': '#242e3d',
        'gray-850': '#151d2a',
      }
    },
  },
  plugins: [],
}
