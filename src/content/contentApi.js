/**
 * contentApi.js
 * ─────────────────────────────────────────────────────────────────
 * Typed wrappers for every major Quran Foundation Content API v4
 * endpoint you asked for, plus supporting resource lookups.
 *
 * All functions call contentGet() which handles auth, token caching,
 * 401-retry, and header injection automatically.
 *
 * API base: {apiBaseUrl}/content/api/v4/
 *
 * ── Chapters ──────────────────────────────────────────────────────
 *   listChapters(language?)
 *   getChapter(chapterNumber, language?)
 *   getChapterInfo(chapterNumber, language?)
 *
 * ── Verses ────────────────────────────────────────────────────────
 *   getVersesByChapter(chapterNumber, options?)
 *   getVersesByPage(pageNumber, options?)
 *   getVersesByJuz(juzNumber, options?)
 *   getVerseByKey(verseKey, options?)          e.g. "1:1"
 *   getRandomVerse(options?)
 *
 * ── Audio ─────────────────────────────────────────────────────────
 *   listChapterReciters(language?)
 *   getChapterAudio(reciterId, chapterNumber, segments?)
 *   getAllChapterAudios(reciterId)
 *   getAyahRecitationsForChapter(recitationId, chapterNumber)
 *   listRecitations(language?)
 *
 * ── Resources ─────────────────────────────────────────────────────
 *   listTranslations(language?)
 *   listTafsirs(language?)
 *   listRecitationInfo(recitationId)
 *
 * ── Juz ───────────────────────────────────────────────────────────
 *   listJuzs()
 *
 * ── Quran (full text by script) ───────────────────────────────────
 *   getQuranScript(script?)
 * ─────────────────────────────────────────────────────────────────
 */

"use strict";

const { contentGet } = require("./contentApiClient");

// ─────────────────────────────────────────────────────────────────
// CHAPTERS
// ─────────────────────────────────────────────────────────────────

/**
 * List all 114 chapters.
 * @param {Object} [options]
 * @param {string} [options.language="en"]
 * @param {number} [options.page=1] Page number for pagination
 * @param {number} [options.per_page=10] Results per page (max 50)
 */
function listChapters(options = {}) {
  const { language = "en", page, per_page } = options;
  return contentGet("/chapters", _clean({ language, page, per_page }));
}

/**
 * Get a single chapter by number (1–114).
 * @param {number} chapterNumber
 * @param {string} [language="en"]
 */
function getChapter(chapterNumber, language = "en") {
  return contentGet(`/chapters/${chapterNumber}`, { language });
}

/**
 * Get extended chapter info (tafsir-style intro text).
 * @param {number} chapterNumber
 * @param {string} [language="en"]
 */
function getChapterInfo(chapterNumber, language = "en") {
  return contentGet(`/chapters/${chapterNumber}/info`, { language });
}

// ─────────────────────────────────────────────────────────────────
// VERSES
// ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} VerseOptions
 * @property {string}  [language="en"]       Word-by-word translation language
 * @property {boolean} [words=false]         Include word-by-word data
 * @property {string}  [translations]        Comma-separated translation IDs (e.g. "131,85")
 * @property {number}  [audio]               Recitation ID for per-verse audio URLs
 * @property {string}  [tafsirs]             Comma-separated tafsir IDs
 * @property {string}  [fields]              Comma-separated verse fields (e.g. "text_uthmani")
 * @property {string}  [word_fields]         Comma-separated word fields
 * @property {string}  [translation_fields]  Comma-separated translation fields
 * @property {number}  [page=1]              Page number for pagination
 * @property {number}  [per_page=10]         Results per page (max 50)
 */

/**
 * Get verses for a chapter (1–114).
 * @param {number} chapterNumber
 * @param {VerseOptions} [options]
 */
function getVersesByChapter(chapterNumber, options = {}) {
  return contentGet(`/verses/by_chapter/${chapterNumber}`, _verseParams(options));
}

/**
 * Get verses for a Madani Mushaf page (1–604).
 * @param {number} pageNumber
 * @param {VerseOptions} [options]
 */
function getVersesByPage(pageNumber, options = {}) {
  return contentGet(`/verses/by_page/${pageNumber}`, _verseParams(options));
}

/**
 * Get verses for a Juz (1–30).
 * @param {number} juzNumber
 * @param {VerseOptions} [options]
 */
function getVersesByJuz(juzNumber, options = {}) {
  return contentGet(`/verses/by_juz/${juzNumber}`, _verseParams(options));
}

/**
 * Get a specific verse by key, e.g. "2:255" (Ayat al-Kursi).
 * @param {string} verseKey  format "chapter:verse" e.g. "1:1"
 * @param {VerseOptions} [options]
 */
function getVerseByKey(verseKey, options = {}) {
  return contentGet(`/verses/by_key/${verseKey}`, _verseParams(options));
}

/**
 * Get a random verse.
 * @param {VerseOptions} [options]
 */
function getRandomVerse(options = {}) {
  return contentGet("/verses/random", _verseParams(options));
}

/** Normalise verse query params – strip undefined keys */
function _verseParams(options) {
  const {
    language = "en",
    words,
    translations,
    audio,
    tafsirs,
    fields,
    word_fields,
    translation_fields,
    tafsir_fields,
    page,
    per_page,
  } = options;

  return _clean({
    language,
    words,
    translations,
    audio,
    tafsirs,
    fields,
    word_fields,
    translation_fields,
    tafsir_fields,
    page,
    per_page,
  });
}

