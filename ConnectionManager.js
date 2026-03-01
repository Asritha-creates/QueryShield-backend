const { MongoClient } = require("mongodb");
const { v4: uuidv4 } = require("uuid");

const connections = new Map();
async function createConnection(connectionString) {
    const client = new MongoClient(connectionString);
    await client.connect();

    const id = uuidv4();

    connections.set(id, {
        client,
        createdAt: Date.now()
    });

    return id;
}
function getConnection(id) {
    return connections.get(id);
}

async function closeConnection(id) {
    const conn = connections.get(id);
    if (!conn) return;

    await conn.client.close();
    connections.delete(id);
}

module.exports = {
    createConnection,
    getConnection,
    closeConnection
};