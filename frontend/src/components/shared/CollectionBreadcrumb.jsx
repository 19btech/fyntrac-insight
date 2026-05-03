import React from 'react';
import { Breadcrumbs, Link, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

export default function CollectionBreadcrumb({ crumbs = [] }) {
  const navigate = useNavigate();

  return (
    <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ fontSize: '0.8125rem' }}>
      <Link
        underline="hover"
        color="primary"
        sx={{ cursor: 'pointer', fontSize: 'inherit' }}
        onClick={() => navigate('/dashboards')})
      >
        Collections
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return isLast ? (
          <Typography key={crumb.id} color="text.primary" sx={{ fontSize: 'inherit', fontWeight: 700 }}>
            {crumb.name}
          </Typography>
        ) : (
          <Link
            key={crumb.id}
            underline="hover"
            color="primary"
            sx={{ cursor: 'pointer', fontSize: 'inherit' }}
            onClick={() => navigate(`/collection/${crumb.id}`)}
          >
            {crumb.name}
          </Link>
        );
      })}
    </Breadcrumbs>
  );
}
