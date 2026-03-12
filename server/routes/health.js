const express = require("express");
const config = require("../config");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "cryochamber-api",
    dataMode: config.dataMode,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
