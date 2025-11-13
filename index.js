// index.js - Onimate backend v2 (Scholar Rank + XP scaling + Streaks + Test mode + persistence)
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = 3000;
const PERSIST_FILE = path.join(__dirname, "user.json");

// ----------------- Scholar Rank table (from user's table) -----------------
const RANK_TABLE = [
  { name: "Bronze 1", levelStart: 1, levelEnd: 4, xpStart: 0, xpEnd: 1400, xpNeeded: 1400 },
  { name: "Bronze 2", levelStart: 5, levelEnd: 7, xpStart: 3000, xpEnd: 620100, xpNeeded: 320100 },
  { name: "Bronze 3", levelStart: 8, levelEnd: 11, xpStart: 14000, xpEnd: 1240000, xpNeeded: 1226000 },
  { name: "Silver 1", levelStart: 12, levelEnd: 14, xpStart: 50600, xpEnd: 1491000, xpNeeded: 1440400 },
  { name: "Silver 2", levelStart: 15, levelEnd: 18, xpStart: 101500, xpEnd: 2109000, xpNeeded: 2007500 },
  { name: "Silver 3", levelStart: 19, levelEnd: 22, xpStart: 178500, xpEnd: 3311000, xpNeeded: 3132500 },
  { name: "Gold 1", levelStart: 23, levelEnd: 26, xpStart: 379500, xpEnd: 4575200, xpNeeded: 4195700 },
  { name: "Gold 2", levelStart: 27, levelEnd: 30, xpStart: 532900, xpEnd: 6044700, xpNeeded: 5511800 },
  { name: "Gold 3", levelStart: 31, levelEnd: 34, xpStart: 771400, xpEnd: 7499200, xpNeeded: 6727800 },
  { name: "Gold 4", levelStart: 35, levelEnd: 37, xpStart: 855500, xpEnd: 8710500, xpNeeded: 7855000 },
  { name: "Crystal 1", levelStart: 38, levelEnd: 41, xpStart: 1491000, xpEnd: 10444000, xpNeeded: 8953000 },
  { name: "Crystal 2", levelStart: 42, levelEnd: 45, xpStart: 1785000, xpEnd: 12400000, xpNeeded: 10615000 },
  { name: "Crystal 3", levelStart: 46, levelEnd: 49, xpStart: 2109000, xpEnd: 14325000, xpNeeded: 12216000 },
  { name: "Crystal 4", levelStart: 50, levelEnd: 53, xpStart: 2470000, xpEnd: 16400000, xpNeeded: 13930000 },
  { name: "Obsidian 1", levelStart: 54, levelEnd: 57, xpStart: 2870000, xpEnd: 18395000, xpNeeded: 15525000 },
  { name: "Obsidian 2", levelStart: 58, levelEnd: 61, xpStart: 3311000, xpEnd: 20263000, xpNeeded: 16952000 },
  { name: "Obsidian 3", levelStart: 62, levelEnd: 65, xpStart: 3795000, xpEnd: 22150000, xpNeeded: 18355000 },
  { name: "Obsidian 4", levelStart: 66, levelEnd: 69, xpStart: 4324000, xpEnd: 24000000, xpNeeded: 19676000 },
  { name: "Inferno 1", levelStart: 70, levelEnd: 73, xpStart: 4900000, xpEnd: 26300000, xpNeeded: 21400000 },
  { name: "Inferno 2", levelStart: 74, levelEnd: 77, xpStart: 5525000, xpEnd: 28730000, xpNeeded: 23205000 },
  { name: "Inferno 3", levelStart: 78, levelEnd: 81, xpStart: 6201000, xpEnd: 31120000, xpNeeded: 24919000 },
  { name: "Inferno 4", levelStart: 82, levelEnd: 85, xpStart: 6930000, xpEnd: 33450000, xpNeeded: 26520000 },
  { name: "Inferno 5", levelStart: 86, levelEnd: 89, xpStart: 7714000, xpEnd: 35720000, xpNeeded: 28006000 },
  { name: "Inferno 6", levelStart: 90, levelEnd: 92, xpStart: 8555000, xpEnd: 37890000, xpNeeded: 29335000 },
  { name: "Phoenix", levelStart: 93, levelEnd: 100, xpStart: 9100000, xpEnd: 32835000, xpNeeded: 23725000 },
];

