const redis = require("redis");

async function createRedisClient() {
  const client = redis.createClient({
    url: process.env.REDIS_URL || "redis://localhost:6379",
  });

  client.on("error", (err) => {
    console.error("Redis Client Error:", err.message);
  });

  client.on("connect", () => {
    console.log("Connected to Redis successfully");
  });

  try {
    await client.connect();
    return client;
  } catch (err) {
    console.error("Redis Connection Failed:", err.message);
    process.exit(1);
  }
}

const redisClientPromise = createRedisClient();

module.exports = {
  getRedisClient: async () => {
    return await redisClientPromise;
  },
};
