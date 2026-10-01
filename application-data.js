const APPLICATION_FIELDS = {
  teaching: {
    teaching: ['fullName', 'phone', 'email', 'position', 'campus', 'subjects', 'availability'],
    teachingQualifications: [
      'highestQualification',
      'institution',
      'yearCompleted',
      'licence',
      'yearsExperience',
      'employer',
      'experience',
      'motivation',
    ],
    teachingDeclaration: ['declaration', 'confirmed'],
  },
  'non-teaching': {
    nonTeaching: ['fullName', 'phone', 'email', 'position', 'campus', 'availability', 'startDate'],
    nonTeachingExperience: [
      'education',
      'certificates',
      'yearsExperience',
      'employer',
      'skills',
      'experience',
      'motivation',
    ],
    nonTeachingDeclaration: ['declaration', 'confirmed'],
  },
  student: {
    student: ['fullName', 'dateOfBirth', 'currentGrade', 'campus'],
    parent: ['fullName', 'relationship', 'phone', 'email'],
  },
};

function pickApplicationFields(source, fields) {
  const output = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return output;
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) output[field] = source[field];
  }
  return output;
}

function sanitizeApplicationForms(type, forms) {
  const schema =
    type === 'teaching-staff'
      ? APPLICATION_FIELDS.teaching
      : type === 'non-teaching-staff'
      ? APPLICATION_FIELDS['non-teaching']
      : APPLICATION_FIELDS.student;
  return Object.fromEntries(
    Object.entries(schema).map(([section, fields]) => [
      section,
      pickApplicationFields(forms[section], fields),
    ])
  );
}

function hasApplicationContact(source) {
  return ['phone', 'email'].some((field) => String(source?.[field] || '').trim());
}

function isValidApplicationEmail(value) {
  const email = String(value || '').trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = { sanitizeApplicationForms, hasApplicationContact, isValidApplicationEmail };
