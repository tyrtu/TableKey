import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#fdf4f0',
          100: '#fbe5d9',
          200: '#f6c9b1',
          300: '#f0a57f',
          400: '#e87a4a',
          500: '#e05c27',
          600: '#c9441b',
          700: '#a73418',
          800: '#882c1a',
          900: '#6f2618',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
