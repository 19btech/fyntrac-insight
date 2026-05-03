const router = require('express').Router();
const Collection = require('../models/Collection.model');

// GET /api/collections
router.get('/', async (req, res) => {
  const collections = await Collection.find({ tenantId: req.user.tenantId }).sort({ name: 1 });
  res.json(collections);
});

// POST /api/collections
router.post('/', async (req, res) => {
  const { name, description, parentId, color, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const collection = await Collection.create({
    name,
    description,
    parentId: parentId || null,
    color,
    icon,
    tenantId: req.user.tenantId,
    createdBy: req.user.userId,
  });

  res.status(201).json(collection);
});

// GET /api/collections/:id
router.get('/:id', async (req, res) => {
  const collection = await Collection.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  res.json(collection);
});

// PUT /api/collections/:id
router.put('/:id', async (req, res) => {
  const collection = await Collection.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });

  const { name, description, parentId, color, icon } = req.body;
  Object.assign(collection, {
    name: name ?? collection.name,
    description: description ?? collection.description,
    parentId: parentId ?? collection.parentId,
    color: color ?? collection.color,
    icon: icon ?? collection.icon,
  });

  await collection.save();
  res.json(collection);
});

// DELETE /api/collections/:id
router.delete('/:id', async (req, res) => {
  const collection = await Collection.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });
  if (!collection) return res.status(404).json({ error: 'Collection not found' });
  res.json({ deleted: true });
});

module.exports = router;
