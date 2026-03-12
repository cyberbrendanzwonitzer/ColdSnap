const express = require("express");
const { signWaiver } = require("../services/operations");

const router = express.Router();

router.post("/sign", async (req, res, next) => {
  try {
    const result = await signWaiver(req.body || {});
    res.status(201).json({
      ok: true,
      message: "Waiver signed",
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
