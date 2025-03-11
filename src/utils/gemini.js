const GEMINI_API_KEY = 'AIzaSyBy9cF4mrwkzNJvtR7Za_QbRInZxpjSDRs';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;

export async function processTranscriptWithGemini(transcript) {
  if (!transcript || transcript.trim().length === 0) {
    throw new Error('Transcript is empty. Please ensure you spoke during the recording.');
  }

  try {
    console.log('Processing transcript with Gemini...');
    const prompt = `Please analyze this lecture transcript and provide:
1. Fixed transcript without enhancing it~/My/K/virtual-classroom-emotion-detection ❯ npm run build        11s  base 02:02:34 AM

> virtual-classroom-emotion-detection@0.0.0 build
> vite build

vite v6.2.1 building for production...
src/utils/alerts.js (78:28): "firestore" is not exported by "node_modules/firebase/app/dist/index.esm.js", imported by "src/utils/alerts.js".
✓ 2637 modules transformed.
dist/index.html                              0.46 kB │ gzip:   0.29 kB
dist/assets/index-DiFYg5Ca.css              18.61 kB │ gzip:   4.29 kB
dist/assets/purify.es-Ci5xwkH_.js           21.76 kB │ gzip:   8.59 kB │ map:    89.65 kB
dist/assets/index.es-B9IwVpQQ.js           158.54 kB │ gzip:  53.09 kB │ map:   638.07 kB
dist/assets/html2canvas.esm-DadlvMMh.js    202.35 kB │ gzip:  48.07 kB │ map:   603.22 kB
dist/assets/index-D2fk8vl7.js            2,185.14 kB │ gzip: 606.39 kB │ map: 6,672.29 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 5.03s
2. A concise summary
3. Key points covered
4. Any areas that might need clarification
5. Suggestions for improvement

Transcript:
${transcript}`;

    console.log('Sending request to Gemini API...');
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Gemini API error response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Received response from Gemini API');

    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      console.error('Unexpected Gemini API response format:', data);
      throw new Error('Invalid response format from Gemini API');
    }

    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error('Error processing transcript with Gemini:', error);
    if (error.message.includes('API key')) {
      throw new Error('Invalid Gemini API key. Please check your configuration.');
    }
    if (error.message.includes('network')) {
      throw new Error('Network error while connecting to Gemini API. Please check your internet connection.');
    }
    throw new Error(`Failed to process transcript: ${error.message}`);
  }
} 