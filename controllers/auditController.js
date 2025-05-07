const axios = require("axios");
const whois = require("whois-json");
const cheerio = require("cheerio");
const https = require("https");
const { URL } = require("url"); // Import the URL constructor to parse URLs
const puppeteer = require("puppeteer");
const { log } = require("console");

exports.getPageSpeedData = async (req, res) => {
  const { url, strategy } = req.body;

  if (!url) {
    return res.status(400).json({ message: "URL is required" });
  }

  try {
    const response = await axios.get(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&key=${process.env.GOOGLE_API_KEY}`
    );

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching PageSpeed Insights data" });
  }
};

exports.whoisLookup = async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: "Domain is required." });

  try {
    const data = await whois(url);
    res.json(data);
    console.log(data); // Log the WHOIS data to check the fetched data
  } catch (err) {
    res.status(500).json({ error: "WHOIS lookup failed." });
    console.error(err);
  }
};

exports.metataganalysis = async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  try {
    const response = await axios.get(url);
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
    console.error("Error analyzing meta tags:", error.message);
    res.status(500).json({ error: "Failed to analyze meta tags" });
  }
};

exports.headingstructure = async (req, res) => {
  const { url } = req.body;

  if (!url || !url.startsWith("http")) {
    return res.status(400).json({ error: "Invalid or missing URL" });
  }

  try {
    const response = await axios.get(url);
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
    parsedUrl = new URL(siteUrl);
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
  log("URL:", siteUrl); // Log the URL to check if it's being received correctly

  if (!siteUrl) return res.status(400).json({ error: "Domain is required" });

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const url = `https://openlinkprofiler.org/r/${siteUrl}`;
    await page.goto(url, { waitUntil: "networkidle2" });

    // Wait for backlinks table
    await page.waitForSelector("#backlinktable tbody tr", { timeout: 60000 });

    const backlinks = await page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll("#backlinktable tbody tr")
      );
      return rows.slice(0, 10).map((row) => {
        const cells = row.querySelectorAll("td");
        return {
          source: cells[1]?.innerText?.trim(),
          anchor: cells[2]?.innerText?.trim(),
          linkType: cells[4]?.innerText?.trim(),
        };
      });
    });

    await browser.close();
    res.json({ domain, backlinks });
  } catch (err) {
    console.error("Scraping error:", err.message);
    res.status(500).json({ error: "Failed to fetch backlinks." });
  }
};
