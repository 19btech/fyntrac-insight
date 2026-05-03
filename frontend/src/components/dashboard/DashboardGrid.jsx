import React, { useEffect, useRef, useState } from 'react';
import GridLayout from 'react-grid-layout';
import { Box } from '@mui/material';
import DashboardCard from './DashboardCard';

export default function DashboardGrid({ layout = [], cards = [], editMode, dashboardId, onDeleteCard, onLayoutChange, refreshKey }) {
  const cols = 12;
  const rowHeight = 60;

  // Track the rendered container width so the grid reflows on window resize
  // and sidebar collapse. ResizeObserver gives us the true inner width
  // instead of guessing from `window.innerWidth - 320`.
  const containerRef = useRef(null);
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth - 320 : 1200);
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w > 1) setWidth((prev) => (Math.abs(w - prev) > 1 ? Math.floor(w) : prev));
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gridLayout = layout.length > 0
    ? layout
    : cards.map((card, i) => ({
        i: card.i || String(i),
        x: (i * 4) % cols,
        y: Math.floor(i / 3) * 4,
        w: 4,
        h: 4,
      }));

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'relative',
        minHeight: editMode ? 320 : undefined,
        borderRadius: editMode ? 2 : undefined,
        ...(editMode ? {
          backgroundImage: 'radial-gradient(circle, #94a3b8 1.5px, transparent 1.5px)',
          backgroundSize: '28px 28px',
          backgroundPosition: '14px 14px',
          outline: '2px dashed #e2e8f0',
        } : {}),
      }}
    >
      <GridLayout
        layout={gridLayout}
        cols={cols}
        rowHeight={rowHeight}
        width={width}
        isDraggable={editMode}
        isResizable={editMode}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        compactType="vertical"
        draggableCancel=".no-drag, button, .MuiIconButton-root, .MuiMenu-root, .MuiPopover-root, .MuiBackdrop-root"
        onDragStop={(newLayout) => { if (onLayoutChange) onLayoutChange(newLayout); }}
        onResizeStop={(newLayout) => { if (onLayoutChange) onLayoutChange(newLayout); }}
      >
        {cards.map((card) => (
          <Box
            key={card.i}
            sx={{
              '&:hover .card-actions': editMode ? { opacity: 1 } : {},
            }}
          >
            <DashboardCard
              card={card}
              editMode={editMode}
              onDelete={onDeleteCard}
              refreshKey={refreshKey}
            />
          </Box>
        ))}
      </GridLayout>
    </Box>
  );
}
