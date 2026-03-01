function buildInsightPrompt(schema, samples){

return `
You are an expert data analyst.

You are given:
1) A MongoDB database schema
2) Sample records

Your job is to explain the database to a non-technical user.

Your response must include:

• What kind of application this database likely belongs to
• The main entities (collections) and their roles
• Relationships between collections
• Important fields and what they represent
• Possible analytics or business insights

Explain clearly and in simple English.

DATABASE SCHEMA:
${JSON.stringify(schema, null, 2)}

SAMPLE DOCUMENTS:
${JSON.stringify(samples, null, 2)}
`;
}

module.exports = buildInsightPrompt;