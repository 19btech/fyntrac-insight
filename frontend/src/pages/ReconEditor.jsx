import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

/**
 * ReconEditor — now a thin redirect shim.
 * The reconciliation UI lives in <ReconPreviewDialog> (opened from AppShell).
 * This component handles legacy deep-links like /recon/new and /recon/:id
 * by redirecting to /recons and opening the modal.
 */
export default function ReconEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  useEffect(() => {
    navigate('/recons', { replace: true });
    window.dispatchEvent(new CustomEvent('fyntrac:open:recon', {
      detail: isNew ? { isNew: true } : { id },
    }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
