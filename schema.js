// Shared across content.js, popup.js, options.js
// (loaded as a plain script, so it just defines globals)

const PROFILE_SCHEMA = [
  { key: "firstName", label: "First name", group: "Basics" },
  { key: "lastName", label: "Last name", group: "Basics" },
  { key: "fullName", label: "Full name", group: "Basics" },
  { key: "email", label: "Email", group: "Basics" },
  { key: "phone", label: "Phone number", group: "Basics" },
  { key: "addressLine1", label: "Address line 1", group: "Address" },
  { key: "addressLine2", label: "Address line 2", group: "Address" },
  { key: "city", label: "City", group: "Address" },
  { key: "state", label: "State / Province", group: "Address" },
  { key: "zipCode", label: "ZIP / Postal code", group: "Address" },
  { key: "country", label: "Country", group: "Address" },
  { key: "linkedin", label: "LinkedIn URL", group: "Links" },
  { key: "github", label: "GitHub URL", group: "Links" },
  { key: "portfolio", label: "Portfolio / Website URL", group: "Links" },
  { key: "university", label: "University / College", group: "Education" },
  { key: "degree", label: "Degree (e.g. B.Tech)", group: "Education" },
  { key: "major", label: "Major / Field of study", group: "Education" },
  { key: "graduationYear", label: "Graduation year", group: "Education" },
  { key: "gpa", label: "GPA / CGPA", group: "Education" },
  { key: "currentCompany", label: "Current company", group: "Experience" },
  { key: "currentTitle", label: "Current job title", group: "Experience" },
  { key: "yearsExperience", label: "Years of experience", group: "Experience" },
  { key: "resumeUrl", label: "Resume link (Drive/Dropbox URL)", group: "Documents" },
  { key: "resumeFile", label: "Resume file (PDF / DOC / DOCX)", group: "Documents" },
  { key: "coverLetterText", label: "Cover letter (short, reusable)", group: "Documents" },
  { key: "workAuthorization", label: "Are you authorized to work in this country? (Yes/No)", group: "Eligibility" },
  { key: "sponsorshipRequired", label: "Will you need visa sponsorship? (Yes/No)", group: "Eligibility" },
  { key: "noticePeriod", label: "Notice period", group: "Eligibility" },
  { key: "availableStartDate", label: "Available start date", group: "Eligibility" },
  { key: "salaryExpectation", label: "Expected salary/stipend", group: "Eligibility" },
  { key: "gender", label: "Gender", group: "Demographics (optional)" },
  { key: "veteranStatus", label: "Veteran status", group: "Demographics (optional)" },
  { key: "disabilityStatus", label: "Disability status", group: "Demographics (optional)" }
];

const BUILTIN_PATTERNS = {
  email: [/e[\-\s]?mail/],
  phone: [/phone/, /mobile/, /contact\s*number/, /telephone/],
  addressLine1: [/address\s*line\s*1/, /street\s*address/, /^address$/, /address1/],
  addressLine2: [/address\s*line\s*2/, /apt|suite|unit/, /address2/],
  city: [/\bcity\b/, /\btown\b/],
  state: [/\bstate\b/, /\bprovince\b/, /\bregion\b/],
  zipCode: [/zip/, /postal\s*code/, /pin\s*code/],
  country: [/country/],
  linkedin: [/linkedin/],
  github: [/github/],
  portfolio: [/portfolio/, /personal\s*website/, /\bwebsite\b/],
  university: [/university/, /college/, /institution/, /school/],
  degree: [/degree/, /qualification/],
  major: [/major/, /field\s*of\s*study/, /specialization/, /branch/],
  graduationYear: [/graduation/, /grad\s*year/, /year\s*of\s*passing/],
  gpa: [/gpa/, /cgpa/, /grade\s*point/],
  currentCompany: [/\bcompany\b/, /employer/, /organization/],
  currentTitle: [/\btitle\b/, /designation/, /\brole\b/],
  yearsExperience: [/experience/],
  resumeUrl: [/resume\s*(link|url)/, /cv\s*(link|url)/],
  coverLetterText: [/cover\s*letter/],
  workAuthorization: [/work\s*authoriz/, /authorized\s*to\s*work/, /legally\s*eligible/, /right\s*to\s*work/],
  sponsorshipRequired: [/sponsorship/, /require\s*visa/],
  noticePeriod: [/notice\s*period/],
  availableStartDate: [/start\s*date/, /available\s*from/, /joining\s*date/],
  salaryExpectation: [/salary/, /stipend/, /compensation/, /ctc/],
  gender: [/gender/, /^sex$/],
  veteranStatus: [/veteran/],
  disabilityStatus: [/disability/],

  // Name fields placed at the end so e.g. "Company Name" doesn't falsely match fullName
  firstName: [/first\s*name/, /given\s*name/, /\bfname\b/],
  lastName: [/last\s*name/, /sur\s*name/, /family\s*name/, /\blname\b/],
  fullName: [/full\s*name/, /\bname\b/, /applicant/]
};

if (typeof module !== "undefined") {
  module.exports = { PROFILE_SCHEMA, BUILTIN_PATTERNS };
}
