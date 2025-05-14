const axios = require("axios");
const whois = require("whois-json");
const cheerio = require("cheerio");
const https = require("https");
const { URL } = require("url"); // Import the URL constructor to parse URLs
const puppeteer = require("puppeteer");

exports.getPageSpeedData = async (req, res) => {
  const { url, strategy } = req.body;

  if (!url) {
    return res.status(400).json({ message: "URL is required" });
  }

  try {
    const response = await axios.get(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://${url}&key=${process.env.GOOGLE_API_KEY}`
    );

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching PageSpeed Insights data" });
  }
};

exports.whoisLookup = async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Domain is required." });
  }

  try {
    const data = await whois(url);

    const whoisresult = {
      domainName: data.domainName || null,
      owner: data.registrantOrganization || "Not Available",
      registrar: data.registrar || "Not Available",
    };

    console.log("WHOIS Data:", whoisresult); // log for debugging
    return res.json(whoisresult);
  } catch (err) {
    console.error("WHOIS Error:", err);
    return res.status(500).json({ error: "WHOIS lookup failed." });
  }
};

exports.metataganalysis = async (req, res) => {
  const { url } = req.body;

  try {
    const response = await axios.get(`https://${url}`);
    const $ = cheerio.load(response.data);

    const getMeta = (name) =>
      $(`meta[name="${name}"]`).attr("content") ||
      $(`meta[property="${name}"]`).attr("content") ||
      null;

    const metaData = {
      title: $("title").text() || null,
      description: getMeta("description"),
      keywords: getMeta("keywords"),
      robots: getMeta("robots"),
      ogTitle: getMeta("og:title"),
      ogDescription: getMeta("og:description"),
      ogImage: getMeta("og:image"),
      twitterTitle: getMeta("twitter:title"),
      twitterDescription: getMeta("twitter:description"),
      twitterImage: getMeta("twitter:image"),
      canonical: $("link[rel='canonical']").attr("href") || null,
      viewport: getMeta("viewport"),
      charset: $("meta[charset]").attr("charset") || null,
    };

    res.json({ success: true, meta: metaData });
  } catch (error) {
    console.log("Error analyzing meta tags:", error.message);
    res.status(500).json({ error: "Failed to analyze meta tags" });
  }
};

exports.headingstructure = async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  try {
    const response = await axios.get(`https://${url}`);
    const $ = cheerio.load(response.data);

    const headingTags = [];
    let lastLevel = 0;
    let orderIssues = [];

    for (let i = 1; i <= 6; i++) {
      $(`h${i}`).each((index, el) => {
        const level = i;
        const text = $(el).text().trim();
        headingTags.push({ level, tag: `h${level}`, text });

        if (lastLevel && level > lastLevel + 1) {
          orderIssues.push({
            previous: `h${lastLevel}`,
            current: `h${level}`,
            text,
          });
        }
        lastLevel = level;
      });
    }

    const h1Count = headingTags.filter((h) => h.level === 1).length;

    res.json({
      success: true,
      headingCount: headingTags.length,
      h1Count,
      headings: headingTags,
      orderIssues,
      message:
        h1Count === 0
          ? "No <h1> found"
          : h1Count > 1
          ? "Multiple <h1> tags found"
          : orderIssues.length
          ? "Heading structure has level jumps"
          : "Heading structure looks good",
    });
  } catch (error) {
    console.error("Error validating headings:", error.message);
    res.status(500).json({ error: "Failed to analyze heading tags" });
  }
};

exports.httpsCheck = async (req, res) => {
  const { siteUrl } = req.body;

  if (!siteUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(`https://${siteUrl}`);
  } catch {
    return res.status(400).json({ error: "Invalid URL format" });
  }

  if (parsedUrl.protocol !== "https:") {
    return res.json({
      isHTTPS: false,
      secure: false,
      message: "The site does not use HTTPS.",
    });
  }

  const hostname = parsedUrl.hostname;

  const options = {
    host: hostname,
    port: 443,
    method: "GET",
  };

  const reqTLS = https.request(options, (response) => {
    const cert = response.socket.getPeerCertificate();

    if (!cert || Object.keys(cert).length === 0) {
      return res.json({
        isHTTPS: true,
        secure: false,
        message: "No certificate information found.",
      });
    }

    const validTo = new Date(cert.valid_to);
    const today = new Date();

    const daysLeft = Math.floor((validTo - today) / (1000 * 60 * 60 * 24));

    res.json({
      isHTTPS: true,
      secure: true,
      certificate: {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        daysLeft,
      },
      message:
        daysLeft > 0
          ? `Valid SSL certificate. Expires in ${daysLeft} day(s).`
          : "SSL certificate has expired.",
    });
  });

  reqTLS.on("error", (err) => {
    console.error("HTTPS check error:", err.message);
    res.status(500).json({ error: "Unable to verify HTTPS connection." });
  });

  reqTLS.end();
};

exports.backlinkAnalysis = async (req, res) => {
  const { siteUrl } = req.body;
  console.log("URL:", siteUrl);

  if (!siteUrl) return res.status(400).json({ error: "Domain is required" });

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const url = `https://openlinkprofiler.org/r/http://${siteUrl}`; // Changed to http
    await page.goto(url, { waitUntil: "domcontentloaded" });

    await new Promise((resolve) => setTimeout(resolve, 5000));
    // Give JS time to render table

    try {
      await page.waitForSelector("#backlinktable tbody tr", { timeout: 30000 });
    } catch (selectorError) {
      throw new Error(
        "Backlink table not found. It may not have loaded or the selector is incorrect."
      );
    }

    const backlinks = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#backlinktable tbody tr")
      );
      return rows.slice(0, 10).map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          source: cells[1]?.innerText?.trim() || "N/A",
          anchor: cells[2]?.innerText?.trim() || "N/A",
          linkType: cells[4]?.innerText?.trim() || "N/A",
        };
      });
    });

    await browser.close();
    res.json({ domain: siteUrl, backlinks });
  } catch (err) {
    console.error("Scraping error:", err.message);
    res.status(500).json({ backlinks: "No backlinks found." });
  }
};
