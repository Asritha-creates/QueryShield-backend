function convertDates(obj) {
  if (!obj || typeof obj !== "object") return obj;

  for (const key in obj) {

    const value = obj[key];
    if (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)
    ) {
      obj[key] = new Date(value);
    }
    else if (typeof value === "object") {
      convertDates(value);
    }
  }

  return obj;
}

module.exports = convertDates;