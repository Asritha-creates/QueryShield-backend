const { MongoClient } = require("mongodb");

let client = null;

async function getClient(uri) {
    if (client && client.topology && client.topology.isConnected()) {
        return client;
    }

    client = new MongoClient(uri, {
        serverSelectionTimeoutMS: 10000
    });

    await client.connect();
    console.log("Mongo Connected");
    return client;
}

module.exports = { getClient };