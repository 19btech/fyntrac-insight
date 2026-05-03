import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DashboardChooser() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/dashboard/new', { replace: true }); }, [navigate]);
  return null;
}

