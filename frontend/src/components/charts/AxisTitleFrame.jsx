import React from 'react';
import { Box, Typography } from '@mui/material';

const X_TITLE_H = 20;

/**
 * Renders axis titles OUTSIDE the chart's SVG so they never overlap the tick
 * labels (x-charts' built-in axis `label` sits among the ticks). The Y title is
 * a rotated column to the left; the X title is centered below. Pass the chart's
 * full height; the inner chart should be sized to `innerHeight`.
 */
export default function AxisTitleFrame({ axisTitles = {}, height, innerHeight, children }) {
  const hasX = !!axisTitles.x;
  const hasY = !!axisTitles.y;
  if (!hasX && !hasY) return children;
  const innerH = innerHeight ?? (height ? height - (hasX ? X_TITLE_H : 0) : undefined);

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex' }}>
        {hasY && (
          <Box sx={{ width: 18, height: innerH, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Typography sx={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
              {axisTitles.y}
            </Typography>
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Box>
      {hasX && (
        <Typography sx={{ textAlign: 'center', fontSize: 11, color: '#64748b', height: X_TITLE_H, lineHeight: `${X_TITLE_H}px`, pl: hasY ? '18px' : 0 }}>
          {axisTitles.x}
        </Typography>
      )}
    </Box>
  );
}
