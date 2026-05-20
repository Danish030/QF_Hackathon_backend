/**
 * contentRoutes.js
 * ─────────────────────────────────────────────────────────────────
 * Express route handlers that expose the Quran Foundation Content
 * APIs to your frontend/app through a clean backend proxy.
 *
 * Auth: Client Credentials (server-side, no user login required).
 *       Tokens are fetched, cached, and refreshed automatically.
 *
 * All routes return JSON. Errors include a human-readable message.
 *
 * ── Chapters ──────────────────────────────────────────────────────
 *   GET /api/content/chapters?language=en&page=1&per_page=50
 *   GET /api/content/chapters/:id?language=en
 *   GET /api/content/chapters/:id/info?language=en
 *
 * ── Verses ────────────────────────────────────────────────────────
 *   GET /api/content/verses/by_chapter/:chapterNumber
 *   GET /api/content/verses/by_page/:pageNumber
 *   GET /api/content/verses/by_juz/:juzNumber
 *   GET /api/content/verses/by_key/:verseKey          (e.g. 1:1)
 *   GET /api/content/verses/random
 *
 * ── Audio ─────────────────────────────────────────────────────────
 *   GET /api/content/audio/chapter-reciters
 *   GET /api/content/audio/chapter/:reciterId/:chapterNumber
 *   GET /api/content/audio/chapter/:reciterId          (all chapters)
 *   GET /api/content/audio/recitations
 *   GET /api/content/audio/ayahs/:recitationId/chapter/:chapterNumber
 *   GET /api/content/audio/ayahs/:recitationId/juz/:juzNumber
 *   GET /api/content/audio/ayah/:recitationId/:verseKey
 *
 * ── Resources ─────────────────────────────────────────────────────
 *   GET /api/content/resources/translations
 *   GET /api/content/resources/tafsirs
 *   GET /api/content/resources/juzs
 *
 * ── Quran script ──────────────────────────────────────────────────
 *   GET /api/content/quran/script/:script
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const express = require("express");
const {
  listChapters,
  getChapter,
  getChapterInfo,
  getVersesByChapter,
  getVersesByPage,
  getVersesByJuz,
  getVerseByKey,
  getRandomVerse,
  listChapterReciters,
  getChapterAudio,
  getAllChapterAudios,
  listRecitations,
  getAyahRecitationsForChapter,
  getAyahRecitationsForJuz,
  getAyahRecitation,
  listTranslations,
  listTafsirs,
  listJuzs,
  getQuranScript,
} = require("./contentApi");

const router = express.Router();

// ── Helper ─────────────────────────────────────────────────────────
function handle(fn) {
  return async (req, res) => {
    try {
      const data = await fn(req);
      res.json(data);
    } catch (err) {
      const status = _statusFromError(err);
      res.status(status).json({ error: err.message });
    }
  };
}

function _statusFromError(err) {
  const msg = err.message || "";
  if (msg.includes("[401") || msg.includes("unauthorized")) return 401;
  if (msg.includes("[403") || msg.includes("forbidden")) return 403;
  if (msg.includes("[404") || msg.includes("not_found")) return 404;
  if (msg.includes("[429") || msg.includes("rate_limit")) return 429;
  return 500;
}

// ─────────────────────────────────────────────────────────────────
// CHAPTERS
// ─────────────────────────────────────────────────────────────────

// GET /api/content/chapters?language=en&page=1&per_page=50
router.get("/chapters", handle((req) =>
  listChapters({
    language: req.query.language,
    page: req.query.page ? Number(req.query.page) : undefined,
    per_page: req.query.per_page ? Number(req.query.per_page) : undefined,
  })
));

// GET /api/content/chapters/1?language=en
router.get("/chapters/:id", handle((req) =>
  getChapter(Number(req.params.id), req.query.language)
));

// GET /api/content/chapters/1/info?language=en
router.get("/chapters/:id/info", handle((req) =>
  getChapterInfo(Number(req.params.id), req.query.language)
));

// ─────────────────────────────────────────────────────────────────
// VERSES
// Supported query params: language, words, translations, audio,
// tafsirs, fields, word_fields, translation_fields, page, per_page
// ─────────────────────────────────────────────────────────────────

// GET /api/content/verses/by_chapter/1?translations=131&words=true
router.get("/verses/by_chapter/:chapterNumber", handle((req) =>
  getVersesByChapter(Number(req.params.chapterNumber), _verseOpts(req))
));

// GET /api/content/verses/by_page/1
router.get("/verses/by_page/:pageNumber", handle((req) =>
  getVersesByPage(Number(req.params.pageNumber), _verseOpts(req))
));

// GET /api/content/verses/by_juz/1
router.get("/verses/by_juz/:juzNumber", handle((req) =>
  getVersesByJuz(Number(req.params.juzNumber), _verseOpts(req))
));

// GET /api/content/verses/by_key/1:1?translations=131
router.get("/verses/by_key/:verseKey", handle((req) =>
  getVerseByKey(req.params.verseKey, _verseOpts(req))
));

// GET /api/content/verses/random
router.get("/verses/random", handle((req) =>
  getRandomVerse(_verseOpts(req))
));

function _verseOpts(req) {
  const {
    language, words, translations, audio, tafsirs,
    fields, word_fields, translation_fields, tafsir_fields,
    page, per_page,
  } = req.query;
  return {
    language,
    words: words === "true" ? true : words === "false" ? false : undefined,
    translations,
    audio: audio ? Number(audio) : undefined,
    tafsirs,
    fields,
    word_fields,
    translation_fields,
    tafsir_fields,
    page: page ? Number(page) : undefined,
    per_page: per_page ? Number(per_page) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────────

// GET /api/content/audio/chapter-reciters?language=en
router.get("/audio/chapter-reciters", handle((req) =>
  listChapterReciters(req.query.language)
));

// GET /api/content/audio/chapter/1/1?segments=true
// → Chapter audio file (MP3 URL) for reciter 1, chapter 1
router.get("/audio/chapter/:reciterId/:chapterNumber", handle((req) =>
  getChapterAudio(
    Number(req.params.reciterId),
    Number(req.params.chapterNumber),
    req.query.segments === "true"
  )
));

// GET /api/content/audio/chapter/1
// → All 114 chapter audio files for reciter 1
router.get("/audio/chapter/:reciterId", handle((req) =>
  getAllChapterAudios(Number(req.params.reciterId))
));

// GET /api/content/audio/recitations?language=en
// → List of verse-level recitations (for per-ayah audio)
router.get("/audio/recitations", handle((req) =>
  listRecitations(req.query.language)
));

// GET /api/content/audio/ayahs/:recitationId/chapter/:chapterNumber
// → Per-ayah audio URLs for a whole chapter
router.get("/audio/ayahs/:recitationId/chapter/:chapterNumber", handle((req) =>
  getAyahRecitationsForChapter(
    Number(req.params.recitationId),
    Number(req.params.chapterNumber)
  )
));

// GET /api/content/audio/ayahs/:recitationId/juz/:juzNumber
router.get("/audio/ayahs/:recitationId/juz/:juzNumber", handle((req) =>
  getAyahRecitationsForJuz(
    Number(req.params.recitationId),
    Number(req.params.juzNumber)
  )
));

// GET /api/content/audio/ayah/:recitationId/1:1
router.get("/audio/ayah/:recitationId/:verseKey", handle((req) =>
  getAyahRecitation(
    Number(req.params.recitationId),
    req.params.verseKey
  )
));

// ─────────────────────────────────────────────────────────────────
// RESOURCES
// ─────────────────────────────────────────────────────────────────

// GET /api/content/resources/translations?language=en
router.get("/resources/translations", handle((req) =>
  listTranslations(req.query.language)
));

// GET /api/content/resources/tafsirs?language=en
router.get("/resources/tafsirs", handle((req) =>
  listTafsirs(req.query.language)
));

// GET /api/content/resources/juzs
router.get("/resources/juzs", handle(() => listJuzs()));

// ─────────────────────────────────────────────────────────────────
// QURAN SCRIPT
// ─────────────────────────────────────────────────────────────────

// GET /api/content/quran/script/uthmani?chapter_number=1
// scripts: uthmani | imlaei | uthmani_simple | imlaei_simple
router.get("/quran/script/:script", handle((req) =>
  getQuranScript(
    req.params.script,
    req.query.chapter_number ? Number(req.query.chapter_number) : undefined
  )
));

module.exports = router;
