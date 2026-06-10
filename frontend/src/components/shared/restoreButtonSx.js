/**
 * Canonical "Restore" button styling — the blue-tinted outlined look from the
 * Dataset modal's version history. Use on every Restore button (with a
 * <RestoreIcon fontSize="small" /> startIcon and `size="small"`) so they all
 * match across modals and dialogs.
 */
const restoreButtonSx = {
  borderRadius: 2,
  fontWeight: 600,
  textTransform: 'none',
  minWidth: 90,
  color: '#1e40af',
  bgcolor: '#eff6ff',
  border: '1px solid #bfdbfe',
  '&:hover': { bgcolor: '#dbeafe', borderColor: '#93c5fd' },
};

export default restoreButtonSx;
