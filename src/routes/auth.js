const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// Admin bejelentkezés
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Felhasználónév és jelszó szükséges' });

  try {
    const [rows] = await db.query('SELECT * FROM admins WHERE username = ?', [username]);
    if (!rows.length)
      return res.status(401).json({ error: 'Helytelen felhasználónév vagy jelszó' });

    const admin = rows[0];
    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Helytelen felhasználónév vagy jelszó' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '8h' }
    );
    res.json({ token, username: admin.username });
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// Admin regisztráció
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Felhasználónév és jelszó szükséges' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A jelszónak legalább 6 karakter hosszúnak kell lennie' });
  }

  try {
    const [existing] = await db.query(
      'SELECT id FROM admins WHERE username = ?',
      [username]
    );

    if (existing.length) {
      return res.status(409).json({ error: 'Ez a felhasználónév már foglalt' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
      [username, passwordHash]
    );

    const token = jwt.sign(
      { id: result.insertId, username },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '8h' }
    );

    res.status(201).json({
      message: 'Sikeres regisztráció',
      token,
      username
    });
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// Token ellenőrzés
router.get('/verify', require('../middleware/auth'), (req, res) => {
  res.json({ valid: true, username: req.admin.username });
});

module.exports = router;
