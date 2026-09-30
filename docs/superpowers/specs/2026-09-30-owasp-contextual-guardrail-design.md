# Bağlama duyarlı OWASP LLM guardrail tasarımı

Tarih: 2026-09-30

## Amaç ve kapsam

Kullanıcı bir metin yapıştırır, metnin hangi bağlamda kullanılacağını seçer ve OWASP LLM Top 10 2026 başlıkları açısından risk sinyallerini görür. Tek metin yeterlidir; bağlam seçilmezse `user_input` kullanılır. Güvenilir görev ve uygulama bilgileri isteğe bağlıdır. Çıktı, metinde görülen bir sinyali uygulamada doğrulanmış bir güvenlik açığıyla karıştırmaz. E-posta özel bir ürün modu değildir; varsa yalnızca genel `retrieved_content` bağlamına girer.

Kaynak: [OWASP Top 10 for LLM Applications 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/). Jev'in yapılandırılmış `state` ve adlandırılmış `questions` biçimi: [TypeSafe API](https://docs.typesafe.ai/api).

## Girdi ve güven sınırı

Temel API:

```js
evaluateGuardrail({
  text,
  context?: 'user_input' | 'retrieved_content' | 'tool_output' | 'model_output',
  trustedTask?,
  appContext?,
}, { apiKey, baseURL?, model? })
```

- `text` daima incelenen metindir. `trustedTask` yalnızca çağıran uygulamanın ayrı verdiği, doğrulanmış kullanıcı görevidir. Metnin içindeki `DOCUMENT CONTENT` veya benzeri başlıklar güvenilir görev oluşturmaz.
- `appContext` isteğe bağlıdır ve sınırlandırılmış alanlar içerir: `allowedActions` (dizi), `outputSink` (düz metin, HTML, Markdown, shell veya SQL), `referenceFacts` (dizi), `usage` (sayılar: kullanılan token, limit ve istek sayısı), `dependencies` (ad/sürüm/kaynak), `retrieval` (kaynak ve erişim bilgisi). Ham API anahtarı veya sistem promptu Jev'e bağlam olarak gönderilmez. Bu alanlar yoksa bunlara bağlı başlıklar `needs_context` kalır.
- Dört bağlam, aynı metnin neden farklı yorumlanacağını belirler. `user_input` doğrudan kullanıcı isteğini, `retrieved_content` dış kaynağı, `tool_output` araç sonucunu, `model_output` ise üretilmiş cevabı temsil eder. Kullanıcı arayüzü bağlam seçimini açık gösterir; kaynak otomatik tahmin edilmez.
- İstek doğrulaması boş metni, bilinmeyen bağlamı ve aşırı uzun girdiyi reddeder. Jev hatası veya bozuk yanıt `allow` sonucuna çevrilmez.

## OWASP kapsam sözleşmesi

Her başlık için `signal`, `no_signal`, `needs_context` veya `not_applicable` durumu dönülür. Jev olasılığı yalnızca metinde gözlenebilen bir işarete aittir; OWASP açığının gerçekleşme olasılığı olarak sunulmaz. Eksik bağlam `no_signal` sayılmaz.

| OWASP 2026 | Metinle değerlendirilebilen işaret | Doğrulama için ek bağlam |
| --- | --- | --- |
| LLM01 Prompt Injection | Rol taklidi, kural aşma, güvenilmeyen kaynakta görev değiştirme talimatı | Güvenilir görev ve kaynak sınırı |
| LLM02 Sensitive Information Disclosure | Gizli bilgi isteme veya metinde olası sır/PII görünmesi | Gerçek korunan veri ve model çıktısı |
| LLM03 Excessive Agency | Yan etkili/izinsiz araç eylemi talebi | İzinli araçlar ve gerçekleşen çağrılar |
| LLM04 Supply Chain | Şüpheli bağımlılık/model edinme talebi | Bağımlılık envanteri, kaynak ve bütünlük bilgisi |
| LLM05 Data and Model Poisoning | Veri, hafıza veya eğitim içeriğini değiştirme talimatı | İçeriğin kökeni ve ingestion/eğitim yolu |
| LLM06 Unbounded Consumption | Sonsuz döngü veya aşırı kaynak talebi; girdi boyutu | Token, istek, süre ve maliyet telemetrisi |
| LLM07 Misinformation | Doğrulanması gereken olgusal iddia | Güvenilir referans veya kaynak; tek metinden doğrulanmaz |
| LLM08 Hidden Context Exposure | Sistem promptu veya gizli bağlamı açığa çıkarma isteği | Gerçek çıktı ve korunan bağlamın yerel karşılaştırması |
| LLM09 Vector and Embedding Weaknesses | Retrieval manipülasyonu işareti | İndeks, embedding, erişim ve retrieval yapılandırması |
| LLM10 Improper Output Handling | Çıktıda tehlikeli komut, HTML veya kod yükü | Çıktının kullanılacağı gerçek hedef ve escaping/validation yolu |

