function buildUserPrompt(dbName, schema, question) {

return `
DATABASE NAME:
${dbName}

DATABASE SCHEMA:
${JSON.stringify(schema, null, 2)}

USER QUESTION:
${question}

Generate the MongoDB query now.
`;
}

module.exports = buildUserPrompt;