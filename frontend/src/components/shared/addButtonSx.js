/**
 * Style for the circular "create" (+) icon button in page headers
 * (Dashboards, Reports, Datasets, Recons, KPIs).
 *
 * Rest: white circle, action-grey icon (rgba(0,0,0,0.54)), soft shadow.
 * Hover: lifts (scale 1.08), elevates (boxShadow 3), grey.50 background.
 * Active: presses in (scale 0.94).
 * One transition covers background, shadow and transform together.
 */
const ADD_BUTTON_SX = {
  bgcolor: '#fff',
  color: 'rgba(0, 0, 0, 0.54)',
  borderRadius: '50%',
  boxShadow: 1,
  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  '&:hover': {
    bgcolor: 'grey.50',
    boxShadow: 3,
    transform: 'scale(1.08)',
  },
  '&:active': {
    transform: 'scale(0.94)',
  },
};

export default ADD_BUTTON_SX;
