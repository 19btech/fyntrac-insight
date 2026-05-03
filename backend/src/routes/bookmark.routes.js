const router = require('express').Router();
const Bookmark = require('../models/Bookmark.model');

// GET /api/bookmarks  — current user's bookmarks
router.get('/', async (req, res) => {
  const items = await Bookmark.find({
    tenantId: req.user.tenantId,
    userId: req.user.userId,
  }).sort({ createdAt: -1 });
  res.json(items);
});

// POST /api/bookmarks  { itemType, itemId, name }
router.post('/', async (req, res) => {
  const { itemType, itemId, name } = req.body;
  if (!itemType || !itemId) return res.status(400).json({ error: 'itemType and itemId are required' });
  try {
    const bookmark = await Bookmark.findOneAndUpdate(
      { tenantId: req.user.tenantId, userId: req.user.userId, itemType, itemId },
      { $setOnInsert: { name } },
      { upsert: true, new: true }
    );
    res.status(201).json(bookmark);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/bookmarks/:itemType/:itemId
router.delete('/:itemType/:itemId', async (req, res) => {
  await Bookmark.deleteOne({
    tenantId: req.user.tenantId,
    userId: req.user.userId,
    itemType: req.params.itemType,
    itemId: req.params.itemId,
  });
  res.json({ deleted: true });
});

module.exports = router;
