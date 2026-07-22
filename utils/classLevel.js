/**
 * Utility: class level detection and grading logic
 * Primary (Nursery/Creche/KG/Primary/Basic): CA(40) + Exam(60)
 * Secondary (JSS/SSS): CA1(20) + CA2(20) + Exam(60)
 */

const PRIMARY_KEYWORDS = [
  'nursery', 'creche', 'kg', 'kindergarten', 'toddler',
  'basic', 'primary', 'pry', 'reception', 'grade',
  'pre-nursery', 'prenursery', 'pre nursery', 'playgroup',
];

function getClassLevel(className) {
  if (!className) return 'secondary';
  const name = className.toLowerCase();
  if (PRIMARY_KEYWORDS.some(k => name.includes(k))) return 'primary';
  if (/^p\s*\d/.test(name)) return 'primary';
  return 'secondary';
}

function getGradeInfo(total, className) {
  const level = getClassLevel(className);
  if (level === 'primary') {
    if (total >= 90) return { grade: 'A+', remark: 'Excellent' };
    if (total >= 80) return { grade: 'A',  remark: 'Excellent' };
    if (total >= 75) return { grade: 'B+', remark: 'Very Good' };
    if (total >= 70) return { grade: 'B',  remark: 'Very Good' };
    if (total >= 65) return { grade: 'C+', remark: 'Good' };
    if (total >= 60) return { grade: 'C',  remark: 'Fairly Good' };
    if (total >= 55) return { grade: 'D+', remark: 'Fair / Average' };
    if (total >= 50) return { grade: 'D',  remark: 'Fair / Average' };
    if (total >= 40) return { grade: 'E',  remark: 'Average' };
    return            { grade: 'F',  remark: 'Weak' };
  }
  // JSS / SSS
  if (total >= 75) return { grade: 'A1', remark: 'Excellent' };
  if (total >= 70) return { grade: 'B2', remark: 'Very Good' };
  if (total >= 65) return { grade: 'B3', remark: 'Good' };
  if (total >= 60) return { grade: 'C4', remark: 'Credit' };
  if (total >= 55) return { grade: 'C5', remark: 'Credit' };
  if (total >= 50) return { grade: 'C6', remark: 'Credit' };
  if (total >= 45) return { grade: 'D7', remark: 'Pass' };
  if (total >= 40) return { grade: 'E8', remark: 'Pass' };
  return            { grade: 'F9', remark: 'Fail' };
}

function getScoreStructure(className) {
  const level = getClassLevel(className);
  if (level === 'primary') {
    return { ca1Label: 'CA', ca1Max: 40, ca2Label: '', ca2Max: 0, examMax: 60, hasCa2: false, level: 'primary' };
  }
  return { ca1Label: '1st CA', ca1Max: 20, ca2Label: '2nd CA', ca2Max: 20, examMax: 60, hasCa2: true, level: 'secondary' };
}

module.exports = { getClassLevel, getGradeInfo, getScoreStructure };
