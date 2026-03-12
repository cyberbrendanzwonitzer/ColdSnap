const express = require("express");
const { captureNewsletterLead } = require("../services/operations");

const router = express.Router();

router.post("/newsletter", async (req, res, next) => {
  try {
    const result = await captureNewsletterLead(req.body || {});
    res.status(201).json({
      ok: true,
      message: "Lead captured",
      ...result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
