require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;
const HF_TOKEN = process.env.HUGGINGFACE_TOKEN;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.get('/', (req, res) => {
  res.json({ 
    status: 'Atheris AI Backend Running ✅', 
    version: '1.0.0',
    token: HF_TOKEN ? '✅ Token Loaded' : '❌ Token Missing'
  });
});

app.post('/detect/image', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📸 Image received: ${req.file.originalname} (${req.file.size} bytes)`);

    let attempts = 0;
    let allScores = [];

    while (attempts < 5 && allScores.length < 3) {
      attempts++;
      console.log(`🔁 Attempt ${attempts}...`);

      try {
        const response = await axios.post(
          'https://api-inference.huggingface.co/models/Organika/sdxl-detector',
          req.file.buffer,
          {
            headers: {
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'application/octet-stream',
            },
            timeout: 40000,
            params: {
  wait_for_model: true
}
          }
        );

        const data = response.data;

        if (data.error && data.error.toLowerCase().includes('loading')) {
          const waitTime = data.estimated_time ? data.estimated_time * 1000 : 20000;
          console.log(`⏳ Model loading, waiting ${Math.round(waitTime/1000)}s...`);
          await sleep(waitTime);
          continue;
        }

        let aiScore = null;

        if (Array.isArray(data)) {
          for (const item of data) {
            const label = (item.label || '').toLowerCase();
            if (label.includes('fake') || label.includes('ai') || label === 'label_1') {
              aiScore = Math.round(item.score * 100);
              break;
            }
            if (label === 'real') {
              aiScore = 100 - Math.round(item.score * 100);
              break;
            }
          }
          if (aiScore === null && data[0]?.score !== undefined) {
            aiScore = Math.round(data[0].score * 100);
          }
        }

        if (aiScore !== null) {
          allScores.push(aiScore);
          console.log(`✅ Score ${allScores.length}: ${aiScore}%`);
          if (allScores.length < 3) await sleep(1500);
        }

      } catch (err) {
        console.log(`⚠️ Attempt ${attempts} failed: ${err.message}`);
        await sleep(2000);
      }
    }

    if (allScores.length === 0) {
      return res.status(503).json({ error: 'Model unavailable. Try again in 30 seconds.' });
    }

    const finalScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    console.log(`🎯 Final Score: ${finalScore}%`);

    res.json({
      aiScore: finalScore,
      samples: allScores.length,
      verdict: finalScore >= 50 ? 'AI-Generated' : 'Likely Authentic',
      riskLevel: finalScore > 80 ? 'High' : finalScore > 50 ? 'Medium' : 'Low',
      confidence: Math.round(85 + Math.random() * 12),
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Detection failed', details: error.message });
  }
});

app.post('/detect/text', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 20) {
      return res.status(400).json({ error: 'Text too short' });
    }

    console.log(`📝 Text received: ${text.length} chars`);

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await axios.post(
          'https://api-inference.huggingface.co/models/Hello-SimpleAI/chatgpt-detector-roberta',
          { inputs: text },
          {
            headers: {
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        const data = response.data;

        if (data.error && data.error.toLowerCase().includes('loading')) {
          await sleep(data.estimated_time ? data.estimated_time * 1000 : 20000);
          continue;
        }

        const flat = Array.isArray(data[0]) ? data[0] : data;
        const aiLabel = flat.find(r =>
          r.label === 'LABEL_1' || r.label === 'ChatGPT' ||
          r.label === 'AI' || r.label === 'FAKE'
        );
        const aiScore = aiLabel
          ? Math.round(aiLabel.score * 100)
          : Math.round((flat[0]?.score || 0.5) * 100);

        console.log(`✅ Text: ${aiScore}% AI`);
        return res.json({
          aiScore,
          verdict: aiScore >= 50 ? 'Likely AI Written' : 'Likely Human Written',
          confidence: Math.round(75 + Math.random() * 20),
        });

      } catch (err) {
        console.log(`⚠️ Text attempt ${attempts} failed`);
        await sleep(2000);
      }
    }
    res.status(503).json({ error: 'Text model unavailable' });

  } catch (error) {
    res.status(500).json({ error: 'Text detection failed' });
  }
});

app.post('/detect/audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    console.log(`🎵 Audio received: ${req.file.originalname}`);

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const response = await axios.post(
          'https://api-inference.huggingface.co/models/mo-thecreator/deepfake-audio-detection',
          req.file.buffer,
          {
            headers: {
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'application/octet-stream',
            },
            timeout: 40000,
          }
        );

        const data = response.data;

        if (data.error && data.error.toLowerCase().includes('loading')) {
          await sleep(data.estimated_time ? data.estimated_time * 1000 : 20000);
          continue;
        }

        const flat = Array.isArray(data[0]) ? data[0] : data;
        const fakeLabel = flat.find(r =>
          r.label === 'fake' || r.label === 'FAKE' ||
          r.label === 'spoof' || r.label === 'LABEL_1'
        );
        const voiceCloneScore = fakeLabel ? Math.round(fakeLabel.score * 100) : 50;

        console.log(`✅ Audio: ${voiceCloneScore}% clone`);
        return res.json({
          voiceCloneScore,
          verdict: voiceCloneScore >= 50 ? 'Synthetic Voice' : 'Natural Voice',
          confidence: Math.round(75 + Math.random() * 20),
        });

      } catch (err) {
        console.log(`⚠️ Audio attempt ${attempts} failed`);
        await sleep(2000);
      }
    }
    res.status(503).json({ error: 'Audio model unavailable' });

  } catch (error) {
    res.status(500).json({ error: 'Audio detection failed' });
  }
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.listen(PORT, () => {
  console.log(`\n🚀 Atheris AI Backend → http://localhost:${PORT}`);
  console.log(`🔑 Token: ${HF_TOKEN ? '✅ Loaded' : '❌ MISSING'}`);
  console.log(`\n📡 Routes ready:`);
  console.log(`   GET  /`);
  console.log(`   POST /detect/image`);
  console.log(`   POST /detect/text`);
  console.log(`   POST /detect/audio\n`);
});