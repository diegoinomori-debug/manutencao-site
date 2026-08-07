MIYAMA APPROVAL AUTO V29

Novidades:
- 作成者 (criador) é gravado automaticamente pelo login.
- Ao salvar relatório novo, ele entra em 点検待ち automaticamente.
- 点検者 só pode usar o botão se tiver canInspect.
- 点検 grava automaticamente nome, UID, email, data e horário no Firestore.
- 承認者 só pode usar o botão se tiver canApprove.
- 承認 exige que o relatório já tenha sido inspecionado.
- 承認 grava automaticamente nome, UID, email, data e horário.
- 点検 e 承認 são salvos imediatamente, sem precisar clicar em Salvar depois.
- Campos de 点検/承認 continuam somente leitura.
- O histórico de ponto/horário aparece no relatório.
- firestore.rules foi reforçado para proteger os campos de auditoria.

INSTALAÇÃO
1. Copie src/App.jsx para seu projeto.
2. Mantenha src/firebase.js e src/components/LoginScreen.jsx da V28 (também estão neste pacote).
3. Rode:
   npm run build
4. Depois rode:
   npm run dev
5. Teste primeiro localmente com o usuário admin.

DEPOIS DO TESTE:
- Publique o conteúdo de firestore.rules em Firebase > Firestore > Regras.
- Depois faça git push.

Git:
git add src/App.jsx src/firebase.js src/components/LoginScreen.jsx
git commit -m "Automatiza inspecao e aprovacao por usuario logado"
git push
