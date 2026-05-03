/**
 * Ensures tenantId from req.user is available on all downstream handlers.
 * Must be used after authMiddleware.
 */
function tenantMiddleware(req, res, next) {
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({ error: 'Tenant context not established' });
  }
  req.tenantId = req.user.tenantId;
  next();
}

module.exports = tenantMiddleware;
