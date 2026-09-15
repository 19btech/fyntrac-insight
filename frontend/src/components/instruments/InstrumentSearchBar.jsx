import React, { useEffect, useRef, useState } from 'react';
import {
  Box, Paper, Stack, TextField, Button, Autocomplete, Typography, MenuItem,
  InputAdornment, Chip, CircularProgress,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonthOutlined';
import HistoryIcon from '@mui/icons-material/HistoryOutlined';
import api from '../../hooks/useQuery';

const RECENTS_KEY = 'fyntrac_instrument_recents';
const MAX_RECENTS = 6;

export function loadRecents() {
  // Browser storage is a convenience only — a locked-down browser throws here
  // rather than returning empty, so never let it take the page down.
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export function pushRecent(value) {
  try {
    const next = [value, ...loadRecents().filter((v) => v !== value)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return loadRecents();
  }
}

/**
 * The browser's search header.
 *
 * A source is filtered by EITHER a posting date OR an accounting period, so
 * the period control is one choice, not two filters. Both produce the same
 * "YYYY-MM-DD" value and each source applies it the way it was configured: a
 * posting-date source matches that calendar day, an accounting-period source
 * matches the month it falls in.
 *
 * Leaving it blank is a real choice — every period — so the control says so
 * rather than sitting empty.
 */
export default function InstrumentSearchBar({
  instrumentId, period, periodMode, onChange, onSearch, searching,
  suggestSourceId, periods, loadingPeriods, disabled, activeSourceLabel,
}) {
  const [options, setOptions] = useState([]);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const [recents, setRecents] = useState(loadRecents);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  // Type-ahead. Only fires with 2+ characters so an empty box never triggers a
  // scan of the whole source.
  useEffect(() => {
    if (!suggestSourceId || !instrumentId || instrumentId.trim().length < 2) {
      // Bumping the id orphans any request still in flight so its late reply
      // cannot re-raise the spinner, and the spinner is cleared here — without
      // this, clearing the box mid-request left it turning forever.
      reqIdRef.current += 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setOptions([]);
      setLoadingOpts(false);
      return undefined;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      const reqId = ++reqIdRef.current;
      setLoadingOpts(true);
      try {
        const { data } = await api.post('/instruments/suggest', {
          sourceId: suggestSourceId,
          prefix: instrumentId.trim(),
        });
        // A slower earlier request must not overwrite a newer result.
        if (reqId !== reqIdRef.current) return;
        setOptions(Array.isArray(data) ? data : []);
      } catch {
        if (reqId === reqIdRef.current) setOptions([]);
      } finally {
        if (reqId === reqIdRef.current) setLoadingOpts(false);
      }
    }, 350);

    // Tearing down (unmount, or the input changing again) abandons both the
    // pending debounce and any in-flight reply, so the spinner must not be left
    // behind with nothing coming to clear it.
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoadingOpts(false);
    };
  }, [instrumentId, suggestSourceId]);

  const canSearch = !!instrumentId && instrumentId.trim() !== '' && !disabled;

  const submit = () => {
    if (!canSearch) return;
    setRecents(pushRecent(instrumentId.trim()));
    onSearch();
  };

  const isPeriodMode = periodMode === 'accountingPeriod';
  // Some sources have no time dimension at all (current open records, one row
  // per product). For those the period control is meaningless, so it is shown
  // disabled rather than offering a filter that would do nothing.
  const noPeriod = periodMode === 'none';
  // Which dimension applies is decided per source when it is configured, not
  // here — so the other one is shown but disabled, rather than hidden, to make
  // the selected source's mapping visible.
  const modeHint = activeSourceLabel
    ? `${activeSourceLabel} is filtered by ${noPeriod
      ? 'instrument only — it has no period dimension'
      : isPeriodMode ? 'accounting period' : 'posting date'}`
    : '';

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: '16px',
        border: '1px solid',
        borderColor: 'divider',
        background: 'linear-gradient(135deg, rgba(30,64,175,0.05) 0%, rgba(99,102,241,0.04) 100%)',
      }}
    >
      {/* Which dimension the period control filters by — set per source when it
          was configured, so the other option is shown disabled rather than hidden. */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.75, flexWrap: 'wrap', rowGap: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={periodMode}
          disabled={disabled}
          sx={{
            bgcolor: '#fff',
            borderRadius: '10px',
            '& .MuiToggleButton-root': {
              borderRadius: '10px',
              px: 1.75,
              py: 0.5,
              fontWeight: 600,
              fontSize: '0.75rem',
              textTransform: 'none',
              border: '1px solid',
              borderColor: 'divider',
              '&.Mui-selected': { bgcolor: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe' },
            },
          }}
        >
          <ToggleButton value="postingDate" disabled={isPeriodMode || noPeriod}>
            <EventOutlinedIcon sx={{ fontSize: 15, mr: 0.75 }} />
            Posting date
          </ToggleButton>
          <ToggleButton value="accountingPeriod" disabled={!isPeriodMode || noPeriod}>
            <CalendarMonthIcon sx={{ fontSize: 15, mr: 0.75 }} />
            Accounting period
          </ToggleButton>
        </ToggleButtonGroup>

        {modeHint && (
          <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
            {modeHint}
          </Typography>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'flex-start' }}>
        <Autocomplete
          freeSolo
          fullWidth
          options={options}
          filterOptions={(x) => x} // server-side filtering; never re-filter locally
          inputValue={instrumentId}
          onInputChange={(_e, v) => onChange({ instrumentId: v })}
          onChange={(_e, v) => v && onChange({ instrumentId: String(v) })}
          disabled={disabled}
          sx={{ flex: 2, minWidth: 0 }}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              placeholder="Search an instrument ID…"
              label="Instrument ID"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
              }}
              InputProps={{
                ...params.InputProps,
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <>
                    {loadingOpts ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
                sx: { bgcolor: '#fff', borderRadius: '12px' },
              }}
            />
          )}
        />

        {/* One control for both modes: the values are the same execution dates
            from ExecutionState either way — an accounting-period source matches
            the month it falls in, a posting-date source matches the day. Blank
            is a real choice (every period), so it renders as such instead of
            showing an empty box. */}
        <TextField
          select
          label={noPeriod ? 'Period' : isPeriodMode ? 'Accounting period' : 'Posting date'}
          value={noPeriod ? '' : (period || '')}
          onChange={(e) => onChange({ period: e.target.value })}
          disabled={disabled || loadingPeriods || noPeriod}
          InputLabelProps={{ shrink: true }}
          sx={{ flex: 1, minWidth: { md: 260 } }}
          helperText={
            noPeriod ? 'This source is not filtered by period'
              : (!loadingPeriods && periods.length === 0)
                ? 'No execution dates found in ExecutionState'
                : ' '
          }
          SelectProps={{
            displayEmpty: true,
            renderValue: (v) => {
              if (noPeriod) return 'Not period-based';
              if (!v) return isPeriodMode ? 'All periods' : 'All posting dates';
              const hit = periods.find((x) => x.value === v);
              return isPeriodMode && hit ? hit.label : v;
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                {isPeriodMode
                  ? <CalendarMonthIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                  : <EventOutlinedIcon sx={{ color: 'text.secondary', fontSize: 20 }} />}
              </InputAdornment>
            ),
            sx: { bgcolor: '#fff', borderRadius: '12px' },
          }}
        >
          <MenuItem value="">
            <em>{isPeriodMode ? 'All periods' : 'All posting dates'}</em>
          </MenuItem>
          {periods.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {isPeriodMode ? p.label : p.value}
              <Box component="span" sx={{ color: 'text.secondary', ml: 1, fontSize: '0.75rem' }}>
                {isPeriodMode ? p.periodId : p.label}
              </Box>
            </MenuItem>
          ))}
        </TextField>

        <Button
          variant="contained"
          onClick={submit}
          disabled={!canSearch || searching}
          startIcon={searching ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
          sx={{
            borderRadius: '10px',
            px: 3,
            // Deliberately shorter than the 56px inputs it sits beside — matching
            // their full height turned a single action into a slab. The top
            // offset optically centres it against the input box.
            height: 42,
            mt: { md: '7px' },
            whiteSpace: 'nowrap',
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
          }}
        >
          {searching ? 'Searching' : 'Search'}
        </Button>
      </Stack>

      {recents.length > 0 && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 1 }}>
          <HistoryIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
          <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', mr: 0.5 }}>
            Recent
          </Typography>
          {recents.map((r) => (
            <Chip
              key={r}
              label={r}
              size="small"
              onClick={() => { onChange({ instrumentId: r }); onSearch(r); }}
              sx={{
                height: 24, borderRadius: '8px', fontSize: '0.72rem', fontWeight: 600,
                bgcolor: '#fff', border: '1px solid', borderColor: 'divider', color: 'text.secondary',
                '&:hover': { bgcolor: '#eef2ff', borderColor: '#c7d2fe', color: '#4338ca' },
              }}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
