const mongoose = require('mongoose');

/**
 * Per-user AI provider configuration.
 * Stores encrypted API keys for OpenAI / Anthropic / Google Gemini.
 * Encryption is handled in services/ai-credentials.service.js
 * (AES-256-GCM with key from process.env.AI_KEYS_SECRET).
 */
const AISettingsSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    activeProvider: {
      type: String,
      enum: ['anthropic', 'openai', 'gemini'],
      default: 'anthropic',
    },
    activeModel: { type: String, default: '' },
    providers: {
      anthropic: {
        encryptedKey: { type: String, default: '' },
        keyHint: { type: String, default: '' }, // last 4 chars for UI display
        model: { type: String, default: 'claude-sonnet-4-20250514' },
        verifiedAt: { type: Date, default: null },
      },
      openai: {
        encryptedKey: { type: String, default: '' },
        keyHint: { type: String, default: '' },
        model: { type: String, default: 'gpt-4o-mini' },
        verifiedAt: { type: Date, default: null },
      },
      gemini: {
        encryptedKey: { type: String, default: '' },
        keyHint: { type: String, default: '' },
        model: { type: String, default: 'gemini-2.0-flash' },
        verifiedAt: { type: Date, default: null },
      },
    },
    // Conservative mode: AI only queries collections that are referenced by
    // an existing Dataset or KPI. Refuses ad-hoc raw collection queries.
    conservativeMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AISettingsSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('AISettings', AISettingsSchema);
