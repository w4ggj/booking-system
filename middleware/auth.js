const jwt = require('jsonwebtoken');

function getSecret() {
  return (process.env.ADMIN_PASSWORD || 'fallback') + '_jwt_balance_gaming_2024';
}

function generateToken() {
  return jwt.sign({ admin: true }, getSecret(), { expiresIn: '24h' });
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    jwt.verify(auth.slice(7), getSecret());
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { generateToken, verifyToken };
