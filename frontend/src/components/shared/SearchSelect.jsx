import React, { useState, useMemo } from 'react';
import {
  Box, TextField, Popover, List, ListItemButton,
  Typography, InputAdornment, IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HighlightOffOutlinedIcon from '@mui/icons-material/HighlightOffOutlined';

/**
 * Searchable select field.
 *
 * Props:
 *   value        — currently selected value (string/number or null)
 *   onChange     — called with the selected value (or null on clear)
 *   options      — [{ value, label, symbol?, description? }]
 *   placeholder  — trigger field placeholder
 *   label        — optional floating label on the trigger
 *   width        — trigger field width (default 220)
 */
export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  label,
  width = 220,
  disabled = false,
  fullWidth = false,
  // When provided, typing in the search box calls this (e.g. to fetch options
  // from the backend) and client-side filtering is skipped.
  onSearch,
  // When true, the typed text can be committed as a custom value not in options.
  allowCustom = false,
}) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [search, setSearch] = useState('');
  const open = Boolean(anchorEl);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (onSearch) return options; // server-side search — show options as-is
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      o.label?.toLowerCase().includes(q) ||
      o.symbol?.toLowerCase().includes(q) ||
      o.description?.toLowerCase().includes(q)
    );
  }, [options, search, onSearch]);

  // Offer the typed text as a custom option when it isn't already in the list.
  const displayOptions = useMemo(() => {
    const q = search.trim();
    if (allowCustom && q && !filtered.some((o) => String(o.value) === q)) {
      return [{ value: q, label: `Use “${q}”`, description: 'custom value' }, ...filtered];
    }
    return filtered;
  }, [filtered, allowCustom, search]);

  // Match the dropdown width to the trigger so a full-width field doesn't get a
  // cramped 280px popover; never go narrower than the previous fixed width.
  const popoverWidth = Math.max(anchorEl?.offsetWidth || 0, 280);
  const handleOpen = (e) => { if (disabled) return; setAnchorEl(e.currentTarget); setSearch(''); onSearch?.(''); };
  const handleClose = () => { setAnchorEl(null); setSearch(''); };
  const handleSelect = (val) => { onChange?.(val); handleClose(); };
  const handleClear = (e) => { e.stopPropagation(); if (disabled) return; onChange?.(null); };
  const handleSearchChange = (e) => { setSearch(e.target.value); onSearch?.(e.target.value); };

  const TRIGGER_SX = {
    width: fullWidth ? '100%' : width,
    '& .MuiOutlinedInput-root': {
      borderRadius: '16px',
      cursor: 'pointer',
      '& input': { cursor: 'pointer' },
    },
  };

  return (
    <Box>
      <TextField
        size="small"
        label={label}
        value={selected?.label ?? (value != null && value !== '' ? String(value) : '')}
        placeholder={placeholder}
        onClick={handleOpen}
        disabled={disabled}
        sx={TRIGGER_SX}
        slotProps={{
          input: {
            readOnly: true,
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: '#94A3B8' }} />
              </InputAdornment>
            ),
            endAdornment: !disabled && value != null && value !== '' ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={handleClear}
                  sx={{
                    p: 0.25,
                    color: '#94A3B8',
                    '&:hover': { color: 'error.main', bgcolor: 'transparent' },
                  }}
                >
                  <HighlightOffOutlinedIcon sx={{ fontSize: '0.95rem' }} />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mt: 0.75 }}
        slotProps={{
          paper: {
            sx: {
              width: popoverWidth,
              borderRadius: 3,
              border: '1px solid rgba(148, 163, 184, 0.12)',
              boxShadow: '0 8px 32px rgba(15, 23, 42, 0.16)',
              overflow: 'hidden',
            },
          },
        }}
      >
        {/* Inner search field */}
        <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(148,163,184,0.07)' }}>
          <TextField
            size="small"
            autoFocus
            fullWidth
            value={search}
            onChange={handleSearchChange}
            placeholder="Search..."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '16px' } }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: '#94A3B8' }} />
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {/* Results list */}
        <List dense disablePadding sx={{ maxHeight: 280, overflow: 'auto', py: 0.5 }}>
          {displayOptions.length === 0 ? (
            <Box sx={{ py: 2.5, textAlign: 'center' }}>
              <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                No results found.
              </Typography>
            </Box>
          ) : (
            displayOptions.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <ListItemButton
                  key={opt.value}
                  selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  sx={{
                    py: 0.75,
                    px: 2,
                    '&:hover': { bgcolor: 'rgba(99,102,241,0.06)' },
                    '&.Mui-selected': { bgcolor: 'rgba(99,102,241,0.10)' },
                    '&.Mui-selected:hover': { bgcolor: 'rgba(99,102,241,0.14)' },
                  }}
                >
                  <Box sx={{ width: '100%', minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        noWrap
                        sx={{
                          fontSize: '0.85rem',
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? '#6366F1' : '#1E293B',
                        }}
                      >
                        {opt.label}
                      </Typography>
                      {opt.symbol && (
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B', flexShrink: 0 }}>
                          {opt.symbol}
                        </Typography>
                      )}
                    </Box>
                    {opt.description && (
                      <Typography sx={{ fontSize: '0.72rem', color: '#64748B', lineHeight: 1.2 }}>
                        {opt.description}
                      </Typography>
                    )}
                  </Box>
                </ListItemButton>
              );
            })
          )}
        </List>
      </Popover>
    </Box>
  );
}
