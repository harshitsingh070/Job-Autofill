// Shared across content.js, popup.js, options.js
// (loaded as a plain script, so it just defines globals)

// `var` (not `const`) so this file can be re-injected safely on demand
// without throwing "Identifier has already been declared".
var PROFILE_SCHEMA = [
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

// Rules are evaluated in this order; the first matching key wins. More
// specific keys must stay above generic ones (name fields are last).
var BUILTIN_PATTERNS = {
  email: [/\be\s*mail\b/, /\bemail\b/, /\bmail\s*id\b/],
  phone: [/\bphone\b/, /\bmobile\b/, /\bcontact\s*(number|no)\b/, /\btelephone\b/, /\btel\b/],
  addressLine2: [/address\s*line\s*2/, /address\s*2\b/, /\bapt\b/, /\bsuite\b/, /\bunit\b/, /\bflat\b/],
  addressLine1: [/address\s*line\s*1/, /address\s*1\b/, /street\s*address/, /\bstreet\b/, /\baddress\b/],
  city: [/\bcity\b/, /\btown\b/, /\blocality\b/],
  state: [/\bstate\b/, /\bprovince\b/, /\bregion\b/],
  zipCode: [/\bzip\b/, /postal\s*code/, /pin\s*code/, /\bpost\s*code\b/],
  country: [/\bcountry\b/],
  linkedin: [/linked\s*in/],
  github: [/git\s*hub/],
  portfolio: [/portfolio/, /personal\s*(website|site)/, /\bwebsite\b/, /\bhomepage\b/],
  university: [/university/, /\bcollege\b/, /institution/, /\bschool\b/, /\balma\s*mater\b/],
  degree: [/\bdegree\b/, /\bqualification\b/],
  major: [/\bmajor\b/, /field\s*of\s*study/, /speciali[sz]ation/, /\bbranch\b/, /\bdiscipline\b/, /\bstream\b/],
  graduationYear: [/graduation/, /grad\s*year/, /year\s*of\s*passing/, /passing\s*year/],
  gpa: [/\bgpa\b/, /\bcgpa\b/, /grade\s*point/, /\bmarks\b/, /\bpercentage\b/],
  currentCompany: [/\bcompany\b/, /\bemployer\b/, /organi[sz]ation/],
  currentTitle: [/\bjob\s*title\b/, /\btitle\b/, /\bdesignation\b/, /\bposition\b/, /\brole\b/],
  yearsExperience: [/years?\s*of\s*experience/, /\bexperience\s*(in\s*)?years?\b/, /\b(no|number)\s*of\s*years?\b/, /\btotal\s*experience\b/, /\byrs?\s*(of)?\s*(exp|experience)\b/, /\byears?\s*(experience|exp)\b/, /\bexp\s*(years?|yrs?)\b/],
  resumeUrl: [/resume\s*(link|url)/, /cv\s*(link|url)/, /link\s*to\s*(your\s*)?(resume|cv)/],
  resumeFile: [/resume\s*(file|upload|attachment|document)/, /upload\s*(your\s*)?(resume|cv)/, /attach\s*(your\s*)?(resume|cv)/, /curriculum\s*vitae/, /\bresume\b/, /\bcv\b/],
  coverLetterText: [/cover\s*letter/],
  workAuthorization: [/work\s*authori[sz]/, /authori[sz]ed\s*to\s*work/, /legally\s*(eligible|allowed)/, /eligible\s*to\s*work/, /right\s*to\s*work/, /work\s*permit/],
  sponsorshipRequired: [/sponsor\s*ship/, /require\s*visa/, /visa\s*sponsor/],
  noticePeriod: [/notice\s*period/],
  availableStartDate: [/start\s*date/, /available\s*(from|date)/, /available\s*to\s*start/, /availability\s*(date|to\s*start|to\s*join)/, /joining\s*date/, /when\s*can\s*you\s*start/, /earliest\s*(start|available)/],
  salaryExpectation: [/salary/, /stipend/, /compensation/, /\bctc\b/, /expected\s*pay/],
  gender: [/\bgender\b/, /\bsex\b/],
  veteranStatus: [/veteran/],
  disabilityStatus: [/disabilit/],

  // Name fields placed at the end so e.g. "Company Name" doesn't falsely match fullName
  firstName: [/first\s*name/, /given\s*names?/, /\bfname\b/],
  lastName: [/last\s*name/, /sur\s*name/, /family\s*names?/, /\blname\b/],
  fullName: [/full\s*name/, /applicant\s*name/, /^name$/, /\bname\b/]
};

// If any of these match, the key is disqualified even when an include pattern
// matched. This stops "Company name" from being filled with your full name.
var NEGATIVE_PATTERNS = {
  addressLine1: [/line\s*2/, /address\s*2\b/, /\bapt\b/, /\bsuite\b/, /\bunit\b/, /\bflat\b/],
  addressLine2: [/line\s*1\b/, /address\s*1\b/],
  phone: [/country\s*code/, /\bext(ension)?\b/, /phone\s*type/],
  country: [/country\s*code/, /country\s*of\s*birth/, /country\s*of\s*citizenship/, /citizenship\s*country/],
  state: [/^state\s+(your|the|current|expected|notice|reason)/, /employment\s*status/, /marital\s*status/],
  email: [/email\s*(me|updates?|alerts?|newsletter)/],
  portfolio: [/company\s*(website|site)/, /employer\s*(website|site)/],
  currentCompany: [/company\s*(size|type|website|url|location|address)/, /employer\s*(website|url|location|address)/],
  currentTitle: [/\bmr\b/, /\bmrs\b/, /\bms\b/, /\bmx\b/, /\bdr\b/, /\bprefix\b/, /\bsuffix\b/, /honorific/, /salutation/, /position\s*(type|level)/],
  university: [/\bhigh\s*school/, /\bsecondary\s*school/],
  yearsExperience: [/experience\s*(letter|certificate|summary|description)/],
  gpa: [/disabilit/, /percentage\s*of\s*(time|work)/],
  resumeFile: [/resume\s*(link|url)/, /cv\s*(link|url)/, /resume\s*(summary|objective|description|text)/, /cv\s*(summary|objective|text|content)/],
  salaryExpectation: [/salary\s*(currency|type)/, /current\s*salary/],
  workAuthorization: [/work\s*permit\s*(number|no)/],
  availableStartDate: [/employment\s*(start|end)\s*date/, /previous\s*(job|employment)/],
  disabilityStatus: [/percentage/],
  firstName: [/last\s*name/, /sur\s*name/, /family\s*name/, /full\s*name/, /middle\s*name/, /company/, /user\s*name/, /username/, /display\s*name/, /nick\s*name/],
  lastName: [/first\s*name/, /given\s*name/, /full\s*name/, /middle\s*name/, /company/, /user\s*name/, /username/, /display\s*name/, /nick\s*name/],
  fullName: [/first\s*name/, /last\s*name/, /sur\s*name/, /family\s*name/, /middle\s*name/, /maiden\s*name/, /preferred\s*name/, /pronunciation/, /company/, /organi[sz]ation/, /employer/, /user\s*name/, /username/, /display\s*name/, /account\s*name/, /file\s*name/, /nick\s*name/, /mother/, /father/, /spouse/, /guardian/, /emergency/, /reference/, /recruiter/, /supervisor/, /name\s*of\s*(the\s*)?(file|project|company|school|college|university|course|degree|position|role|organi[sz]ation|employer|bank|card)/, /\bcard\b/, /\bbank\b/, /school/, /university/, /college/, /course/, /degree/, /project/, /product/]
};

// HTML autocomplete tokens (normalized: hyphens become spaces), mapped to
// profile keys. Tokens are checked longest-first so "given name" wins over
// "name".
var AUTOCOMPLETE_MAP = {
  "given name": "firstName",
  "family name": "lastName",
  "name": "fullName",
  "email": "email",
  "tel": "phone",
  "tel national": "phone",
  "street address": "addressLine1",
  "address": "addressLine1",
  "address line 1": "addressLine1",
  "address line 2": "addressLine2",
  "address line 3": "addressLine2",
  "address level 2": "city",
  "address level 1": "state",
  "postal code": "zipCode",
  "country": "country",
  "country name": "country",
  "organization": "currentCompany",
  "organization title": "currentTitle",
  "job title": "currentTitle",
  "url": "portfolio",
  "website": "portfolio"
};

// Aliases used to match profile values against <select> option text/values.
var COUNTRY_ALIASES = {
  "us": "united states",
  "usa": "united states",
  "u s": "united states",
  "u s a": "united states",
  "america": "united states",
  "united states of america": "united states",
  "uk": "united kingdom",
  "u k": "united kingdom",
  "great britain": "united kingdom",
  "britain": "united kingdom",
  "england": "united kingdom",
  "scotland": "united kingdom",
  "wales": "united kingdom",
  "uae": "united arab emirates",
  "u a e": "united arab emirates",
  "in": "india",
  "ind": "india",
  "bharat": "india",
  "republic of india": "india",
  "ca": "canada",
  "au": "australia",
  "de": "germany",
  "fr": "france",
  "sg": "singapore",
  "nz": "new zealand",
  "za": "south africa",
  "kr": "south korea",
  "ie": "ireland",
  "it": "italy",
  "es": "spain",
  "nl": "netherlands",
  "se": "sweden",
  "jp": "japan",
  "cn": "china",
  "br": "brazil",
  "mx": "mexico",
  "korea": "south korea",
  "republic of korea": "south korea",
  "korea south": "south korea",
  "russia": "russian federation",
  "vietnam": "viet nam",
  "czech republic": "czechia"
};

var IN_STATE_ABBREVIATIONS = {
  "andhra pradesh": "ap", "arunachal pradesh": "ar", assam: "as", bihar: "br",
  chhattisgarh: "cg", goa: "ga", gujarat: "gj", haryana: "hr",
  "himachal pradesh": "hp", jharkhand: "jh", karnataka: "ka", kerala: "kl",
  "madhya pradesh": "mp", maharashtra: "mh", manipur: "mn", meghalaya: "ml",
  mizoram: "mz", nagaland: "nl", odisha: "od", orissa: "od", punjab: "pb",
  rajasthan: "rj", sikkim: "sk", "tamil nadu": "tn", telangana: "ts", tripura: "tr",
  "uttar pradesh": "up", uttarakhand: "uk", "west bengal": "wb",
  delhi: "dl", "new delhi": "dl", chandigarh: "ch", puducherry: "py",
  "jammu and kashmir": "jk", ladakh: "la", "andaman and nicobar islands": "an",
  "dadra and nagar haveli": "dn", daman: "dd", diu: "dd", lakshadweep: "ld"
};

var US_STATE_ABBREVIATIONS = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
  kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo",
  montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh",
  oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy",
  "district of columbia": "dc"
};

if (typeof module !== "undefined") {
  module.exports = {
    PROFILE_SCHEMA,
    BUILTIN_PATTERNS,
    NEGATIVE_PATTERNS,
    AUTOCOMPLETE_MAP,
    COUNTRY_ALIASES,
    US_STATE_ABBREVIATIONS,
    IN_STATE_ABBREVIATIONS
  };
}
