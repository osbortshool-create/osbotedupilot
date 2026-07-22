const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  motto: String,
  address: String,
  phone: String,
  email: String,
  logo: { type: String, default: '/images/default-logo.png' },
  mission: String,
  vision: String,
  about: String,
  gallery: [String],
  campus: { type: String, default: 'Lagos' }
}, { timestamps: true });

module.exports = mongoose.model('School', schoolSchema);
