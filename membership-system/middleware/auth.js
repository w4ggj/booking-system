const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret';

function generateAdminToken() {
  return jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '8h' });
}

function verifyAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.role !== 'admin') throw new Error();
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

function generateMagicToken(email, customerId, memberId) {
  return jwt.sign({ email, customerId, memberId, purpose: 'member-portal' }, SECRET, { expiresIn: '7d' });
}

function verifyMember(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, SECRET);
    if (payload.purpose !== 'member-portal') throw new Error();
    req.member = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

module.exports = { generateAdminToken, verifyAdmin, generateMagicToken, verifyMember };
