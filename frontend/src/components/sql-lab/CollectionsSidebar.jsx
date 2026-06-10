import React, { useMemo, useState } from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemText, Collapse,
  Tooltip, InputBase, IconButton,
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SearchIcon from '@mui/icons-material/Search';

const TYPE_COLOR = {
  number: '#2563eb',
  date: '#7c3aed',
  boolean: '#0891b2',
  string: '#64748b',
};

/**
 * Snowflake-style object explorer. Lists every queryable collection; expand a
 * collection to see its fields. Double-clicking a collection inserts a starter
 * SELECT into the active worksheet.
 */
function CollectionsSidebar({ collections, loading, onInsertSelect, onInsertText, showHeader = true }) {
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('');

  const toggle = (name) => setExpanded((e) => ({ ...e, [name]: !e[name] }));

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, filter]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fafbfc' }}>
      {showHeader && (
        <Box sx={{ px: 1.5, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <StorageIcon sx={{ fontSize: 18, color: '#4f46e5' }} />
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', color: '#475569', textTransform: 'uppercase' }}>
            Collections
          </Typography>
        </Box>
      )}

      <Box sx={{ px: 1.5, pt: showHeader ? 0 : 1.5, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 2, px: 1 }}>
          <SearchIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
          <InputBase
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{ fontSize: '0.8rem', flex: 1, py: 0.5 }}
          />
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {loading && (
          <Typography sx={{ px: 2, py: 2, fontSize: '0.8rem', color: '#94a3b8' }}>Loading…</Typography>
        )}
        {!loading && filtered.length === 0 && (
          <Typography sx={{ px: 2, py: 2, fontSize: '0.8rem', color: '#94a3b8' }}>No collections</Typography>
        )}
        <List dense disablePadding>
          {filtered.map((coll) => (
            <React.Fragment key={coll.name}>
              <ListItemButton
                onClick={() => toggle(coll.name)}
                onDoubleClick={() => onInsertSelect(coll)}
                sx={{ py: 0.4, px: 1.5, '&:hover': { bgcolor: '#eef2ff' } }}
              >
                {expanded[coll.name]
                  ? <ExpandMoreIcon sx={{ fontSize: 16, color: '#94a3b8', mr: 0.5 }} />
                  : <ChevronRightIcon sx={{ fontSize: 16, color: '#94a3b8', mr: 0.5 }} />}
                <TableChartOutlinedIcon sx={{ fontSize: 15, color: '#6366f1', mr: 0.75 }} />
                <Tooltip title="Double-click to insert a SELECT" placement="right" enterDelay={600}>
                  <ListItemText
                    primary={coll.name}
                    primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', noWrap: true }}
                  />
                </Tooltip>
                <Typography sx={{ fontSize: '0.65rem', color: '#cbd5e1' }}>{coll.fields?.length || 0}</Typography>
              </ListItemButton>

              <Collapse in={!!expanded[coll.name]} unmountOnExit>
                <List dense disablePadding>
                  {(coll.fields || []).map((f) => (
                    <ListItemButton
                      key={f.name}
                      onClick={() => onInsertText(f.name)}
                      sx={{ py: 0.2, pl: 5, pr: 1.5, '&:hover': { bgcolor: '#f1f5f9' } }}
                    >
                      <ListItemText
                        primary={f.name}
                        primaryTypographyProps={{ fontSize: '0.75rem', color: '#475569', noWrap: true }}
                      />
                      <Typography sx={{ fontSize: '0.62rem', color: TYPE_COLOR[f.type] || '#94a3b8', ml: 1 }}>
                        {f.type}
                      </Typography>
                    </ListItemButton>
                  ))}
                  {(coll.fields || []).length === 0 && (
                    <Typography sx={{ pl: 5, py: 0.5, fontSize: '0.72rem', color: '#cbd5e1' }}>No fields</Typography>
                  )}
                </List>
              </Collapse>
            </React.Fragment>
          ))}
        </List>
      </Box>
    </Box>
  );
}

export default React.memo(CollectionsSidebar);
