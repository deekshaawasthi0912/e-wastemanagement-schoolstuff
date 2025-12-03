import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Middleware to verify token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const secret = process.env.JWT_SECRET || 'devsecret';
    const decoded = jwt.verify(token, secret);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
  console.log('📝 Register request received:', { body: req.body });
  
  try {
    const { fullName, email, password } = req.body || {};
    
    console.log('🔍 Validating inputs:', { fullName: !!fullName, email: !!email, password: !!password });
    if (!fullName || !email || !password) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.log('❌ Invalid email format');
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    console.log('🔎 Checking if email already exists:', email);
    const exists = await User.findOne({ email });
    if (exists) {
      console.log('❌ Email already registered');
      return res.status(409).json({ message: 'Email already registered' });
    }

    console.log('🔐 Hashing password...');
    const hashed = await bcrypt.hash(password, 12);
    
    console.log('💾 Creating user in database...');
    const userData = {
      fullName,
      email,
      password: hashed
    };
    
    const user = await User.create(userData);
    console.log('✅ User created successfully:', user._id);

    // return created user (no password)
    return res.status(201).json({ user: { id: user._id, fullName: user.fullName, email: user.email } });
  } catch (err) {
    console.error('❌ Register error:', err.message);
    console.error('Error code:', err.code);
    console.error('Error stack:', err.stack);
    
    // Handle specific database errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      console.log(`Duplicate key on field: ${field}`);
      if (field === 'email') {
        return res.status(409).json({ message: 'Email already registered' });
      }
      return res.status(400).json({ message: 'Duplicate entry error' });
    }
    
    return res.status(500).json({ message: 'Server error: ' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: 'Missing email or password' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'Account not found. Please register.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const payload = { userId: user._id, email: user.email };
    const secret = process.env.JWT_SECRET || 'devsecret';
    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    return res.json({ user: { id: user._id, fullName: user.fullName, email: user.email }, token });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/profile - Get user profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user });
  } catch (err) {
    console.error('Profile fetch error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName, phone, address, city, state, zipCode } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { fullName, phone, address, city, state, zipCode, updatedAt: Date.now() },
      { new: true }
    ).select('-password');

    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ user, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Profile update error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/auth/orders - Create new order
router.post('/orders', verifyToken, async (req, res) => {
  try {
    const { wasteType, quantity, address, city, phone, scheduledDate } = req.body;

    if (!wasteType || !quantity || !address || !city || !phone || !scheduledDate) {
      return res.status(400).json({ message: 'Missing required order fields' });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const newOrder = {
      orderId,
      wasteType,
      quantity,
      address,
      city,
      phone,
      scheduledDate: new Date(scheduledDate),
      status: 'pending'
    };

    user.orders.push(newOrder);
    user.updatedAt = Date.now();
    await user.save();

    return res.status(201).json({ order: newOrder, message: 'Order created successfully' });
  } catch (err) {
    console.error('Order creation error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/auth/orders - Get all user orders
router.get('/orders', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.json({ orders: user.orders });
  } catch (err) {
    console.error('Orders fetch error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/auth/orders/:orderId - Cancel order
router.delete('/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const orderIndex = user.orders.findIndex(o => o.orderId === req.params.orderId);
    if (orderIndex === -1) return res.status(404).json({ message: 'Order not found' });

    const deletedOrder = user.orders.splice(orderIndex, 1);
    user.updatedAt = Date.now();
    await user.save();

    return res.json({ message: 'Order cancelled successfully', order: deletedOrder[0] });
  } catch (err) {
    console.error('Order deletion error', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

export default router;
