const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    default: 'Untitled Project'
  },
  originalImage: {
    type: String, // Base64 Data URL or URL
    required: true
  },
  imageData: {
    type: String, // Base64 Data URL of the edited canvas
    required: true
  },
  width: {
    type: Number,
    required: true
  },
  height: {
    type: Number,
    required: true
  },
  totalPixels: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Project', ProjectSchema);
