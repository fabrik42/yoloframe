const path = require("path");
const cloudinary = require("cloudinary");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const adapter = new FileSync(".data/db.json");
const db = low(adapter);
const fastify = require("fastify")({
  logger: false,
});

db.defaults({}).write();

cloudinary.config({
  cloud_name: process.env.cloudinary_cloud_name,
  api_key: process.env.cloudinary_api_key,
  api_secret: process.env.cloudinary_api_secret,
});

const cache = ((db) => {
  const get = (key, maxAge = 60 * 1000) => {
    const cachedAt = db.get(`${key}_cached_at`).value();
    const cached = db.get(key).value();

    if (cachedAt && cachedAt + maxAge < Date.now()) {
      console.info(`cached, but too old (id: ${key})`);
      return null;
    }

    if (cached !== undefined) {
      console.info(`cache found! (id: ${key})`);
      return cached;
    } else {
      console.info(`cache NOT found! (id: ${key})`);
      return null;
    }
  };

  const set = (key, val) => {
    db.set(key, val).write();
    db.set(`${key}_cached_at`, Date.now()).write();
  };

  return {
    set: set,
    get: get,
  };
})(db);

const loadLatestImageFromToday = () => {
  return cloudinary.v2.api.resources({
    resource_type: "image",
    max_results: 10,
    direction: "desc",
  });
}

const loadFavoriteImages = () => {
  return cloudinary.v2.api.resources_by_tag("fav", {
    resource_type: "image",
  });
}

fastify.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
});

fastify.get("/", function (request, reply) {
  reply.sendFile("index.html");
});

fastify.get("/uploader", function (request, reply) {
  reply.sendFile("uploader.html");
});

fastify.get("/latest", function (request, reply) {
  const cached = cache.get('latest');
  if (cached) reply.send(cached);

  loadLatestImageFromToday()
    .then((result) => {
      cache.set('latest', result);
      reply.send(result);
    })
    .catch((error) => {
      reply.send({ error: error });
    });
});

fastify.get("/favs", function (request, reply) {
  const cached = cache.get('favs');
  if (cached) reply.send(cached);

  loadFavoriteImages()
    .then((result) => {
      cache.set('favs', result);
      reply.send(result);
    })
    .catch((error) => {
      reply.send({ error: error });
    });
});

fastify.listen(process.env.PORT, "0.0.0.0", function (err, address) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log(`Your app is listening on ${address}`);
  fastify.log.info(`server listening on ${address}`);
});