// ----------------- Persistence & default user -----------------
let user = {
  totalExp: 0,
  currentExp: 0,
  scholarRankRowIndex: 0,
  streakCount: 0,
  eliteStreaks: 0,
  lastStudyISO: null,
  tests: [],
  interactions: [],
  focusSessions: [],
  settings: {
    restDays: [6, 0], // Saturday=6, Sunday=0 (JS getDay)
  },
};

function loadUser() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = fs.readFileSync(PERSIST_FILE, "utf8");
      const parsed = JSON.parse(raw);
      user = Object.assign(user, parsed);
      console.log("Loaded user data from", PERSIST_FILE);
    }
  } catch (e) {
    console.error("Failed to load user data:", e.message);
  }
}

function saveUser() {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(user, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to save user data:", e.message);
  }
}

loadUser();

// ----------------- Utilities -----------------
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysBetweenISO(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}
function isWeekendISO(dateISO) {
  const d = new Date(dateISO);
  const day = d.getDay();
  return user.settings.restDays.includes(day);
}

function getScholarRank(totalExp) {
  for (let i = 0; i < RANK_TABLE.length; i++) {
    const r = RANK_TABLE[i];
    if (totalExp >= r.xpStart && totalExp <= r.xpEnd) {
      const levelsInBlock = r.levelEnd - r.levelStart + 1;
      const xpIntoBlock = totalExp - r.xpStart;
      const blockRange = Math.max(1, r.xpEnd - r.xpStart);
      const ratio = Math.min(1, xpIntoBlock / blockRange);
      const levelOffset = Math.floor(ratio * levelsInBlock);
      const level = r.levelStart + Math.min(levelsInBlock - 1, levelOffset);
      return { rankName: r.name, level, xpIntoBlock, xpNeededForBlock: r.xpNeeded, xpStart: r.xpStart, xpEnd: r.xpEnd, rowIndex: i };
    }
  }
  const last = RANK_TABLE[RANK_TABLE.length - 1];
  return { rankName: last.name, level: last.levelEnd, xpIntoBlock: totalExp - last.xpStart, xpNeededForBlock: last.xpNeeded, xpStart: last.xpStart, xpEnd: last.xpEnd, rowIndex: RANK_TABLE.length - 1 };
}

// spam penalty: if same topic recorded >3 times in last 7 days, -10%
function spamPenaltyForTopic(topic) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const count = user.interactions.filter(i => i.topic === topic && new Date(i.date) >= weekAgo).length;
  return count > 3 ? 0.9 : 1.0;
}

// long-streak bonus 5% for streak >=7
function longStreakMultiplier() {
  return user.streakCount >= 7 ? 1.05 : 1.0;
}

// elite weekend bonus 10% applied when awarding XP and studying on rest day
const ELITE_BONUS = 0.10;

// award XP handling (applies streak, elite, long streak, spam rules)
function awardXP(baseAmount, opts = {}) {
  // opts: { topic, isStudyDay, isEliteDay }
  let xp = baseAmount;
  // spam penalty
  if (opts.topic) xp *= spamPenaltyForTopic(opts.topic);
  // long streak
  xp *= longStreakMultiplier();
  // elite weekend bonus
  if (opts.isEliteDay) xp *= 1 + ELITE_BONUS;
  xp = Math.max(0, Math.round(xp));
  // update streak logic (resets only after 14 full days of inactivity)
  const nowISO = todayISO();
  if (!user.lastStudyISO) {
    user.streakCount = 1;
    user.lastStudyISO = nowISO;
  } else {
    const diff = daysBetweenISO(user.lastStudyISO, nowISO);
    if (diff === 0) {
      // same day - nothing to do
    } else if (diff <= 14) {
      // within allowed idle window
      user.streakCount += 1;
      user.lastStudyISO = nowISO;
    } else {
      // missed too long -> reset streak to 1
      user.streakCount = 1;
      user.lastStudyISO = nowISO;
    }
  }

  user.totalExp += xp;
  user.currentExp += xp;
  console.log(`+${xp} XP (${baseAmount} base) awarded for ${opts.reason || "activity"}. totalExp=${user.totalExp} streak=${user.streakCount}`);
  // save
  saveUser();
  return xp;
}

