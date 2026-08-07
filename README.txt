MIYAMA LOGIN + APPROVAL V28

Files:
- src/App.jsx
- src/firebase.js
- src/components/LoginScreen.jsx
- firestore.rules
- USER_PROFILES.txt

Roles:
operator  = create/edit reports, submit for inspection
inspector = operator + inspection (点検)
approver  = inspector + approval (承認)
admin     = all permissions

IMPORTANT:
Before installing App.jsx, enable Firebase Email/Password and create at least one Authentication user.
Then create a Firestore document users/{UID} for that account.

After replacing files:
npm run build

Then:
git add src/App.jsx src/firebase.js src/components/LoginScreen.jsx
git commit -m "Adiciona login e permissoes de inspecao e aprovacao"
git push

After testing login, publish the Firestore rules from firestore.rules.
