const embed = require("./geminiEmbedder");

let COLLECTION_VECTORS = [];

function humanize(text){
    return text
        .replace(/([a-z])([A-Z])/g,'$1 $2')
        .replace(/_/g,' ')
        .toLowerCase();
}

function describeField(field, info){

    if(field === "_id") return "_id: unique identifier";

    if(info.refers_to)
        return `${field}: reference to ${info.refers_to} collection`;

    const type = typeof info === "string" ? info : info.type;
    const name = humanize(field);

    if(type === "date")
        return `${field}: date and time when ${name} occurred`;

    if(type === "number"){
        if(name.includes("amount") || name.includes("price") || name.includes("total"))
            return `${field}: monetary value`;
        return `${field}: numeric value`;
    }

    if(type === "string"){
        if(name.includes("email")) return `${field}: email address`;
        if(name.includes("name")) return `${field}: person's name`;
        if(name.includes("city")) return `${field}: city name`;
        if(name.includes("status")) return `${field}: record status`;
        return `${field}: text information`;
    }

    return `${field}: ${type}`;
}

function buildCollectionDescription(collectionName, schema){

    let text = `Collection ${collectionName}. `;
    text += `Stores ${collectionName} records.\nFields:\n`;

    for(const field in schema){
        text += "- " + describeField(field, schema[field]) + "\n";
    }

    return text;
}


async function buildCollectionIndex(schema){

    COLLECTION_VECTORS = [];

    for(const collection in schema){

        const description = buildCollectionDescription(collection, schema[collection]);
        const embedding = await embed(description);

        COLLECTION_VECTORS.push({
            collection,
            schema: schema[collection],
            embedding
        });

        console.log("Indexed:", collection);
    }

    console.log("Semantic schema index ready");
}



function cosineSimilarity(a,b){
    let dot=0, magA=0, magB=0;

    for(let i=0;i<a.length;i++){
        dot += a[i]*b[i];
        magA += a[i]*a[i];
        magB += b[i]*b[i];
    }

    return dot/(Math.sqrt(magA)*Math.sqrt(magB));
}



async function getRelevantCollections(question, topK=6){

    const qEmbedding = await embed(question);

    const scored = COLLECTION_VECTORS.map(c => ({
        collection: c.collection,
        schema: c.schema,
        score: cosineSimilarity(qEmbedding, c.embedding)
    }));

    scored.sort((a,b)=>b.score-a.score);

    const filteredSchema = {};
    scored.slice(0,topK).forEach(c=>{
        filteredSchema[c.collection] = c.schema;
    });

    return filteredSchema;
}

module.exports = { buildCollectionIndex, getRelevantCollections };