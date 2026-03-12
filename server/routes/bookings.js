const express = require("express");
const { createBookingIntent } = require("../services/operations");

const router = express.Router();

router.post("/intent", async (req, res, next) => {
  try {
    const result = await createBookingIntent(req.body || {});
    res.status(201).json({
      ok: true,
      message: "Booking intent created",
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
