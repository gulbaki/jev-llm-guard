# Contextual OWASP Guardrail Implementation Plan

**Goal:** Jev ile dört metin bağlamını değerlendiren, OWASP LLM 2026'nın on başlığını görünür kılan genel guardrail ve canlı demo.

**Architecture:** Girdi doğrulaması, Jev soru üretimi ve yerel karar politikası ayrı modüllerdir. Bağlam ve güvenilir görev metnin dışından gelir. API, CLI ve demo aynı sözleşmeyi kullanır.

**Tech Stack:** Node.js >=20, ES modules, TypeSafe SDK, node:test, mevcut yerel HTTP sunucusu.

**Spec:** ../specs/2026-09-30-owasp-contextual-guardrail-design.md

## Global Constraints

- `user_input`, `retrieved_content`, `tool_output`, `model_output`; varsayılan `user_input`.
- On OWASP kategorisi; `signal`, `no_signal`, `needs_context`, `not_applicable` durumları.
- Sinyal eşikleri: 0.4 review, 0.8 block; misinformation insan incelemesi gerektirir.
- API anahtarı sunucuda kalır; metin içindeki ayraçlar güven sınırını değiştirmez.
- E-posta ürün modu kaldırılır; LLMail verisi araştırma arşivinde tutulur ve npm paketine girmez.

## Review Focus

- Sahte görev başlığı kaynak bağlamını değiştiremez.
- Bozuk Jev cevabı ve ağ hatası `allow` üretemez.
- Eksik uygulama bilgisi yanlış bir güvenli sonucuna dönüşemez.
- HTML/komut içeren çıktılar tarayıcıda çalıştırılmadan gösterilir.
- Test raporunda başarısız API çağrıları başarı oranından sessizce çıkarılmaz.

## Task 1: Ortak guardrail sözleşmesi ve Jev değerlendirmesi

Files: `src/context.js`, `src/policy.js`, `src/guard.js`, `src/index.js`, `test/guard.test.js`.

Produces: `evaluateGuardrail(input, options)`; input `{text, context?, trustedTask?, appContext?}`. `evaluateText(text, options)` aynı sonuç şemasını döndüren uyumluluk girişidir.

- [x] Dört bağlam, eşik sınırları, eksik bağlam, bozuk cevap, girdi limitleri ve sahte başlık için başarısız testleri yazıp çalıştır.
- [x] Girdiyi doğrula; Jev'e yapılandırılmış state gönder; on risk ve action üret.
- [x] `node --test test/guard.test.js` çalıştır; PASS beklenir.

## Task 2: CLI, API ve Türkçe demo

Files: `src/cli.js`, `src/web-server.js`, `web/index.html`, `web/app.js`, `web/style.css`, ilgili testler.

Consumes: Task 1'in input ve result sözleşmesi.

- [x] CLI bağlam/görev ve HTTP doğrulama testlerini önce çalıştırıp başarısızlığı doğrula.
- [x] `--context=...`, `--task=...`; demo bağlam seçimi, güvenilir görev, isteğe bağlı JSON uygulama bilgisi, on kategori ve ham JSON sonucu.
- [x] API/CLI testlerini çalıştır; PASS beklenir.

## Task 3: Bağlam ölçümü, araştırma arşivi ve paket

Files: `src/research-cases.js`, `src/research-eval.js`, `bin/jev-research-eval.js`, `src/scenarios.js`, `research/legacy-llmail/`, README, package metadata, benchmark testleri.

Consumes: Task 1 değerlendirme sonucu. Produces: kaynak ve uyarlama etiketi bulunan 120 bağlam vakası, bağlam/kategori bazında hata ve abstention metriği, JSON raporu.

- [x] Ölçümde bağlam aktarımı, yanlış pozitif/negatif ve API hatası testlerini önce çalıştır.
- [x] Eski corpus'u arşivle; dört bağlama 30'ar açık etiketli senaryo ve çoklu bağlam karşılaştırmaları ekle.
- [x] `npm test`; opt-in canlı Jev ölçümü; `npm pack` ile dış projede import/CLI smoke denemesi. Paketlenmiş sır veya araştırma arşivi bulunmaması gerekir.

## Execution

Kullanıcı bu oturumda yazmaya başlamayı istedi; görevler bu oturumda uygulanır. `.git` yazmaya kapalı olduğu için commit adımları yürütülemez; kaynak ve testler çalışma alanında korunur. Planın onay adımını tekrar istemek yerine kullanıcının doğrudan uygulama talimatı izlenir.

## Verification ledger

- Task 1: RED→GREEN; final keyless suite 38 pass / 1 live skip.
- Task 2: API/CLI tests pass; live browser model-output example returns BLOCK and displays ten risks.
- Task 3: final development benchmark 117/120, 3 false positives, 0 false negatives, 0 API errors; tarball excludes .env and archived research.
- Ruling: the user directly requested execution; proceeded in this session. No Git history exists and .git is read-only, so no commits or worktree were made.
- Ruling: safe_to_execute is an advisory compatibility score; category signals and exhausted declared usage budgets determine action. A text sink cannot execute output payloads, so LLM10 is not_applicable there.
- Ruling: npm name jev-guard belongs to leepokai; prepared the available jev-llm-guard name. Package remains unpublished.
- Final review: independent reviewer found malformed-URL crash, weak auxiliary response shapes, and stale scenario help. All fixed; the two behavior defects have RED→GREEN regression tests.
- Ruling: independent real-world generalization was not judged; authored development results are labelled explicitly and do not establish a held-out accuracy claim.
