/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f6f6f6',
          100: '#e8e8e8',
          200: '#d0d0d0',
          300: '#b0b0b0',
          400: '#888888',
          500: '#666666',
          600: '#4a4a4a',
          700: '#333333',
          800: '#1f1f1f',
          900: '#121212',
          950: '#000000',
        },
        brand: {
          50: '#f0f0f0',
          100: '#e6e6e6',
          200: '#cfcfcf',
          300: '#b0b0b0',
          400: '#7a7a7a',
          500: '#4d4d4d',
          600: '#2e2e2e',
          700: '#1f1f1f',
          800: '#161616',
          900: '#000000',
          950: '#000000',
        },
        accent: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
        },
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        'card-hover': '0 2px 6px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.10)',
        soft: '0 1px 2px rgba(0,0,0,0.06)',
      },
      borderRadius: {
        xl: '0.5rem',
        '2xl': '0.75rem',
        '3xl': '1rem',
      },
      maxWidth: {
        content: '1200px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out both',
        'slide-up': 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s ease-out both',
      },
    },
  },
  plugins: [],
};
