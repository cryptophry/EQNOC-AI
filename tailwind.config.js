/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // ACR-aligned tokens (values defined in index.css; light/dark auto-switch)
        app: 'var(--app-bg)',
        card: 'var(--card)',
        'card-2': 'var(--card-2)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        accent: 'var(--accent)',
        'accent-2': 'var(--accent-2)',
        'accent-strong': 'var(--accent-strong)',
        'accent-ink': 'var(--accent-ink)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
        'code-bg': 'var(--code-bg)',
        'code-ink': 'var(--code-ink)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,27,43,0.04)',
        raised: '0 10px 30px rgba(11,27,43,0.10)',
        accent: '0 8px 20px rgba(29,111,242,0.35)',
        glass: '0 30px 80px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      borderRadius: {
        xl2: '18px',
      },
    },
  },
  plugins: [],
};
