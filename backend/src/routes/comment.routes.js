const router = require('express').Router();
const Comment = require('../models/Comment.model');

// GET /api/comments/:itemType/:itemId
router.get('/:itemType/:itemId', async (req, res) => {
  const items = await req.model('Comment').find({
    tenantId: req.user.tenantId,
    itemType: req.params.itemType,
    itemId: req.params.itemId,
  }).sort({ createdAt: 1 });
  res.json(items);
});

// POST /api/comments/:itemType/:itemId  { body, mentions[] }
router.post('/:itemType/:itemId', async (req, res) => {
  const { body, mentions } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'body required' });
  const comment = await req.model('Comment').create({
    tenantId: req.user.tenantId,
    itemType: req.params.itemType,
    itemId: req.params.itemId,
    body,
    authorId: req.user.userId,
    authorName: req.user.name || req.user.userId,
    mentions: Array.isArray(mentions) ? mentions : [],
  });
  res.status(201).json(comment);
});

// PATCH /api/comments/:id  { body?, resolved? }
router.patch('/:id', async (req, res) => {
  const c = await req.model('Comment').findOne({ _id: req.params.id, tenantId: req.user.tenantId });
  if (!c) return res.status(404).json({ error: 'Not found' });
  if (req.body.body !== undefined) c.body = req.body.body;
  if (req.body.resolved !== undefined) c.resolved = !!req.body.resolved;
  await c.save();
  res.json(c);
});

// DELETE /api/comments/:id
router.delete('/:id', async (req, res) => {
  const r = await req.model('Comment').deleteOne({ _id: req.params.id, tenantId: req.user.tenantId, authorId: req.user.userId });
  if (!r.deletedCount) return res.status(404).json({ error: 'Not found or not owner' });
  res.json({ deleted: true });
});

module.exports = router;
