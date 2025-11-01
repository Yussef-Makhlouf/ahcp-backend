const EQUINE_INTERVENTION_CATEGORY_OPTIONS = [
  'Clinical Examination',
  'Surgical Operation',
  'Ultrasonography',
  'Lab Analysis',
  'Farriery'
];

const EQUINE_INTERVENTION_SYNONYM_MAP = {
  // Clinical Examination synonyms
  'routine': 'Clinical Examination',
  'regular': 'Clinical Examination',
  'checkup': 'Clinical Examination',
  'check-up': 'Clinical Examination',
  'follow-up': 'Clinical Examination',
  'followup': 'Clinical Examination',
  'follow up': 'Clinical Examination',
  'clinical examination': 'Clinical Examination',
  'examination': 'Clinical Examination',
  'exam': 'Clinical Examination',
  'inspection': 'Clinical Examination',
  'assessment': 'Clinical Examination',
  'evaluation': 'Clinical Examination',
  'breeding': 'Clinical Examination',

  // Surgical Operation synonyms
  'emergency': 'Surgical Operation',
  'urgent': 'Surgical Operation',
  'operation': 'Surgical Operation',
  'surgery': 'Surgical Operation',
  'surgical operation': 'Surgical Operation',
  'surgical': 'Surgical Operation',
  'procedure': 'Surgical Operation',

  // Ultrasonography synonyms
  'ultrasonography': 'Ultrasonography',
  'ultrasound': 'Ultrasonography',
  'sonography': 'Ultrasonography',
  'imaging': 'Ultrasonography',
  'scan': 'Ultrasonography',

  // Lab Analysis synonyms
  'lab analysis': 'Lab Analysis',
  'laboratory analysis': 'Lab Analysis',
  'laboratory': 'Lab Analysis',
  'lab': 'Lab Analysis',
  'analysis': 'Lab Analysis',
  'diagnostic': 'Lab Analysis',
  'preventive': 'Lab Analysis',
  'prevention': 'Lab Analysis',
  'screening': 'Lab Analysis',

  // Farriery synonyms
  'farriery': 'Farriery',
  'hoof care': 'Farriery',
  'shoeing': 'Farriery',
  'horseshoeing': 'Farriery',
  'blacksmith': 'Farriery'
};

const normalizeToTitleCase = (value = '') => {
  return value
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const normalizeEquineInterventionCategory = (value, options = {}) => {
  const { fallback = '' } = options;
  if (value === undefined || value === null) {
    return fallback;
  }

  const stringValue = value.toString().trim();
  if (!stringValue) {
    return fallback;
  }

  const lowerValue = stringValue.toLowerCase();
  if (EQUINE_INTERVENTION_SYNONYM_MAP[lowerValue]) {
    return EQUINE_INTERVENTION_SYNONYM_MAP[lowerValue];
  }

  const titleCaseValue = normalizeToTitleCase(stringValue);
  if (EQUINE_INTERVENTION_CATEGORY_OPTIONS.includes(titleCaseValue)) {
    return titleCaseValue;
  }

  // Some inputs might already match the desired casing
  if (EQUINE_INTERVENTION_CATEGORY_OPTIONS.includes(stringValue)) {
    return stringValue;
  }

  return fallback;
};

const normalizeEquineInterventionCategoryList = (values = [], options = {}) => {
  const { fallback = '' } = options;
  const normalized = [];

  values.forEach((value) => {
    const normalizedValue = normalizeEquineInterventionCategory(value, { fallback: '' });
    if (normalizedValue) {
      normalized.push(normalizedValue);
    }
  });

  if (normalized.length === 0 && fallback) {
    const normalizedFallback = normalizeEquineInterventionCategory(fallback, { fallback: '' });
    if (normalizedFallback) {
      normalized.push(normalizedFallback);
    }
  }

  return [...new Set(normalized)];
};

module.exports = {
  EQUINE_INTERVENTION_CATEGORY_OPTIONS,
  normalizeEquineInterventionCategory,
  normalizeEquineInterventionCategoryList
};

