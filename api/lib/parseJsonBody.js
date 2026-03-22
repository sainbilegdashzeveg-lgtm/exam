export async function parseJsonBody(req) {
  const any = req.body;
  if (any != null && typeof any === "object" && !Buffer.isBuffer(any)) {
    return any;
  }
  if (Buffer.isBuffer(any)) {
    try {
      return JSON.parse(any.toString("utf8") || "{}");
    } catch {
      return {};
    }
  }
  if (typeof any === "string") {
    try {
      return JSON.parse(any || "{}");
    } catch {
      return {};
    }
  }

  if (typeof req.on !== "function") {
    console.warn("parseJsonBody: req.on missing, cannot read stream");
    return {};
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
