<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">OpenCode tabanlı özelleştirilmiş kurumsal AI R&D web işbirliği platformu.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

## Proje Konumlandırması

Bu depo genel bir masaüstü AI kodlama aracı değil, OpenCode tabanlı özelleştirilmiş kurumsal web AI R&D platformunu tanımlar.

- **Web-first** kurumsal bir üründür; mevcut özelleştirme odağı Web App'tir
- Tek geliştirici yerel kullanımı değil, kurum içi **çok kullanıcılı işbirliği** için tasarlanmıştır
- Kullanıcılar sunucu dizinlerine serbestçe bağlanamaz; **yönetici tarafından kontrol edilen proje sınırları** içinde çalışırlar
- Sadece "AI ile sohbet ederek kod düzenleme" sayfası değil, **birleşik AI platformu yetenekleri** sunar

Şöyle anlaşılabilir:

> Kurum içi kullanım için kontrollü, yönetilebilir, çok kullanıcılı AI R&D çalışma tezgahı.

## Felsefemiz

Platform sadece bir AI kodlama sayfası değil, adım adım kurum içi birleşik AI R&D işbirliği platformu olmayı hedefler.

Temel ilkeler:

- **Uzak masaüstü değil, kontrollü projeler içinde AI çalışma tezgahı**
- **Az sayıda geliştiricinin AI'yı monopolize etmesi değil, daha fazla rolün yetkili kapsamda yazılım üretimine katılması**
- **AI'nın sadece sorulara cevap vermesi değil, AI'nın R&D akışında adım adım yürütme katmanı haline gelmesi**
- **Sınırları kaldırmak değil, izin, proje, oturum ve model yönetiminde verimliliği artırmak**

Ürün tasarımında en önemli üç sınır:

- **Proje sınırı**: Normal kullanıcılar sadece yöneticilerin önceden kaydettiği projelere erişebilir
- **Oturum sınırı**: Bir görev birden fazla bağımsız oturum ve çalışma alanına karşılık gelir
- **İzin sınırı**: Kullanıcıların ne gördüğü, ne yapabildiği ve hangi modelleri kullanabildiği platform tarafından kontrol edilir

## Mevcut Temel Yetenekler

Özelleştirme Web App odaklıdır:

- Çok kullanıcılı kayıt, giriş ve hesap yönetimi
- Yöneticilerin görebildiği kullanıcı, proje, model ve denetim yetenekleri
- Sadece onaylı kod depolarını açmak için proje kaydı
- Oturum bazlı izole çalışma alanları, genellikle Git worktrees kullanarak
- Model, provider, izin ve modun birleşik yönetimi
- Ekipler için birleşik AI platformu giriş noktası

Odak masaüstü veya TUI değil, şunlardır:

> Kurum içi kullanıcıların web üzerinden kontrollü projelerde Q&A, analiz, düzenleme, yürütme ve işbirliği yapmasını sağlamak.

## Çok Kullanıcılar ve Birleşik AI Platformu

Platform giriş yapan herkese tam erişim vermez. Bunun yerine:

1. Yöneticiler sunucuda proje kodunu hazırlar
2. Yöneticiler izin verilen dizinleri proje olarak kaydeder
3. Kullanıcılar web üzerinden kayıt olur ve giriş yapar
4. Normal kullanıcılar sadece kendilerine açılan projeleri görür
5. Kullanıcılar projeye girdikten sonra oturumlarda çalışmaya başlar

Birleşik AI platformu şunları sağlar:

- Birleşik model giriş noktası
- Birleşik provider yönetimi
- Birleşik izin kontrolü
- Birleşik oturum iş akışı
- Birleşik denetim ve yönetim sınırları

Bu tasarım kademeli kurum içi yayılımı destekler: önce düşük riskli izinlerle başlayın, sonra rol ve senaryoya göre genişletin.

## Cursor CLI Desteği

Platform, birleşik AI platformunda **Cursor CLI**'yi model/provider kaynağı olarak destekler.

### Nasıl bağlanır

Sunucu makinesinde Cursor CLI kurulu olmalı ve shell'de `agent` komutu kullanılabilir olmalıdır:

```bash
agent login
```

Giriş sonrası platform mevcut yerel Cursor giriş durumunu yeniden kullanır.

### Platformda kullanım

- Yöneticiler kullanıcıların modele ve provider'a erişip erişemeyeceğini kontrol eder
- Varsayılan kısıtlı kullanıcılar genellikle sadece `ask` moduna sahiptir
- Varsayılan model beyaz listesi genellikle şunları içerir:
  - `cursor-cli/auto`
  - `cursor-cli/composer-1`
  - `cursor-cli/composer-1.5`

Cursor CLI kurulu değilse veya `agent` kullanılamıyorsa, platformda Cursor CLI ile ilgili modeller ve provider'lar görünmez.

### Yapılandırma önerileri

İlk kurum içi yayılım için:

- Varsayılan kısıtlı kullanıcılar: sadece `ask` modu
- Varsayılan model beyaz listesi: `cursor-cli` modellerini tercih edin
- Provider, Server, MCP veya diğer yüksek riskli yönetimi varsayılan olarak açmayın
- Yöneticilerin gerektiğinde kullanıcı veya role göre yetenekleri genişletmesine izin verin

Faydalar:

- Düşük entegrasyon maliyeti
- Net risk sınırları
- Birleşik model kaynağı
- Kurum içi benimseme için basit UX

### Sistemdeki rolü

Cursor CLI bağlandığında platform sadece harici bir model API çağrısı yapmaz. Oturum bağlamını, proje sınırlarını ve platform araçlarını bir araya getirir ve Cursor CLI'ye yürütme için iletir.

Bu nedenle `cursor-cli` burada izole bir araç değil, birleşik AI platformunun bir parçasıdır.

## Yönetici yayılım önerileri

Önerilen yaklaşım:

1. Kontrollü proje dizinlerini hazırlayın
2. Sadece açıkça onaylanmış depoları kaydedin
3. Normal kullanıcılara varsayılan olarak kısıtlı izinler verin
4. Web Q&A ve düşük riskli yeteneklere öncelik verin
5. Kademeli olarak daha fazla model, mod ve iş akışı işlevi ekleyin

Kısaca: her şeyi bir anda açarak değil. Bunun yerine:

> Önce proje, izin, model ve oturum sınırlarını oluşturun, ardından platform yeteneklerini adım adım genişletin.

## Yerel geliştirme

Özelleştirme odağı Web App olduğundan, yerel geliştirme web yığınını başlatmalıdır.

Bağımlılıkları yükleyin:

```bash
bun install
```

Tek komutla başlatma:

```bash
sh restart-services.sh
```

Varsayılan adresler:

- Backend: `http://localhost:4096`
- Frontend: `http://localhost:3000`

Ayrı ayrı başlatmak için:

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/app dev
```

## İlgili dokümantasyon

- `docs/internal-web-user-manual.md`
  - Yöneticiler ve normal kullanıcılar için kullanıcı kılavuzu
- `docs/internal-ai-platform-vision.md`
  - Ekip için ürün vizyonu ve gelecek yönü

Bu belgeler daha ayrıntılıdır ve bu özelleştirilmiş ürünün gerçek hedeflerine daha yakındır.

---

**Mevcut odak**: Web App, çok kullanıcılı, birleşik AI platformu, kontrollü proje işbirliği.