Bu tablo her başlığı üründe görünür kılar; sonuçta on başlığın tamamı bulunur. Yalnızca metin verilen bir çağrıda doğrulanamayan sistem riskleri `needs_context` kalır. Metin bir saldırıyı *anlatıyorsa* bu, saldırıyı *uyguluyormuş* gibi puanlanmaz.

## Çıktı ve karar

```json
{
  "schema_version": "1.0",
  "framework": "OWASP-LLM-2026",
  "context": "retrieved_content",
  "action": "review",
  "risks": {
    "LLM01": { "status": "signal", "signal_probability": 0.91 },
    "LLM04": { "status": "needs_context", "signal_probability": null }
  },
  "limits": ["Dependency inventory was not supplied"],
  "model": "system-one-v1",
  "usage": {},
  "latency_ms": 0
}
```

`action` yalnızca metni ilgili bağlamda kullanma kararıdır; uygulamanın OWASP'ın tüm başlıklarında güvenli olduğu anlamına gelmez ve tek tek sinyallerin yerine geçmez. İlk sürümde metne uygulanabilir aktif tehdit sinyali ≥ 0,8 ise `block`, 0,4–0,8 arası ise `review`, düşükse `allow` kullanılır; kategoriye göre istisnalar ve yerel doğrulamalar sürümlü politika kodunda açıkça tutulur. `needs_context` otomatik olarak güvenli veya tehlikeli sayılmaz. Özellikle dış içerikte yüksek injection sinyali ayrı görünür; güvenilir görev özetleme olsa bile içerikteki talimatları uygulama izni verilmez. Kullanıcı arayüzü bu ayrımı açık yazar. Jev yalnızca semantik sinyal üretir; izin kontrolü, uzunluk sınırı ve yerel doğrulamalar uygulama kodundadır.

## Seçilen yaklaşım

- On başlığı her metne kör biçimde puanlamak, uygulama bilgisi gerektiren risklerde sahte kesinlik üretir.
- Yalnızca prompt injection değerlendirmek, kullanıcının OWASP kapsamı isteğini karşılamaz.
- Seçilen yaklaşım, bütün başlıkları aynı sonuç şemasında tutar ve gözlenemeyenleri `needs_context` olarak ayırır. Böylece basit metin demosu çalışır; ek bağlam verildiğinde doğrulanabilir başlıklar genişler.

## Mevcut koddan geçiş

1. `src/guard.js` içindeki `retrieved_email` soruları, sabit e-posta özetleme görevi ve `splitDocumentTask` ile metinden görev çıkarma kaldırılır. Ortak bağlam şeması ve ayrı `trustedTask` kullanılır.
2. CLI, yerel web API'si ve demo dört genel bağlamı kullanır. E-posta seçeneği, örneği ve metriği kaldırılır; örnekler kullanıcı mesajı, web/belge parçası, araç çıktısı ve model çıktısını kapsar.
3. Eski LLMail deneyinin 113/120 sonucu genel ürün metriği olarak kullanılmaz. Veri ve atıf araştırma arşivine taşınır, npm paketine konmaz. Ölçümün ana tablosu farklı bağlamlara dağıtılır.
4. npm paket adı ve README, kapsamın prompt injection dışına genişlediğini yansıtacak şekilde yayın öncesi güncellenir. Paket arşivi, sır taraması ve kurulum sonrası CLI/kütüphane denemesi doğrulanır.

## Ölçüm ve kabul ölçütleri

- Dört bağlamda aktif saldırı, meşru iş ve saldırıyı yalnızca alıntılayan metin bulunur. OWASP kategorileri için bağlam gerektiren negatifler `no_signal` değil `needs_context` bekler.
- Bir metnin başına sahte görev/ayraç eklemek değerlendirme bağlamını veya güvenilir görevi değiştiremez; bu senaryo otomatik testte yer alır.
- Birim testleri Jev yanıtından karar politikasını ayırır. Ayrı, isteğe bağlı canlı Jev testleri semantik kaliteyi ölçer; sonuçları model sürümüyle kaydeder.
- Kategori ve bağlam bazında yanlış pozitif/yanlış negatif, abstention oranı, gecikme ve token maliyeti raporlanır. Yeterli, kaynağı belli ve elde tutulmuş örnek olmadan tek bir “genel doğruluk” yüzdesi ilan edilmez.
- `npm test` temiz geçer; paketlenmiş tarball dış bir geçici projede kurulup CLI ve `evaluateGuardrail` export'u çalışır. npm yayımlama, bu kabul ölçütlerinden sonra yapılır.

## Sınırlar

Bu ürün metin ve verilen bağlam üzerinden risk *sinyali* üretir. OWASP'ın uygulama, tedarik zinciri, model, retrieval ve operasyon başlıklarını tek metinden tam denetlediğini iddia etmez. Görsel/ses saldırıları, çalışan ajan araçlarının gözlenmesi ve bağımlılık taraması bu metin arayüzünün dışında kalır.
