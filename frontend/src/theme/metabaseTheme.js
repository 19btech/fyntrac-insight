import { createTheme } from '@mui/material/styles';

/**
 * Fyntrac design tokens — synced with main Fyntrac DSL app.
 * Light, clean, Tailwind/shadcn-style: indigo accent, black primary, Inter font,
 * white sidebar, rounded-xl cards with subtle shadows.
 */
export const fyntracTokens = {
  brand: {
    indigo: '#6366f1',
    indigoDark: '#4f46e5',
    indigoLight: '#818cf8',
    indigoBg: '#eef2ff',
    amber: '#f59e0b',
    amberBg: '#fef3c7',
    green: '#10b981',
    greenBg: '#d1fae5',
    red: '#ef4444',
    redBg: '#fee2e2',
    black: '#14213d',
  },
};

/**
 * Build the Fyntrac light theme. Dark mode is intentionally not supported.
 */
export function buildMetabaseTheme() {
  const t = fyntracTokens;

  const palette = {
    mode: 'light',
    primary: { main: t.brand.indigo, dark: t.brand.indigoDark, light: t.brand.indigoLight, contrastText: '#ffffff' },
    secondary: { main: t.brand.black, contrastText: '#ffffff' },
    background: { default: '#E2E8F0', paper: '#ffffff' },
    text: { primary: '#14213d', secondary: '#64748b' },
    divider: '#e5e7eb',
    success: { main: t.brand.green },
    error: { main: t.brand.red },
    warning: { main: t.brand.amber },
  };

  return createTheme({
    palette,
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
      fontSize: 14,
      h1: { fontSize: '1.625rem', fontWeight: 700, letterSpacing: '-0.02em', color: palette.text.primary },
      h2: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.015em', color: palette.text.primary },
      h3: { fontSize: '1.125rem', fontWeight: 600, letterSpacing: '-0.01em', color: palette.text.primary },
      h4: { fontSize: '1rem', fontWeight: 600, color: palette.text.primary },
      h5: { fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.5px', color: '#1E293B' },
      h6: { fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.2, color: '#1E293B' },
      body1: { fontSize: '0.875rem', color: palette.text.primary },
      body2: { fontSize: '0.8125rem', color: palette.text.secondary },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          '@keyframes fyntracFadeIn': {
            from: { opacity: 0, transform: 'translateY(4px)' },
            to: { opacity: 1, transform: 'translateY(0)' },
          },
          '@keyframes fyntracFadeInFast': {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          '@keyframes fyntracPulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.55 },
          },
          body: {
            backgroundColor: '#E2E8F0',
            fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
            WebkitFontSmoothing: 'antialiased',
          },
          '.fyntrac-fade-in': {
            // Pure opacity fade (no translateY) so page-to-page navigation
            // glides in instead of jolting up 4px — that vertical jump read
            // as a flicker. Kept short so it feels instant but smooth.
            animation: 'fyntracFadeInFast 180ms ease-out both',
          },
          '.fyntrac-pulse': { animation: 'fyntracPulse 1.4s ease-in-out infinite' },
          // Smooth scrollbar
          '*::-webkit-scrollbar': { width: 10, height: 10 },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: '#e2e8f0',
            borderRadius: 8,
            border: `2px solid ${palette.background.default}`,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: '#cbd5e1',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.875rem',
            boxShadow: 'none',
            paddingInline: 14,
            transition: 'background-color 180ms ease, color 180ms ease, border-color 180ms ease, transform 160ms ease, box-shadow 200ms ease',
            '&:hover': {
              boxShadow: '0 4px 10px rgba(20,33,61,0.18)',
              transform: 'translateY(-1px)',
            },
            '&:active': { transform: 'scale(0.97)' },
          },
          contained: {
            backgroundColor: t.brand.black,
            color: '#ffffff',
            '&:hover': {
              backgroundColor: '#1f3158',
              boxShadow: '0 6px 14px rgba(20,33,61,0.25)',
              transform: 'translateY(-1px)',
            },
          },
          containedPrimary: {
            backgroundColor: t.brand.black,
            color: '#ffffff',
            '&:hover': {
              backgroundColor: '#1f3158',
              boxShadow: '0 6px 14px rgba(20,33,61,0.25)',
            },
          },
          containedSecondary: {
            backgroundColor: t.brand.black,
            color: '#ffffff',
            '&:hover': { backgroundColor: '#1f3158' },
          },
          outlined: {
            borderColor: palette.divider,
            color: palette.text.primary,
            '&:hover': {
              borderColor: t.brand.black,
              backgroundColor: '#f8fafc',
              color: t.brand.black,
            },
          },
          text: {
            color: palette.text.primary,
            '&:hover': {
              backgroundColor: 'rgba(20,33,61,0.06)',
              color: t.brand.black,
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)',
            border: `1px solid ${palette.divider}`,
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-4px)',
              boxShadow: '0px 12px 24px -4px rgba(100, 116, 139, 0.12)',
              borderColor: 'rgba(99, 102, 241, 0.3)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: { border: `1px solid ${palette.divider}` },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: palette.background.paper,
            color: palette.text.primary,
            boxShadow: 'none',
            borderBottom: `1px solid ${palette.divider}`,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: '#f8fafc',
            fontWeight: 600,
            fontSize: '0.75rem',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: palette.text.secondary,
            borderBottom: `1px solid ${palette.divider}`,
          },
          body: { fontSize: '0.875rem', borderBottom: `1px solid ${palette.divider}` },
        },
      },
      MuiCardActionArea: {
        styleOverrides: {
          root: {
            transition: 'transform 200ms ease, box-shadow 200ms ease',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 16px rgba(15,23,42,0.08), 0 2px 4px rgba(15,23,42,0.04)',
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 6,
            fontSize: '0.75rem',
            fontWeight: 500,
            height: 22,
            transition: 'background-color 150ms ease, color 150ms ease, transform 120ms ease',
          },
          clickable: {
            '&:hover': { transform: 'translateY(-1px)' },
            '&:active': { transform: 'scale(0.97)' },
          },
          colorPrimary: { backgroundColor: t.brand.indigoBg, color: t.brand.indigoDark },
          colorSuccess: { backgroundColor: t.brand.greenBg, color: '#047857' },
          colorWarning: { backgroundColor: t.brand.amberBg, color: '#b45309' },
          colorError: { backgroundColor: t.brand.redBg, color: '#b91c1c' },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small' },
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { borderRadius: '10px' },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: '10px',
            backgroundColor: '#F8FAFC',
            fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
            fontSize: '0.88rem',
            transition: 'all 0.2s',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(148, 163, 184, 0.2)',
              borderWidth: '1px',
              transition: 'all 0.2s',
            },
            '&:hover': {
              backgroundColor: '#FFFFFF',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#818CF8',
                borderWidth: '1px',
              },
            },
            '&.Mui-focused': {
              backgroundColor: '#FFFFFF',
              boxShadow: '0 0 0 4px rgba(99, 102, 241, 0.1)',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: '#6366F1',
                borderWidth: '1.5px',
              },
            },
            '&.Mui-disabled': {
              backgroundColor: '#F8FAFC',
              cursor: 'default',
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(148, 163, 184, 0.2)',
                borderWidth: '1px',
              },
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
            fontSize: '0.88rem',
            color: '#64748B',
            '&.Mui-focused': { color: '#6366F1' },
            '&.Mui-disabled': { color: '#94A3B8' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            position: 'relative',
            overflow: 'hidden',
            transition: 'background-color 160ms ease, color 160ms ease',
            '&.Mui-selected': {
              backgroundColor: t.brand.indigoBg,
              color: t.brand.indigoDark,
              '& .MuiListItemIcon-root': { color: t.brand.indigoDark },
              '&:hover': { backgroundColor: '#e0e7ff' },
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'background-color 160ms ease, color 160ms ease, transform 120ms ease',
            '&:active': { transform: 'scale(0.92)' },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.875rem',
            minHeight: 40,
            transition: 'color 160ms ease, background-color 160ms ease',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: '#1E293B',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: 6,
            padding: '6px 10px',
          },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 16, minWidth: 480 } },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            padding: '16px 24px 24px 24px',
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            paddingTop: '24px !important',
          },
        },
      },
    },
  });
}

const metabaseTheme = buildMetabaseTheme('light');
export default metabaseTheme;
