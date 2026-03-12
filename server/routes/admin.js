const express = require("express");
const { getAdminSnapshot, getAdminBookings } = require("../services/operations");

const router = express.Router();

router.get("/snapshot", async (_req, res, next) => {
  try {
    const snapshot = await getAdminSnapshot();
    res.json({ ok: true, snapshot });
  } catch (error) {
    next(error);
  }
});

router.get("/bookings", async (_req, res, next) => {
  try {
    const result = await getAdminBookings();
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
