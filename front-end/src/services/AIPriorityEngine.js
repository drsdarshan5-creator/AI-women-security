// Simple heuristic AI Priority Engine
// Evaluates incident reports and SOS activations to produce a severity score and rank
// Rank: 'Critical' | 'High' | 'Medium' | 'Low'

/**
 * Example usage:
 * const { evaluateReport } = require('./services/AIPriorityEngine');
 * const result = evaluateReport({ title, description, location, timestamp, attachments, isAnonymous });
 */

const MS_PER_HOUR = 1000 * 60 * 60;

// Simulated historical crime density grid or lookup. In production, replace with real data/service.
// This function returns a crime rate (0..1) for a given { latitude, longitude } or for a string address.
async function getHistoricalCrimeRate(location) {
  // If location has coords, use a deterministic pseudo-random density based on coordinates
  try {
    if (location && typeof location === 'object' && typeof location.latitude === 'number') {
      const seed = Math.abs(Math.floor(location.latitude * 1000) + Math.floor(location.longitude * 1000));
      const val = ((seed % 100) / 100.0);
      // bias towards some moderate rates
      return Math.min(0.95, Math.max(0.02, 0.2 + val * 0.6));
    }
  } catch (e) {
    // fallback
  }
  // For address strings, hash string length
  if (typeof location === 'string') {
    const len = location.length;
    const v = (len % 50) / 50;
    return Math.min(0.9, Math.max(0.01, 0.15 + v * 0.6));
  }
  // default low
  return 0.1;
}

function timeOfDayRiskFactor(ts = Date.now()) {
  const date = new Date(ts);
  const hour = date.getHours();
  // higher risk late night / early morning
  if (hour >= 22 || hour < 5) return 1.4; // +40%
  if (hour >= 18 || hour < 7) return 1.15; // evening
  if (hour >= 7 && hour < 10) return 1.05; // morning commute mild increase
  return 1.0; // daytime baseline
}

function attachmentSupportFactor(attachments = []) {
  if (!attachments || attachments.length === 0) return 0.8; // slightly lower confidence
  if (attachments.length === 1) return 1.0;
  return 1.15; // multiple attachments increases confidence
}

function descriptionDetailFactor(description = '') {
  const len = (description || '').trim().length;
  if (len <= 30) return 0.7;
  if (len <= 120) return 0.95;
  return 1.15;
}

function sosSpecificFactor(isSOS = false) {
  return isSOS ? 1.5 : 1.0; // SOSs are higher priority by design
}

function assignRank(score) {
  // score expected in 0..100
  if (score >= 75) return 'Critical';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

async function evaluateBase({ title, description, location, timestamp, attachments = [], isSOS = false }) {
  // get crime rate baseline 0..1
  const crimeRate = await getHistoricalCrimeRate(location);
  const timeMul = timeOfDayRiskFactor(timestamp);
  const attachMul = attachmentSupportFactor(attachments);
  const descMul = descriptionDetailFactor(description);
  const sosMul = sosSpecificFactor(isSOS);

  // base severity is crimeRate scaled to 0..100
  const base = Math.round(crimeRate * 100);

  // combine multiplicatively but normalize to 0..100
  let weighted = base * timeMul * attachMul * descMul * sosMul;

  // apply some caps and transform
  weighted = Math.min(98, Math.max(2, weighted));

  // small adjustments for keywords in title/description
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  const keywordsCritical = ['shoot', 'stab', 'gun', 'weapon', 'kidnap', 'assault', 'rape', 'fire'];
  const keywordsHigh = ['attack', 'fight', 'robbery', 'hit', 'bleeding'];

  let keywordBoost = 0;
  for (const k of keywordsCritical) if (text.includes(k)) keywordBoost += 18;
  for (const k of keywordsHigh) if (text.includes(k)) keywordBoost += 10;

  // recentness factor: reports with very recent timestamps (within 1 hour) get bump
  const ageHours = Math.max(0, (Date.now() - (timestamp || Date.now())) / MS_PER_HOUR);
  const recentBoost = ageHours <= 1 ? 10 : ageHours <= 6 ? 4 : 0;

  let score = Math.round(weighted + keywordBoost + recentBoost);
  score = Math.min(100, Math.max(0, score));

  const rank = assignRank(score);

  const factors = {
    crimeRate,
    timeMul,
    attachMul,
    descMul,
    sosMul,
    keywordBoost,
    recentBoost,
    base,
    weighted: Math.round(weighted),
  };

  const reasons = [];
  if (score >= 75) reasons.push('High crime rate area and multiple risk indicators.');
  if (keywordBoost > 0) reasons.push('Violence-related keywords detected in report.');
  if (attachments && attachments.length > 0) reasons.push('Media attached supports verification.');
  if (ageHours <= 1) reasons.push('Reported very recently — likely ongoing incident.');

  return { score, rank, factors, reasons };
}

async function evaluateReport(report) {
  // report: { title, description, location, timestamp, attachments }
  return evaluateBase({ ...report, isSOS: false });
}

async function evaluateSOS(sosSession) {
  // sosSession: { trigger, coords, timestamp, attachments }
  const title = 'SOS Activation';
  const description = `SOS triggered via ${sosSession.trigger || 'unknown'}.` + (sosSession.note ? ` ${sosSession.note}` : '');
  const location = sosSession.coords || sosSession.location || null;
  const timestamp = sosSession.timestamp || Date.now();
  const attachments = sosSession.attachments || [];
  return evaluateBase({ title, description, location, timestamp, attachments, isSOS: true });
}

module.exports = {
  evaluateReport,
  evaluateSOS,
  // export helpers in case callers want to inspect factors
  getHistoricalCrimeRate,
  timeOfDayRiskFactor,
};
