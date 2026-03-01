const express = require('express');
const cors = require('cors');
//const { MongoClient, UUID } = require("mongodb");
//const { getClient } = require('./mongoConnection');
const { parseSchema } = require('mongodb-schema');
const {simplifySchema,buildReferenceMap}  = require('./schemaformatter');
const askGemini = require('./ai/gemini-connection');
askGroq = require('./ai/groq-connection');
const sysPrompt = require('./ai/systemprompt');
const session = require('express-session');
const buildUserPrompt = require('./ai/userPrompt');
const toMongoQueryString = require('./utils/queryToMongoString');
const { createConnection, getConnection, closeConnection } = require('./ConnectionManager');
const convertDates = require('./utils/convertDates');
const {buildCollectionIndex,getRelevantCollections}=require('./ai/retrieval/collectionSelector')
//const regex = require('regex');
const buildInsightPrompt = require('./ai/insightPrompt');
const app = express();
app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    key: 'session_cookie_name', 
    secret: process.env.secret || 'default_secret_key', 
    
    resave: false,
    saveUninitialized: false,
    
    cookie: {
        maxAge: 60 * 60 * 1000, 
        httpOnly: true, 
        secure: process.env.NODE_ENV === 'production' 
    }
}));

require('dotenv').config();


async function getCollectionSamples(db, schema){

    const samples = {};

    for(const collection in schema){
        samples[collection] = await db.collection(collection)
            .find({})
            .limit(5)
            .toArray();
    }

    return samples;
}

const PORT = 5000;
app.get('/', (req, res) => {
    res.send('Hello World!');
});


