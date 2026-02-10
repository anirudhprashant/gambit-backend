const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;
const LEADS_FILE = path.join(__dirname, 'leads.json');
const PDF_FILE = path.join(__dirname, 'public', 'odoo-checklist.pdf');

// CORS: allow all origins for now
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure leads file exists
if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, '[]');
}

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// API: Submit lead
app.post('/api/lead', (req, res) => {
  const { email, source = 'popup' } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  // Avoid duplicates
  if (leads.find(l => l.email === email)) {
    return res.status(200).json({ success: true, message: 'Already subscribed' });
  }

  const lead = { email, source, created_at: new Date().toISOString() };
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));

  console.log('New lead:', lead);
  res.json({ success: true, message: 'Lead saved' });
});

// API: Download PDF
app.get('/api/checklist.pdf', async (req, res) => {
  // If PDF already exists, serve it
  if (fs.existsSync(PDF_FILE)) {
    return res.sendFile(PDF_FILE);
  }

  // Otherwise generate on the fly (first request)
  try {
    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    // Load the HTML template
    const htmlPath = path.join(__dirname, 'templates', 'checklist.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Save PDF for future
    fs.mkdirSync(path.dirname(PDF_FILE), { recursive: true });
    fs.writeFileSync(PDF_FILE, pdfBuffer);

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="odoo-checklist.pdf"' });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gambit backend listening on port ${PORT}`);
});
