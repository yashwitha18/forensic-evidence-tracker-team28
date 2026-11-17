TC-API-01 to TC-API-04
Test	Expected	Actual	Result
Kiran logs in	200	200	Pass
Kiran transfers evidence 1 to Divya	201	201, custodyId 4	Pass
Kiran transfers again	403 (not holder)	403	Pass
Admin logs in and tries to transfer	403 (role)	403	Pass
Request with no login	401	401	Pass
Audit records the actor	user_id 4 on the transfer	user_id 4 on UPDATE evidence	Pass


## TC-API-05: Evidence intake upload

- Input: Kiran (custodian) uploads `sample.txt` with caseId 1 and evidenceTypeId 1.
- Expected: 201 with evidenceId and SHA-256 fileHash; file stored in `vault/` named by hash; evidence row with holder = collector.
- Actual: 201, evidenceId 4, fileHash 050a6d48f2cd556a2de7f011a1a930eb71d7fbf1e78bc93fbabdc936386234d0; `vault/050a6d...bin` created; evidence 4 has current_holder_id 4 and status COLLECTED.
- Result: Pass.

## README fresh-clone check

- Cloned the repo into an empty folder and checked out `sprint3/yashwitha-demo`.
- Ran `npm install`, created `.env.local`, rebuilt `forensic_test` with the seven SQL files in order (no ERROR lines).
- Ran `npm run dev`. Logged in as Kiran (CUSTODIAN); home page and `/evidence` loaded with seeded data.
- Result: Pass.