// small helper: compute if today is elite day (studying on weekend)
function todayIsEliteDay() {
  return isWeekendISO(todayISO());
}

// ----------------- OpenAI helper (optional) -----------------
async function askAI(prompt, system = "You are a helpful tutor.") {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const res = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      { model: "gpt-4o-mini", messages: [{ role: "system", content: system }, { role: "user", content: prompt }] },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" } }
    );
    return res.data.choices[0].message.content;
  } catch (e) {
    console.error("OpenAI error:", e.response?.data || e.message);
    return null;
  }
}

// ----------------- Routes -----------------

app.get("/", (req, res) => res.send("Onimate Scholar backend v2 running"));

// PROFILE
app.get("/profile", (req, res) => {
  const rank = getScholarRank(user.totalExp);
  res.json({
    totalExp: user.totalExp,
    currentExp: user.currentExp,
    rank,
    streakCount: user.streakCount,
    eliteStreaks: user.eliteStreaks,
    lastStudyISO: user.lastStudyISO,
    testsTaken: user.tests.length,
    interactionsCount: user.interactions.length,
    focusSessions: user.focusSessions.length,
  });
});

// RECORD interaction (mini actions like explain/simplify/paraphrase/translate)
app.post("/record", (req, res) => {
  const { topic, question, userAnswer, correct, meta } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });
  const item = { id: Date.now().toString(), topic, question: question || null, userAnswer: userAnswer || null, correct: !!correct, meta: meta || {}, date: new Date().toISOString() };
  user.interactions.push(item);
  saveUser();
  res.json({ ok: true, item });
});

// ----------------- Learning action endpoints (mini actions give XP) -----------------

// Explain (deeper) - returns AI explanation if available, awards XP
app.post("/explain", async (req, res) => {
  const { topic, level = "intermediate" } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const baseXP = 20 + Math.min(40, Math.floor((topic.length || 20) / 10) * 5); // scale with length
  const isElite = todayIsEliteDay();
  const xpAwarded = awardXP(baseXP, { topic, reason: "explain", isEliteDay: isElite, isStudyDay: true });

  // record interaction
  user.interactions.push({ id: Date.now().toString(), topic, type: "explain", date: new Date().toISOString() });

  // attempt to get AI explanation
  const prompt = `Explain ${topic} at ${level} depth for a student.`;
  const aiText = (await askAI(prompt, "You are a patient study tutor.")) || `Explanation (offline): ${topic} - try study notes.`;

  saveUser();
  res.json({ explanation: aiText, xpAwarded });
});

// Simplify
app.post("/simplify", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  const baseXP = 12 + Math.min(20, Math.floor(text.length / 50));
  const isElite = todayIsEliteDay();
  const xpAwarded = awardXP(baseXP, { reason: "simplify", isEliteDay: isElite, topic: "simplify" });

  user.interactions.push({ id: Date.now().toString(), topic: "simplify", type: "simplify", date: new Date().toISOString() });

  const prompt = `Simplify the following text for a beginner:\n\n${text}`;
  const aiText = (await askAI(prompt, "You are a simplifying assistant.")) || `Simplified (offline): ${text.slice(0, 120)}...`;

  saveUser();
  res.json({ simplified: aiText, xpAwarded });
});

// Paraphrase
app.post("/paraphrase", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });
  const baseXP = 15;
  const isElite = todayIsEliteDay();
  const xpAwarded = awardXP(baseXP, { reason: "paraphrase", isEliteDay: isElite, topic: "paraphrase" });

  user.interactions.push({ id: Date.now().toString(), topic: "paraphrase", type: "paraphrase", date: new Date().toISOString() });

  const prompt = `Paraphrase the text concisely:\n\n${text}`;
  const aiText = (await askAI(prompt, "You are a paraphrasing assistant.")) || `${text} (paraphrased offline)`;

  saveUser();
  res.json({ paraphrased: aiText, xpAwarded });
});

// Translate
app.post("/translate", async (req, res) => {
  const { text, lang } = req.body;
  if (!text || !lang) return res.status(400).json({ error: "text and lang required" });
  const baseXP = 20;
  const isElite = todayIsEliteDay();
  const xpAwarded = awardXP(baseXP, { reason: "translate", isEliteDay: isElite, topic: "translate" });

  user.interactions.push({ id: Date.now().toString(), topic: "translate", type: "translate", date: new Date().toISOString() });

  const prompt = `Translate this into ${lang}:\n\n${text}`;
  const aiText = (await askAI(prompt, "You are a translation assistant.")) || `${text} (translated offline to ${lang})`;

  saveUser();
  res.json({ translated: aiText, xpAwarded });
});

