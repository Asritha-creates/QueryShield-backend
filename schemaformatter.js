

const IGNORED_FIELDS = [
  "_id",
  "__v",
  "password",
  "resetPasswordToken",
  "resetPasswordExpires",
  "googleId"
];

/*const MAX_ENUM_VALUES = 20;
const UNIQUENESS_RATIO = 0.15;*/



function normalizeType(type) {
  if (Array.isArray(type)) type = type[0];

  switch (type) {
    case "String": return "string";
    case "Number": return "number";
    case "Boolean": return "boolean";
    case "Date": return "date";
    case "ObjectId": return "reference";
    case "Array": return "array";
    case "Document": return "object";
    default: return "string";
  }
}


/* ================= VALUE CLASSIFICATION ================= */

/*
We must detect when values are:
- actual categories (enum)
- identifiers (names, emails)
- natural text (comments, descriptions)
*/

/*function looksLikeIdentifier(values) {
  return values.some(v =>
    typeof v === "string" &&
    (
      v.includes("@") ||                        // email
      /^[A-Z][a-z]+ [A-Z][a-z]+/.test(v) ||     // person name
      v.length > 18                             // long identifier strings
    )
  );
}

function looksLikeNaturalText(values) {
  return values.some(v =>
    typeof v === "string" &&
    v.length > 25                               // comments/descriptions
  );
}*/



function buildReferenceMap(collectionSamples) {
  const referenceMap = {};

  for (const [collection, docs] of Object.entries(collectionSamples)) {
    referenceMap[collection] = new Set();

    docs.forEach(doc => {
      if (doc && doc._id) {
        referenceMap[collection].add(String(doc._id));
      }
    });
  }

  return referenceMap;
}

function detectReference(field, referenceMap) {

  if (!field.types || !field.types[0] || !field.types[0].values) return null;

  const values = field.types[0].values.map(v => String(v));

  for (const [collection, idSet] of Object.entries(referenceMap)) {

    let matches = 0;

    values.forEach(val => {
      if (idSet.has(val)) matches++;
    });

    // if most values belong to another collection's _id
    if (matches >= Math.max(2, Math.ceil(values.length * 0.6))) {
      return collection;
    }
  }

  return null;
}


function simplifySchema(mongoSchema, referenceMap = {}) {

  const result = {};

  mongoSchema.fields.forEach(field => {

    if (IGNORED_FIELDS.includes(field.name)) return;

    const type = normalizeType(field.type);

    if (type === "date") {
      result[field.name] = "date";
      return;
    }

    /* ---------- REFERENCE ---------- */
    if (type === "reference") {

      const referredCollection = detectReference(field, referenceMap);

      if (referredCollection) {
        result[field.name] = {
          type: "reference",
          refers_to: referredCollection
        };
      } else {
        result[field.name] = "reference";
      }
      return;
    }
    result[field.name] = type;
  });

  return result;
}

module.exports = {
  simplifySchema,
  buildReferenceMap
};