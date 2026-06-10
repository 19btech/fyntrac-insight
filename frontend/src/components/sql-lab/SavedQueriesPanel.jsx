import React from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemText, IconButton, Tooltip,
} from '@mui/material';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

/**
 * Left-rail panel listing the user's saved queries. Click to open a query in a
 * worksheet tab; trash to delete.
 */
export default function SavedQueriesPanel({ queries, loading, onOpen, onDelete }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: '#fafbfc' }}>
      {loading && <Typography sx={{ px: 2, py: 2, fontSize: '0.8rem', color: '#94a3b8' }}>Loading…</Typography>}

      {!loading && queries.length === 0 && (
        <Box sx={{ px: 2.5, py: 4, textAlign: 'center', color: '#94a3b8' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 34, mb: 1, opacity: 0.5 }} />
          <Typography sx={{ fontSize: '0.82rem' }}>No saved queries yet.</Typography>
          <Typography sx={{ fontSize: '0.76rem', mt: 0.5 }}>
            Write a query and hit <b>Save</b> to keep it here.
          </Typography>
        </Box>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        <List dense disablePadding>
          {queries.map((q) => (
            <ListItemButton
              key={q._id}
              onClick={() => onOpen(q)}
              sx={{ py: 0.6, px: 1.5, alignItems: 'flex-start', '&:hover': { bgcolor: '#eef2ff' } }}
            >
              <BookmarkBorderIcon sx={{ fontSize: 16, color: '#6366f1', mr: 0.75, mt: 0.3 }} />
              <ListItemText
                primary={q.name}
                secondary={relTime(q.updatedAt)}
                primaryTypographyProps={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', noWrap: true }}
                secondaryTypographyProps={{ fontSize: '0.66rem', color: '#94a3b8' }}
              />
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onDelete(q); }}
                  sx={{ color: '#cbd5e1', '&:hover': { color: '#dc2626' } }}
                >
                  <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </ListItemButton>
          ))}
        </List>
      </Box>
    </Box>
  );
}