// ----------------- Focus sessions -----------------
let currentFocus = null; // { id, start, end, pomodoro }

app.post("/focus/start", (req, res) => {
  const { pomodoro = true } = req.body;
  if (currentFocus && currentFocus.active) return res.status(400).json({ error: "Focus already active" });

  const durationMs = 25 * 60 * 1000;
  const start = Date.now();
  const end = start + durationMs;
  currentFocus = { id: Date.now().toString(), start, end, pomodoro: !!pomodoro, active: true };

  // award base XP immediately for starting (motivational)
  const baseStartXP = 20;
  const isElite = todayIsEliteDay();
  awardXP(baseStartXP, { reason: "focus-start", isEliteDay: isElite, topic: "focus" });

  // schedule end
  setTimeout(() => {
    if (currentFocus && currentFocus.id === currentFocus.id) {
      // completion XP
      const sessionBase = pomodoro ? 120 + 30 : 120; // extra for pomodoro
      const awarded = awardXP(sessionBase, { reason: "focus-complete", isEliteDay: isElite, topic: "focus" });
      user.focusSessions.push({ id: currentFocus.id, start: new Date(start).toISOString(), end: new Date(end).toISOString(), pomodoro, xp: awarded });
      currentFocus.active = false;
      saveUser();
      console.log(`Focus session ${currentFocus.id} completed, awarded ${awarded} XP`);
    }
  }, durationMs);

  saveUser();
  res.json({ ok: true, id: currentFocus.id, endsAt: new Date(end).toISOString() });
});

app.get("/focus/status", (req, res) => {
  if (!currentFocus || !currentFocus.active) return res.json({ active: false });
  const timeLeftMs = Math.max(0, currentFocus.end - Date.now());
  const mins = Math.floor(timeLeftMs / 60000);
  const secs = Math.floor((timeLeftMs % 60000) / 1000);
  res.json({ active: true, pomodoro: currentFocus.pomodoro, timeLeft: `${mins}m ${secs}s` });
});

app.post("/focus/end", (req, res) => {
  if (!currentFocus || !currentFocus.active) return res.json({ ok: false, message: "No active focus" });
  currentFocus.active = false;
  const now = Date.now();
  const elapsed = now - currentFocus.start;
  const minutes = Math.max(0, Math.floor(elapsed / 60000));
  const base = Math.max(0, Math.round((minutes / 25) * 120)); // award proportionally
  const isElite = todayIsEliteDay();
  const awarded = awardXP(base, { reason: "focus-end-early", isEliteDay: isElite, topic: "focus" });
  user.focusSessions.push({ id: currentFocus.id, start: new Date(currentFocus.start).toISOString(), end: new Date(now).toISOString(), pomodoro: currentFocus.pomodoro, xp: awarded });
  saveUser();
  res.json({ ok: true, awarded, minutes });
});

