const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Mock Store Apps
app.get('/api/apps', (req, res) => {
  res.json([
    {
      id: "davbot-ai",
      name: "Davbot AI Pro",
      category: "SaaS / IA",
      description: "Assistant IA Ultra Pro intégrant GPT-4o, Claude 3.5 Sonnet & Google Gemini Pro.",
      badge: "Premium HD",
      icon: "fa-brain-circuit",
      techs: ["Gemini", "ChatGPT", "Claude"],
      link: "#"
    },
    {
      id: "saas-sos",
      name: "SaaS SOS Emergency",
      category: "Outils Développeur",
      description: "Système de monitoring et d'intervention d'urgence pour infrastructures Web3 & Cloud.",
      badge: "Ultra Pro",
      icon: "fa-shield-heart",
      techs: ["Node.js", "Express", "Vercel"],
      link: "#"
    }
  ]);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur prêt sur le port ${PORT}`);
});
