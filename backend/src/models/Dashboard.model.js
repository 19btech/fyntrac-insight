const mongoose = require('mongoose');
const { registerSchema } = require('../services/tenant-db.service');

const cardSchema = new mongoose.Schema(
  {
    i: { type: String, required: true }, // react-grid-layout key
    title: String, // optional display name override for this card
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    metricId: { type: mongoose.Schema.Types.ObjectId, ref: 'Metric' },
    type: { type: String, enum: ['question', 'metric', 'text', 'heading', 'markdown', 'link'], default: 'question' },
    text: String, // for text/heading/markdown/link cards
    linkUrl: String, // for link cards
    chartConfigOverride: mongoose.Schema.Types.Mixed,
    clickBehavior: mongoose.Schema.Types.Mixed, // v60 drill-through { type: 'crossfilter'|'url'|'dashboard'|'question', ... }
    // react-grid-layout position (stored alongside layout array)
    x: Number,
    y: Number,
    w: Number,
    h: Number,
  },
  { _id: false }
);

const filterSchema = new mongoose.Schema(
  {
    id: String,
    field: String,
    label: String,
    type: { type: String, enum: ['text', 'number', 'date', 'select'], default: 'text' },
    defaultValue: mongoose.Schema.Types.Mixed,
    // which card i's this filter applies to
    targets: [String],
  },
  { _id: false }
);

const tabSchema = new mongoose.Schema(
  { id: String, label: String, cards: [cardSchema], layout: mongoose.Schema.Types.Mixed },
  { _id: false }
);

const dashboardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    tenantId: { type: String, required: true, index: true },
    layout: mongoose.Schema.Types.Mixed, // react-grid-layout layout array
    cards: [cardSchema],
    filters: [filterSchema],
    tabs: [tabSchema],
    autoRefreshSeconds: { type: Number, default: 0 },
    createdBy: String,
    pinned: { type: Boolean, default: false },
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Collection' },
    versions: { type: [mongoose.Schema.Types.Mixed], default: [] }, // last 15 snapshots
    archived: { type: Boolean, default: false, index: true },
    archivedAt: Date,
    autoApplyFilters: { type: Boolean, default: true }, // v60
    sections: { type: [mongoose.Schema.Types.Mixed], default: [] }, // sections layout mode
    layoutMode: { type: String, enum: ['grid', 'sections'], default: 'grid' },
    intent: String, // intent template used at creation
    draftedByAI: { type: Boolean, default: false },
    draft: { type: Boolean, default: false, index: true }, // true = created but never explicitly saved
  },
  { timestamps: true }
);

// Register schema for per-tenant connection model compilation
registerSchema('Dashboard', dashboardSchema);

// Global model (dev/SKIP_AUTH fallback — real traffic uses tenant-db.service getModel)
module.exports = mongoose.model('Dashboard', dashboardSchema);
module.exports.schema = dashboardSchema;