// ----------------- TEST system -----------------
// /test/start creates a session; /test/submit scores it
app.post("/test/start", async (req, res) => {
  const { numQuestions = 10 } = req.body;
  // collect recent topics
  const topics = [...new Set(user.interactions.map(i => i.topic).filter(Boolean))].slice(0, 40);

  const fallbackGenerate = (topicsList, n) => {
    const q = [];
    if (!topicsList.length) {
      for (let i = 0; i < n; i++) q.push({ id: `q-${Date.now()}-${i}`, prompt: `Explain this concept in one sentence: Topic ${i + 1}`, answer: null, difficulty: "medium", topic: `Topic${i + 1}` });
      return q;
    }
    for (let i = 0; i < n; i++) {
      const t = topicsList[i % topicsList.length];
      const difficulty = i % 3 === 0 ? "hard" : i % 3 === 1 ? "medium" : "easy";
      q.push({ id: `q-${Date.now()}-${i}`, prompt: `Question on ${t}: short answer`, answer: null, difficulty, topic: t });
    }
    return q;
  };

  try {
    let questions = [];
    if (process.env.OPENAI_API_KEY && topics.length > 0) {
      const prompt = `Create ${numQuestions} short answer quiz questions from these topics:\n\n${topics.join("\n")}\n\nReturn a JSON array: [{ "prompt":"...","answer":"...", "difficulty":"easy|medium|hard", "topic":"..." }, ...]`;
      const aiRes = await askAI(prompt, "You are a quiz generator.");
      try {
        const parsed = JSON.parse(aiRes);
        questions = parsed.map((p, idx) => ({ id: `ai-${Date.now()}-${idx}`, prompt: p.prompt || p.q, answer: p.answer || null, difficulty: p.difficulty || "medium", topic: p.topic || topics[idx % topics.length] }));
      } catch (e) {
        questions = fallbackGenerate(topics, numQuestions);
      }
    } else {
      questions = fallbackGenerate(topics, numQuestions);
    }

    const session = { id: Date.now().toString(), date: new Date().toISOString(), questions, total: questions.length, correct: 0, earnedXP: 0, completed: false };
    user.tests.push(session);
    saveUser();
    res.json({ session });
  } catch (err) {
    console.error("test.start error", err.message || err);
    const questions = fallbackGenerate(topics, numQuestions);
    const session = { id: Date.now().toString(), date: new Date().toISOString(), questions, total: questions.length, correct: 0, earnedXP: 0, completed: false };
    user.tests.push(session);
    saveUser();
    res.json({ session, warning: "fallback used" });
  }
});

app.post("/test/submit", async (req, res) => {
  const { sessionId, answers } = req.body;
  if (!sessionId || !answers) return res.status(400).json({ error: "sessionId and answers required" });

  const session = user.tests.find(s => s.id === sessionId);
  if (!session) return res.status(404).json({ error: "session not found" });
  if (session.completed) return res.status(400).json({ error: "session already completed" });

  // scoring: per-correct XP depends on difficulty
  const difficultyXP = { easy: 70, medium: 85, hard: 100 };
  let correctCount = 0;
  for (const a of answers) {
    const q = session.questions.find(q => q.id === a.id);
    const difficulty = q?.difficulty || "medium";
    const perCorrect = difficultyXP[difficulty] || 80;
    if (a.correct) {
      correctCount++;
      awardXP(perCorrect, { reason: "test-correct", topic: q?.topic, isEliteDay: todayIsEliteDay() });
    } else {
      awardXP(5, { reason: "test-wrong", topic: q?.topic, isEliteDay: todayIsEliteDay() }); // small XP for effort
    }
    // record interaction for future test generation
    user.interactions.push({ id: `rec-${Date.now()}-${a.id}`, topic: q?.topic || "misc", question: q?.prompt || "", userAnswer: a.answer, correct: !!a.correct, date: new Date().toISOString() });
  }

  // completion bonus
  const completionBonus = 100;
  awardXP(completionBonus, { reason: "test-complete", isEliteDay: todayIsEliteDay() });

  session.correct = correctCount;
  session.earnedXP = (correctCount * 0) + completionBonus; // xp already added above per question; for reporting we calculate total:
  session.completed = true;
  saveUser();

  const totalXP = session.questions.reduce((acc, q) => {
    // approximate gathered XP for reporting
    const ans = answers.find(a => a.id === q.id);
    if (ans?.correct) return acc + (difficultyXP[q.difficulty] || 85);
    return acc + 5;
  }, 0) + completionBonus;

  res.json({ sessionId: session.id, correct: correctCount, total: session.total, earnedXP: totalXP });
});

// Test review endpoint
app.get("/test/:id/review", (req, res) => {
  const id = req.params.id;
  const session = user.tests.find(s => s.id === id);
  if (!session) return res.status(404).json({ error: "not found" });
  res.json({ session });
});

// ADMIN reset (dev)
app.post("/admin/reset", (req, res) => {
  user = {
    totalExp: 0,
    currentExp: 0,
    scholarRankRowIndex: 0,
    streakCount: 0,
    eliteStreaks: 0,
    lastStudyISO: null,
    tests: [],
    interactions: [],
    focusSessions: [],
    settings: { restDays: [6, 0] },
  };
  saveUser();
  res.json({ ok: true });
});

// ----------------- Start server -----------------
app.listen(PORT, () => {
  console.log(`✅ Onimate Scholar backend v2 running on http://localhost:${PORT}`);
});
