const express = require("express");
const router = express.Router();
const {
  getPageSpeedData,
  whoisLookup,
  metataganalysis,
  headingstructure,
  httpsCheck,
  backlinkAnalysis,
} = require("../controllers/auditController");

// Define the route for SEO audit
router.post("/seo-audit", getPageSpeedData);
router.post("/whois", whoisLookup);
router.post("/metataganalysis", metataganalysis);
router.post("/headingstructure", headingstructure);
router.post("/httpscheck", httpsCheck);
router.post("/backlinkanalysis", backlinkAnalysis);

module.exports = router;
