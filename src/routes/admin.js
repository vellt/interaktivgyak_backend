const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../db');
const authMiddleware = require('../middleware/auth');

// Fájl feltöltés konfigurálás
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// Minden admin útvonal védett
router.use(authMiddleware);

// ---- Kérdések listázása ----
router.get('/questions', async (req, res) => {
  try {
    const [questions] = await db.query(
      'SELECT id, type, question_text, image_path, code_snippet, created_at FROM questions ORDER BY created_at DESC'
    );
    res.json(questions);
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// ---- Egy kérdés részletei ----
router.get('/questions/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM questions WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Nem található' });
    const q = rows[0];

    if (q.type === 'single' || q.type === 'multiple') {
      const [opts] = await db.query(
        'SELECT * FROM answer_options WHERE question_id = ? ORDER BY sort_order',
        [q.id]
      );
      q.options = opts;
    } else if (q.type === 'match') {
      const [pairs] = await db.query(
        'SELECT * FROM match_pairs WHERE question_id = ? ORDER BY pair_order',
        [q.id]
      );
      q.pairs = pairs;
    } else if (q.type === 'sort') {
      const [items] = await db.query(
        'SELECT * FROM sort_items WHERE question_id = ? ORDER BY correct_position',
        [q.id]
      );
      q.sortItems = items;
    }
    res.json(q);
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// ---- Kérdés létrehozása ----
router.post('/questions', upload.single('image'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { type, question_text, code_snippet, options, pairs, sortItems } = req.body;
    const image_path = req.file ? `/uploads/${req.file.filename}` : null;

    const [result] = await conn.query(
      'INSERT INTO questions (type, question_text, image_path, code_snippet) VALUES (?, ?, ?, ?)',
      [type, question_text, image_path, code_snippet || null]
    );
    const qId = result.insertId;

    await saveQuestionData(conn, qId, type, options, pairs, sortItems);
    await conn.commit();
    res.json({ id: qId, message: 'Kérdés létrehozva' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Szerverhiba: ' + err.message });
  } finally {
    conn.release();
  }
});

// ---- Kérdés módosítása ----
router.put('/questions/:id', upload.single('image'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { type, question_text, code_snippet, options, pairs, sortItems } = req.body;

    const updateFields = { type, question_text, code_snippet: code_snippet || null };
    if (req.file) updateFields.image_path = `/uploads/${req.file.filename}`;

    await conn.query('UPDATE questions SET ? WHERE id = ?', [updateFields, req.params.id]);

    // Meglévő adatok törlése
    await conn.query('DELETE FROM answer_options WHERE question_id = ?', [req.params.id]);
    await conn.query('DELETE FROM match_pairs WHERE question_id = ?', [req.params.id]);
    await conn.query('DELETE FROM sort_items WHERE question_id = ?', [req.params.id]);

    await saveQuestionData(conn, req.params.id, type, options, pairs, sortItems);
    await conn.commit();
    res.json({ message: 'Kérdés módosítva' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'Szerverhiba' });
  } finally {
    conn.release();
  }
});

// ---- Kérdés törlése ----
router.delete('/questions/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Kérdés törölve' });
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// ---- Statisztikák ----
router.get('/stats', async (req, res) => {
  try {
    const [totalQ] = await db.query('SELECT COUNT(*) as cnt FROM questions');
    const [totalExams] = await db.query('SELECT COUNT(*) as cnt FROM exam_sessions WHERE finished_at IS NOT NULL');
    const [passedExams] = await db.query('SELECT COUNT(*) as cnt FROM exam_sessions WHERE passed = TRUE');
    const [avgScore] = await db.query('SELECT AVG(percentage) as avg FROM exam_sessions WHERE finished_at IS NOT NULL');
    const [recentExams] = await db.query(
      'SELECT id, started_at, finished_at, score, max_score, percentage, passed, time_expired FROM exam_sessions WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 20'
    );
    res.json({
      totalQuestions: totalQ[0].cnt,
      totalExams: totalExams[0].cnt,
      passedExams: passedExams[0].cnt,
      avgScore: Math.round((avgScore[0].avg || 0) * 100) / 100,
      recentExams
    });
  } catch (err) {
    res.status(500).json({ error: 'Szerverhiba' });
  }
});

// Helper function
async function saveQuestionData(conn, qId, type, options, pairs, sortItems) {
  if ((type === 'single' || type === 'multiple') && options) {
    const opts = typeof options === 'string' ? JSON.parse(options) : options;
    for (let i = 0; i < opts.length; i++) {
      await conn.query(
        'INSERT INTO answer_options (question_id, option_text, is_correct, sort_order) VALUES (?, ?, ?, ?)',
        [qId, opts[i].text, opts[i].correct ? 1 : 0, i]
      );
    }
  } else if (type === 'match' && pairs) {
    const ps = typeof pairs === 'string' ? JSON.parse(pairs) : pairs;
    for (let i = 0; i < ps.length; i++) {
      await conn.query(
        'INSERT INTO match_pairs (question_id, left_item, right_item, pair_order) VALUES (?, ?, ?, ?)',
        [qId, ps[i].left, ps[i].right, i]
      );
    }
  } else if (type === 'sort' && sortItems) {
    const si = typeof sortItems === 'string' ? JSON.parse(sortItems) : sortItems;
    for (let i = 0; i < si.length; i++) {
      await conn.query(
        'INSERT INTO sort_items (question_id, item_text, correct_position) VALUES (?, ?, ?)',
        [qId, si[i].text, i + 1]
      );
    }
  }
}

module.exports = router;
