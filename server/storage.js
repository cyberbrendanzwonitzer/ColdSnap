const fs = require("fs/promises");
const path = require("path");
const config = require("./config");

const emptyStore = {
  leads: [],
  clients: [],
  waivers: [],
  bookings: [],
  events: []
};

let writeQueue = Promise.resolve();

async function ensureStoreFile() {
  const storeDir = path.dirname(config.dataFilePath);
  await fs.mkdir(storeDir, { recursive: true });

  try {
    await fs.access(config.dataFilePath);
  } catch {
    await fs.writeFile(config.dataFilePath, JSON.stringify(emptyStore, null, 2), "utf8");
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(config.dataFilePath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    ...emptyStore,
    ...parsed
  };
}

async function writeStore(store) {
  await fs.writeFile(config.dataFilePath, JSON.stringify(store, null, 2), "utf8");
}

function withStore(mutator) {
  const run = writeQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });

  writeQueue = run.catch(() => undefined);
  return run;
}

async function ensureStorageReady() {
  await ensureStoreFile();
}

async function getStoreSnapshot() {
  return readStore();
}

module.exports = {
  ensureStorageReady,
  withStore,
  getStoreSnapshot
};
