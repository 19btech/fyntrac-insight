import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, Card, CardActionArea, CardContent, Button, Chip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DashboardIcon from '@mui/icons-material/Dashboard';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import api from '../hooks/useQuery';

export default function CollectionPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState({ dashboards: [], questions: [] });

  useEffect(() => {
    Promise.all([
      api.get(`/collections/${id}`).then((r) => r.data),
      api.get('/dashboards').then((r) => r.data.filter((d) => String(d.collectionId) === id)),
      api.get('/questions').then((r) => r.data.filter((q) => String(q.collectionId) === id)),
    ]).then(([col, dashboards, questions]) => {
      setCollection(col);
      setItems({ dashboards, questions });
    });
  }, [id]);

  if (!collection) return null;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h2">{collection.name}</Typography>
        <Button startIcon={<AddIcon />} variant="outlined" size="small" onClick={() => navigate('/question/new')}>
          Add question
        </Button>
      </Box>

      {collection.description && (
        <Typography variant="body2" color="text.secondary" mb={2}>{collection.description}</Typography>
      )}

      <Typography variant="h3" mb={1.5}>Dashboards ({items.dashboards.length})</Typography>
      <Grid container spacing={2} mb={3}>
        {items.dashboards.map((d) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={d._id}>
            <Card>
              <CardActionArea onClick={() => navigate(`/dashboard/${d._id}`)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DashboardIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                    <Typography variant="body1" fontWeight={700} noWrap>{d.name}</Typography>
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Typography variant="h3" mb={1.5}>Reports ({items.questions.length})</Typography>
      <Grid container spacing={2}>
        {items.questions.map((q) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={q._id}>
            <Card>
              <CardActionArea onClick={() => navigate(`/question/${q._id}`)}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <QuestionAnswerIcon sx={{ color: 'primary.main', fontSize: 18 }} />
                    <Typography variant="body1" fontWeight={700} noWrap>{q.name}</Typography>
                  </Box>
                  <Chip
                    label={q.type}
                    size="small"
                    sx={{ mt: 1, height: 20, fontSize: '0.7rem', bgcolor: '#f0f0f0' }}
                  />
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