// ─────────────────────────────────────────────────────────────────
// AUDIO
// ─────────────────────────────────────────────────────────────────

/**
 * List all chapter-level reciters.
 * @param {string} [language="en"]
 */
function listChapterReciters(language = "en") {
  return contentGet("/resources/chapter_reciters", { language });
}

/**
 * Get a single chapter's audio file for a reciter.
 * Returns audio_url (direct MP3 link) + optional timestamps.
 *
 * @param {number} reciterId     Chapter reciter ID (from listChapterReciters)
 * @param {number} chapterNumber 1–114
 * @param {boolean} [segments=false] Include word-level timing segments
 */
function getChapterAudio(reciterId, chapterNumber, segments = false) {
  return contentGet(
    `/chapter_recitations/${reciterId}/${chapterNumber}`,
    segments ? { segments: true } : {}
  );
}

/**
 * Get all 114 chapter audio files for a reciter.
 * @param {number} reciterId
 */
function getAllChapterAudios(reciterId) {
  return contentGet(`/chapter_recitations/${reciterId}`);
}

/**
 * List all verse-level recitations (for per-ayah audio).
 * @param {string} [language="en"]
 */
function listRecitations(language = "en") {
  return contentGet("/resources/recitations", { language });
}

/**
 * Get per-ayah audio URLs for an entire chapter.
 * Recitation IDs come from listRecitations().
 *
 * @param {number} recitationId  Verse-level recitation ID
 * @param {number} chapterNumber 1–114
 */
function getAyahRecitationsForChapter(recitationId, chapterNumber) {
  return contentGet(
    `/recitations/${recitationId}/by_chapter/${chapterNumber}`
  );
}

/**
 * Get per-ayah audio URLs for a Juz.
 * @param {number} recitationId
 * @param {number} juzNumber 1–30
 */
function getAyahRecitationsForJuz(recitationId, juzNumber) {
  return contentGet(
    `/recitations/${recitationId}/by_juz/${juzNumber}`
  );
}

/**
 * Get per-ayah audio URL for a single verse.
 * @param {number} recitationId
 * @param {string} verseKey  e.g. "1:1"
 */
function getAyahRecitation(recitationId, verseKey) {
  return contentGet(
    `/recitations/${recitationId}/by_ayah/${verseKey}`
  );
}

// ─────────────────────────────────────────────────────────────────
// TRANSLATIONS & TAFSIRS (resource lookups)
// ─────────────────────────────────────────────────────────────────

/**
 * List all available translations with their IDs.
 * Pass the ID to getVersesByChapter({ translations: "131" }).
 * @param {string} [language="en"]
 */
function listTranslations(language = "en") {
  return contentGet("/resources/translations", { language });
}

/**
 * Get a specific translation for a chapter.
 * @param {number} translationId
 * @param {number} chapterNumber
 */
function getChapterTranslation(translationId, chapterNumber) {
  return contentGet(
    `/quran/translations/${translationId}`,
    { chapter_number: chapterNumber }
  );
}

/**
 * List all available tafsirs with their IDs.
 * Pass the ID to getVersesByChapter({ tafsirs: "169" }).
 * @param {string} [language="en"]
 */
function listTafsirs(language = "en") {
  return contentGet("/resources/tafsirs", { language });
}

/**
 * Get tafsir for a full chapter.
 * @param {number} tafsirId
 * @param {number} chapterNumber
 */
function getChapterTafsir(tafsirId, chapterNumber) {
  return contentGet(`/tafsirs/${tafsirId}/by_chapter/${chapterNumber}`);
}

/**
 * Get recitation info (name, style, etc.) for a recitation ID.
 * @param {number} recitationId
 */
function getRecitationInfo(recitationId) {
  return contentGet(`/resources/recitation_styles`, {});
}

// ─────────────────────────────────────────────────────────────────
// JUZ
// ─────────────────────────────────────────────────────────────────

/**
 * List all 30 Juz with their verse ranges.
 */
function listJuzs() {
  return contentGet("/juzs");
}

// ─────────────────────────────────────────────────────────────────
// QURAN (full text by script)
// ─────────────────────────────────────────────────────────────────

/**
 * Get Quran verses by script type.
 * @param {"uthmani"|"imlaei"|"uthmani_simple"|"imlaei_simple"} [script="uthmani"]
 * @param {number} [chapterNumber]  Optional: filter to a single chapter
 */
function getQuranScript(script = "uthmani", chapterNumber) {
  return contentGet(
    `/quran/verses/${script}`,
    _clean({ chapter_number: chapterNumber })
  );
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

/** Remove undefined/null keys so they don't appear as "undefined" in query strings */
function _clean(obj) {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  );
}

module.exports = {
  // Chapters
  listChapters,
  getChapter,
  getChapterInfo,

  // Verses
  getVersesByChapter,
  getVersesByPage,
  getVersesByJuz,
  getVerseByKey,
  getRandomVerse,

  // Audio
  listChapterReciters,
  getChapterAudio,
  getAllChapterAudios,
  listRecitations,
  getAyahRecitationsForChapter,
  getAyahRecitationsForJuz,
  getAyahRecitation,

  // Translations & Tafsirs
  listTranslations,
  getChapterTranslation,
  listTafsirs,
  getChapterTafsir,
  getRecitationInfo,

  // Juz
  listJuzs,

  // Quran script
  getQuranScript,
};
