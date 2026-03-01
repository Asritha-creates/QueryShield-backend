function toMongoQueryString(plan) {

    if (!plan || !plan.collection) return "Invalid Query";

    const col = `db.${plan.collection}`;

    switch (plan.operation) {

        case "count":
            return `${col}.countDocuments(${JSON.stringify(plan.query || {})})`;

        case "aggregate":
            return `${col}.aggregate(${JSON.stringify(plan.pipeline || [])})`;

        case "find":
        default:
            let query = `${col}.find(${JSON.stringify(plan.query || {})})`;

            if (plan.projection && Object.keys(plan.projection).length)
                query += `.project(${JSON.stringify(plan.projection)})`;

            if (plan.sort && Object.keys(plan.sort).length)
                query += `.sort(${JSON.stringify(plan.sort)})`;

            if (plan.limit)
                query += `.limit(${plan.limit})`;

            return query;
    }
}

module.exports = toMongoQueryString;