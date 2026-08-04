MIYAMA AI — STEP 1

1. Copy:
   api/chat.js
   src/services/miyamaAI.js

   into the same folders in your manutencao-site project.

2. OPENAI_API_KEY is already configured in Vercel.

3. Build:
   npm run build

4. Commit:
   git add api/chat.js src/services/miyamaAI.js package.json package-lock.json
   git commit -m "Adiciona backend seguro do MIYAMA AI"
   git push

5. After Vercel deploys, test in PowerShell:

   Invoke-RestMethod `
     -Method Post `
     -Uri "https://manutencao-site-swart.vercel.app/api/chat" `
     -ContentType "application/json" `
     -Body '{"message":"Responda apenas: MIYAMA AI conectado","language":"Portuguese"}'

Expected:
   answer : MIYAMA AI conectado

Do not put OPENAI_API_KEY in App.jsx, firebase.js, or GitHub.
