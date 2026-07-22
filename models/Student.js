const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const archivedSessionSchema = new mongoose.Schema({
  sessionName: String,
  className: String,
  promoted: { type: Boolean, default: false },
  promotionDate: Date
}, { _id: false });

const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  studentID: { type: String, default: null },
  password: { type: String, required: true },
  gender: String,
  dateOfBirth: Date,
  parentPhone: { type: String, default: null },
  parentEmail: { type: String, default: null },
  address: String,
  currentClass: String,
  section: String,
  currentSession: String,
  passportURL: { type: String, default: '/images/default-avatar.png' },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  admissionDate: { type: Date, default: Date.now },
  archivedSessions: [archivedSessionSchema],
  campus: { type: String, default: 'Lagos' }
}, { timestamps: true });

studentSchema.index({ studentID: 1, campus: 1 }, { unique: true, sparse: true });

studentSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

studentSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Student', studentSchema);