app.post("/ai-insights", async (req, res) => {

    try {

        if (!req.session.connectionId) {
            return res.status(401).json({ error: "No active database session." });
        }

        const conn = getConnection(req.session.connectionId);

        if (!conn) {
            return res.status(401).json({ error: "Session expired. Reconnect database." });
        }

        const db = conn.client.db(req.session.dbName);
        const schema = req.session.schema;

        // Step 1: sample documents
        const samples = await getCollectionSamples(db, schema);

        // Step 2: build AI analysis prompt
        const prompt = buildInsightPrompt(schema, samples);

        // Step 3: call Gemini
        const insight = await askGemini(
            "You are a database analysis expert.",
            prompt
        );

        res.json({
            success: true,
            insights: insight
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "Failed to generate database insights"
        });
    }
});
app.post('/create-connection', async (req, res) => {

    const { connectionString, dbName } = req.body;
    console.log(`${connectionString} and ${dbName}`)
    if (!connectionString || !dbName) {
        return res.status(400).json({
            success: false,
            message: "connectionString and dbName required"
        });
    }

    try {

        // create and store connection
        const connectionId = await createConnection(connectionString);

        const conn = getConnection(connectionId);
        const client = conn.client;

        // READ ONLY CHECK
        const adminDb = client.db("admin");
        const status = await adminDb.command({ connectionStatus: 1 });

        const roles = status.authInfo.authenticatedUserRoles;
        const allowedRoles = ["read", "readAnyDatabase"];

        const isReadOnly = roles.every(role =>
            allowedRoles.includes(role.role)
        );

        if (!isReadOnly) {
            await closeConnection(connectionId);
            return res.status(403).json({
                success: false,
                message: "Provided database user is NOT read-only."
            });
        }

        // GET SCHEMA
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        const finalSchema = {};
        const collectionSamples = {};

// Step 1 — collect sample docs
    for (const c of collections) {
     const docs = await db.collection(c.name).find().limit(100).toArray();
    collectionSamples[c.name] = docs;
    }

// Step 2 — build foreign key map
const referenceMap = buildReferenceMap(collectionSamples);

        for (const c of collections) {
            const sampleDocs = db.collection(c.name).find().limit(100);
            const rawSchema = await parseSchema(sampleDocs);
            const simplified = simplifySchema(rawSchema, referenceMap);
            finalSchema[c.name] = simplified;
        }

        // STORE ONLY SAFE DATA IN SESSION
        req.session.connectionId = connectionId;
        req.session.dbName = dbName;
        req.session.schema = finalSchema;
await buildCollectionIndex(finalSchema);
        req.session.queries = [];

       const expiry = Date.now() + (60 * 60 * 1000); // same as cookie maxAge
    req.session.expiry = expiry;

    res.json({
    success: true,
    message: "Read-only connection verified",
    collections: finalSchema,
    sessionExpiry: expiry
    });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: "Failed to connect. Check URI or IP whitelist."
        });
    }
});
app.get("/query/:id", async (req, res) => {

    const queryId = req.params.id;

    const record = req.session.queries.find(q => q.id === queryId);
    if (!record) return res.status(404).json({ error: "Query not found" });

    const conn = getConnection(req.session.connectionId);
    const db = conn.client.db(req.session.dbName);

    const aiQuery = record.queryPlan;
    const col = db.collection(aiQuery.collection);

    let result;

    switch (aiQuery.operation) {
        case 'count':
            result = await col.countDocuments(aiQuery.query || {});
            break;
        case 'aggregate':
            result = await col.aggregate(aiQuery.pipeline || []).toArray();
            break;
        default:
            result = await col.find(aiQuery.query || {})
                .project(aiQuery.projection || {})
                .sort(aiQuery.sort || {})
                .limit(Math.min(aiQuery.limit || 20, 50))
                .toArray();
    }

    res.json({
        question:record.question,
        mongoQuery: record.mongoQuery,
        data: result,
        explanation: record.explanation
    });
});
app.post("/ai-query", async (req, res) => {

    const { question } = req.body;

    if (!req.session.connectionId) {
        return res.status(401).json({ error: "No active database session." });
    }

    try {

        const conn = getConnection(req.session.connectionId);

        if (!conn) {
            return res.status(401).json({ error: "Session expired. Reconnect database." });
        }

        const dbName = req.session.dbName;
        const fullSchema = req.session.schema;
        const schema = await getRelevantCollections(question, 6);
        //console.log(`Relevant collections are ${JSON.stringify(schema)}`)
        const db = conn.client.db(dbName);

        const userPrompt = buildUserPrompt(dbName, schema, question);
        let aiRaw = await askGemini(sysPrompt, userPrompt);
        //const aiRaw = await askGroq(sysPrompt, userPrompt);

        console.log("Gemini RAW:", aiRaw);
        aiRaw = aiRaw
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();

        let aiQuery = JSON.parse(aiRaw);
        aiQuery=convertDates(aiQuery)
        aiQuery.queryPlan=convertDates(aiQuery.queryPlan)

        const col = db.collection(aiQuery.collection);
        let result;

        switch (aiQuery.operation) {
            case 'count':
                result = await col.countDocuments(aiQuery.query || {});
                break;

            case 'aggregate':
                result = await col.aggregate(aiQuery.pipeline || []).toArray();
                break;

            default:
                result = await col.find(aiQuery.query || {})
                    .project(aiQuery.projection || {})
                    .sort(aiQuery.sort || {})
                    .limit(Math.min(aiQuery.limit || 20, 50))
                    .toArray();
        }

        const queryId = Date.now().toString();

        const mongoString = toMongoQueryString(aiQuery);

        // store history WITH id
        req.session.queries.push({
            id: queryId,
            question,
            mongoQuery: mongoString,
            queryPlan: aiQuery,
            resultCount: Array.isArray(result) ? result.length : result,
            explanation: aiQuery.explanation,
            time: new Date().toLocaleString()
        });

        res.json({
            success: true,
            queryId: queryId,
            queryPlan: aiQuery,
            mongoQuery: mongoString,
            data: result,
            explanation: aiQuery.explanation
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            error: "AI failed to generate query"
        });
    }
});
app.post("/logout", async (req, res) => {

    if (req.session.connectionId) {
        await closeConnection(req.session.connectionId);
    }

    req.session.destroy(() => {
        res.clearCookie("session_cookie_name");
        res.json({ message: "Logged out successfully" });
    });
});
app.get("/history", (req, res) => {

    if (!req.session || !req.session.queries) {
        return res.json({ history: [] });
    }

    res.json({
        history: req.session.queries
    });
});

app.get("/download/csv", (req, res) => {

    if (!req.session.queries || req.session.queries.length === 0) {
        return res.status(400).json({ error: "No query history found" });
    }

    const dbName = req.session.dbName;
    const queries = req.session.queries;

    let csv = "";

    // Header section
    csv += `Database: ${dbName}\n`;
    csv += `Generated At: ${new Date().toLocaleString()}\n`;
    csv += `\n`;

    // Table header
    csv += "Time,Question,Generated Mongo Query,Result Count\n";

    // Rows
    queries.forEach(q => {

        const question = `"${q.question.replace(/"/g, '""')}"`;
        const query = `"${q.mongoQuery.replace(/"/g, '""')}"`;

        csv += `${q.time},${question},${query},${q.explanation},${q.resultCount}\n`;
    });

    res.header("Content-Type", "text/csv");
    res.attachment("NLDB_Query_Report.csv");
    res.send(csv);
});
app.get("/session", (req, res) => {

    if (!req.session.connectionId) {
        return res.json({
            connected: false
        });
    }

    res.json({
        connected: true,
        databaseName: req.session.dbName,
        expiry:req.session.expiry
    });
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});