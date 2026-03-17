require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lungCancerDB';
const JWT_SECRET = process.env.JWT_SECRET || 'lung_cancer_jwt_secret_change_in_production';

// ── MIDDLEWARE ──────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MONGODB CONNECTION ──────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected:', MONGO_URI))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });

// ── SCHEMAS & MODELS ────────────────────────────────────────

// User Schema
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    role: {
      type: String,
      enum: ['admin', 'viewer'],
      default: 'viewer',
    },
  },
  { timestamps: true }
);

const User = mongoose.model('User', userSchema);

// Stats Schema
const statsSchema = new mongoose.Schema(
  {
    malignant: { type: Number, default: 0 },
    benign:    { type: Number, default: 0 },
    normal:    { type: Number, default: 0 },
    accuracy:  { type: Number, default: 0 },
  },
  { timestamps: true }
);

const Stats = mongoose.model('Stats', statsSchema);

// ── JWT AUTH MIDDLEWARE ─────────────────────────────────────
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

// ── ROUTES ──────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime().toFixed(1) + 's',
  });
});

// POST /register
app.post('/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    // Check if user already exists
    const existing = await User.findOne({ username: username.trim() });
    if (existing) {
      return res.status(409).json({ message: 'Username already taken.' });
    }

    // Hash password (salt rounds = 10)
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username: username.trim(),
      password: hashedPassword,
      role: role || 'viewer',
    });

    await user.save();

    console.log(`👤 New user registered: ${user.username} (${user.role})`);

    res.status(201).json({
      message: 'User registered successfully.',
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// POST /login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }

    // Find user
    const user = await User.findOne({ username: username.trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // Sign JWT (expires in 24 hours)
    const token = jwt.sign(
      { id: user._id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log(`🔐 Login: ${user.username}`);

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user._id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// GET /stats  — public (or add authMiddleware to protect)
app.get('/stats', async (req, res) => {
  try {
    // Return the most recent stats document
    const stats = await Stats.findOne().sort({ createdAt: -1 });

    if (!stats) {
      // Return default values if no stats exist yet
      return res.json({ malignant: 0, benign: 0, normal: 0, accuracy: 0 });
    }

    res.json(stats);
  } catch (err) {
    console.error('GET /stats error:', err.message);
    res.status(500).json({ message: 'Failed to fetch stats.' });
  }
});

// POST /stats  — protected: requires JWT
app.post('/stats', authMiddleware, async (req, res) => {
  try {
    const { malignant, benign, normal, accuracy } = req.body;

    if (
      malignant === undefined ||
      benign === undefined ||
      normal === undefined ||
      accuracy === undefined
    ) {
      return res.status(400).json({ message: 'All fields required: malignant, benign, normal, accuracy.' });
    }

    const stats = new Stats({ malignant, benign, normal, accuracy });
    await stats.save();

    console.log(`📊 Stats saved by ${req.user.username}:`, { malignant, benign, normal, accuracy });

    res.status(201).json({ message: 'Stats saved.', stats });
  } catch (err) {
    console.error('POST /stats error:', err.message);
    res.status(500).json({ message: 'Failed to save stats.' });
  }
});

// GET /me — protected: returns current user info
app.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// Catch-all: serve dashboard for any unmatched route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── START SERVER ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Server running → http://localhost:${PORT}`);
  console.log(`📁 Serving static files from ./public`);
  console.log(`🔑 JWT secret loaded: ${JWT_SECRET !== 'lung_cancer_jwt_secret_change_in_production' ? 'from .env ✅' : 'using default ⚠️  (set JWT_SECRET in .env)'}\n`);
});
