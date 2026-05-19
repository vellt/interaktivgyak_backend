const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');

const EXAM_QUESTIONS = 20;
const EXAM_DURATION = 45 * 60; // seconds
const PASS_PERCENTAGE = 40;

// Vizsga indítása - random 20 kérdés kiosztása
router.post('/start', async (req, res) => {
  try {
    // Ellenőrizzük van-e elég kérdés
    const [countResult] = await db.query('SELECT COUNT(*) as cnt FROM questions');
    const total = countResult[0].cnt;
    const take = Math.min(EXAM_QUESTIONS, total);

    // Random kérdések
    const [questions] = await db.query(
      'SELECT id, type, question_text, image_path, code_snippet FROM questions ORDER BY RAND() LIMIT ?',
      [take]
    );

    if (questions.length === 0)
      return res.status(400).json({ error: 'Nincs elég kérdés az adatbázisban' });

    const sessionId = uuidv4();

    // Session létrehozása
    await db.query(
      'INSERT INTO exam_sessions (id, max_score) VALUES (?, ?)',
      [sessionId, take]
    );

    // Kérdések hozzárendelése a sessionhöz
    const sessionQValues = questions.map((q, i) => [sessionId, q.id, i + 1]);
    await db.query(
      'INSERT INTO session_questions (session_id, question_id, question_order) VALUES ?',
      [sessionQValues]
    );

    // Válaszopciók betöltése (de helyes válasz nélkül!)
    const enriched = await Promise.all(questions.map(async (q) => {
      let options = [], pairs = [], sortItems = [];

      if (q.type === 'single' || q.type === 'multiple') {
        const [opts] = await db.query(
          'SELECT id, option_text FROM answer_options WHERE question_id = ? ORDER BY RAND()',
          [q.id]
        );
        options = opts;
      } else if (q.type === 'match') {
        const [mp] = await db.query(
          'SELECT id, left_item, right_item FROM match_pairs WHERE question_id = ? ORDER BY pair_order',
          [q.id]
        );
        // Bal oldal fix sorrendben, jobb oldal összekeverve
        pairs = mp;
      } else if (q.type === 'sort') {
        const [si] = await db.query(
          'SELECT id, item_text FROM sort_items WHERE question_id = ? ORDER BY RAND()',
          [q.id]
        );
        sortItems = si;
      }

      return { ...q, options, pairs, sortItems };
    }));

    res.json({
      sessionId,
      questions: enriched,
      duration: EXAM_DURATION,
      totalQuestions: take
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Szerverhiba a vizsga indításakor' });
  }
});

// Válasz mentése
router.post('/answer', async (req, res) => {
  const { sessionId, questionId, answer } = req.body;
  if (!sessionId || !questionId || answer === undefined)
    return res.status(400).json({ error: 'Hiányzó adatok' });

  try {
    const [sessions] = await db.query(
      'SELECT * FROM exam_sessions WHERE id = ? AND finished_at IS NULL',
      [sessionId]
    );
    if (!sessions.length)
      return res.status(400).json({ error: 'Érvénytelen vagy már lezárt session' });

    // Időtúllépés — MySQL számolja, nem Node.js
    const [timeCheck] = await db.query(
      'SELECT TIMESTAMPDIFF(SECOND, started_at, NOW()) as elapsed FROM exam_sessions WHERE id = ?',
      [sessionId]
    );
    const elapsed = timeCheck[0].elapsed;
    if (elapsed > EXAM_DURATION)
      return res.status(400).json({ error: 'Az idő lejárt', expired: true });

    const [qRows] = await db.query('SELECT type FROM questions WHERE id = ?', [questionId]);
    if (!qRows.length) return res.status(404).json({ error: 'Kérdés nem található' });

    await db.query(
      'DELETE FROM session_answers WHERE session_id = ? AND question_id = ?',
      [sessionId, questionId]
    );
    await db.query(
      'INSERT INTO session_answers (session_id, question_id, answer_data) VALUES (?, ?, ?)',
      [sessionId, questionId, JSON.stringify(answer)]
    );

    res.json({ saved: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Szerverhiba' });
  }
});
// Vizsga befejezése és kiértékelés
router.post('/finish', async (req, res) => {
  const { sessionId, expired } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'Hiányzó sessionId' });

  try {
    const [sessions] = await db.query(
      'SELECT * FROM exam_sessions WHERE id = ? AND finished_at IS NULL',
      [sessionId]
    );
    if (!sessions.length)
      return res.status(400).json({ error: 'Session nem található vagy már lezárva' });

    // Összes megválaszolt kérdés kiértékelése
    const [answers] = await db.query(
      'SELECT sa.*, q.type FROM session_answers sa JOIN questions q ON sa.question_id = q.id WHERE sa.session_id = ?',
      [sessionId]
    );

    let score = 0;
    const results = [];

    for (const ans of answers) {
      const userAnswer = JSON.parse(ans.answer_data);
      let isCorrect = false;

      if (ans.type === 'single') {
        const [correct] = await db.query(
          'SELECT id FROM answer_options WHERE question_id = ? AND is_correct = TRUE',
          [ans.question_id]
        );
        isCorrect = correct.length > 0 && userAnswer === correct[0].id;

      } else if (ans.type === 'multiple') {
        const [correct] = await db.query(
          'SELECT id FROM answer_options WHERE question_id = ? AND is_correct = TRUE',
          [ans.question_id]
        );
        const correctIds = correct.map(c => c.id).sort();
        const userIds = (Array.isArray(userAnswer) ? userAnswer : []).sort();
        isCorrect = JSON.stringify(correctIds) === JSON.stringify(userIds);

      } else if (ans.type === 'match') {
        const [pairs] = await db.query(
          'SELECT id, right_item FROM match_pairs WHERE question_id = ?',
          [ans.question_id]
        );
        // userAnswer: { pairId: selectedRightItem }
        isCorrect = pairs.every(p =>
          userAnswer[p.id] && userAnswer[p.id].toString().trim().toLowerCase() === p.right_item.trim().toLowerCase()
        );

      } else if (ans.type === 'sort') {
        const [items] = await db.query(
          'SELECT id, correct_position FROM sort_items WHERE question_id = ?',
          [ans.question_id]
        );
        // userAnswer: [id1, id2, id3, id4] - sorrendben
        isCorrect = items.every(item => {
          const userPos = userAnswer.indexOf(item.id);
          return userPos + 1 === item.correct_position;
        });
      }

      if (isCorrect) score++;

      await db.query(
        'UPDATE session_answers SET is_correct = ? WHERE session_id = ? AND question_id = ?',
        [isCorrect, sessionId, ans.question_id]
      );

      results.push({ questionId: ans.question_id, isCorrect });
    }

    const [sessionQ] = await db.query(
      'SELECT COUNT(*) as cnt FROM session_questions WHERE session_id = ?',
      [sessionId]
    );
    const maxScore = sessionQ[0].cnt;
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const passed = percentage >= PASS_PERCENTAGE;

    // Session lezárása
    await db.query(
      'UPDATE exam_sessions SET finished_at = NOW(), time_expired = ?, score = ?, max_score = ?, percentage = ?, passed = ? WHERE id = ?',
      [expired ? 1 : 0, score, maxScore, percentage, passed ? 1 : 0, sessionId]
    );

    // Helyes válaszok visszaküldése
    // Helyes válaszok visszaküldése MINDEN vizsgakérdéshez
const [examQuestions] = await db.query(
  `SELECT q.id, q.type
   FROM session_questions sq
   JOIN questions q ON sq.question_id = q.id
   WHERE sq.session_id = ?
   ORDER BY sq.question_order`,
  [sessionId]
);

    const correctAnswers = {};

    for (const q of examQuestions) {
      if (q.type === 'single' || q.type === 'multiple') {
        const [correct] = await db.query(
          'SELECT id, option_text FROM answer_options WHERE question_id = ? AND is_correct = TRUE',
          [q.id]
        );
        correctAnswers[q.id] = correct;
      } else if (q.type === 'match') {
        const [pairs] = await db.query(
          'SELECT id, left_item, right_item FROM match_pairs WHERE question_id = ? ORDER BY pair_order',
          [q.id]
        );
        correctAnswers[q.id] = pairs;
      } else if (q.type === 'sort') {
        const [items] = await db.query(
          'SELECT id, item_text, correct_position FROM sort_items WHERE question_id = ? ORDER BY correct_position',
          [q.id]
        );
        correctAnswers[q.id] = items;
      }
    }

    res.json({
      score,
      maxScore,
      percentage: Math.round(percentage * 100) / 100,
      passed,
      passPercentage: PASS_PERCENTAGE,
      results,
      correctAnswers,
      timeExpired: !!expired
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Szerverhiba a kiértékelésnél' });
  }
});

module.exports = router;
